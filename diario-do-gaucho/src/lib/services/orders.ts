import "server-only";
import { getDb, q, type Queryable } from "../db";
import { env } from "../env";
import { orderCode, randomToken, sha256 } from "../crypto";
import { createPixCharge, PixNotConfiguredError } from "../pix";
import { getMercadoPagoPayment, type MpPayment } from "../pix/mercadopago";
import { storage } from "../storage";
import type { OrderItemRow, OrderRow } from "../types";
import { isUuid } from "./catalog";
import { downloadFilename } from "./photos";

export class OrderError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const MAX_ITEMS_PER_ORDER = 20;
export const MAX_DOWNLOADS_PER_ITEM = 25;

export interface CreateOrderInput {
  photoIds: string[];
  customerName?: string;
  customerEmail: string;
}

/**
 * Cria um pedido. O preço vem SEMPRE do banco de dados — qualquer valor enviado
 * pelo navegador é ignorado — e fica registrado no item (snapshot) no momento da compra.
 */
export async function createOrder(input: CreateOrderInput): Promise<{ token: string; code: string }> {
  const ids = [...new Set((input.photoIds ?? []).filter(isUuid))];
  if (!ids.length) throw new OrderError("Selecione ao menos uma fotografia.", "no_items");
  if (ids.length > MAX_ITEMS_PER_ORDER) throw new OrderError("Muitas fotografias em um único pedido.", "too_many");
  const email = String(input.customerEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new OrderError("Informe um e-mail válido.", "invalid_email");
  const name = String(input.customerName ?? "").trim().slice(0, 120) || null;

  const photos = await q<{ id: string; price_cents: number; title: string }>(
    `select id, price_cents, title from photos
      where id = any($1::uuid[]) and status='ready' and visibility='public' and deleted_at is null`,
    [ids],
  );
  if (photos.length !== ids.length) {
    throw new OrderError("Alguma fotografia não está mais disponível.", "unavailable", 409);
  }
  const amount = photos.reduce((s, p) => s + p.price_cents, 0);
  const code = orderCode();
  const token = randomToken(32);

  const db = await getDb();
  const orderId = await db.tx(async (t) => {
    const [o] = await t.query<{ id: string }>(
      `insert into orders (code, access_token_hash, amount_cents, customer_name, customer_email, payment_provider, pix_txid)
       values ($1, $2, $3, $4, $5, 'static', $1) returning id`,
      [code, sha256(token), amount, name, email],
    );
    for (const p of photos) {
      await t.query(
        "insert into order_items (order_id, photo_id, price_cents, title_snapshot) values ($1,$2,$3,$4)",
        [o.id, p.id, p.price_cents, p.title],
      );
    }
    return o.id;
  });

  try {
    const charge = await createPixCharge({
      orderCode: code,
      amountCents: amount,
      description: `Diário do Gaúcho — pedido ${code}`,
      payerEmail: email,
    });
    await q(
      `update orders set payment_provider=$2, provider_payment_id=$3, pix_copia_cola=$4, pix_txid=$5,
              expires_at=$6, updated_at=now() where id=$1`,
      [orderId, charge.provider, charge.providerPaymentId, charge.copiaECola, charge.txid, charge.expiresAt.toISOString()],
    );
  } catch (err) {
    await q("update orders set status='cancelled', updated_at=now() where id=$1", [orderId]);
    if (err instanceof PixNotConfiguredError) {
      throw new OrderError("Pagamentos via Pix estão temporariamente indisponíveis.", "pix_unavailable", 503);
    }
    console.error("[orders] falha ao criar cobrança Pix", err);
    throw new OrderError("Não foi possível gerar a cobrança Pix. Tente novamente.", "charge_failed", 502);
  }
  return { token, code };
}

export function isValidToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

export async function getOrderByToken(token: string) {
  if (!isValidToken(token)) return null;
  const rows = await q<OrderRow>("select * from orders where access_token_hash = $1", [sha256(token)]);
  const order = rows[0];
  if (!order) return null;
  const items = await q<OrderItemRow>(
    `select oi.id, oi.order_id, oi.photo_id, oi.price_cents, oi.title_snapshot, oi.download_count,
            p.version, p.width, p.height
       from order_items oi join photos p on p.id = oi.photo_id
      where oi.order_id = $1 order by oi.created_at`,
    [order.id],
  );
  return { order, items };
}

/** Marca que o cliente disse ter pago. NÃO libera nada — apenas sinaliza ao administrador. */
export async function reportPaidByCustomer(token: string) {
  if (!isValidToken(token)) return;
  await q(
    `update orders set customer_reported_paid_at = coalesce(customer_reported_paid_at, now()), updated_at=now()
      where access_token_hash = $1 and status = 'pending'`,
    [sha256(token)],
  );
}

// ------------------------------------------------------------- pagamento --
export type ConfirmResult =
  | "paid"
  | "already_paid"
  | "recorded"
  | "amount_mismatch"
  | "order_not_found"
  | "payment_mismatch";

export interface ConfirmInput {
  provider: "mercadopago" | "static";
  providerPaymentId: string;
  status: string; // status normalizado do provedor ('approved' = pago)
  amountCents: number;
  currency: string;
  orderCode: string;
  source: "webhook" | "poll" | "manual";
  note?: string;
  raw?: unknown;
}

/**
 * Confirmação de pagamento — única porta de entrada para marcar um pedido como pago.
 * Idempotente: notificações repetidas não geram efeitos duplicados.
 */
export async function confirmPayment(input: ConfirmInput): Promise<ConfirmResult> {
  const db = await getDb();
  return db.tx(async (t: Queryable) => {
    const [order] = await t.query<OrderRow>("select * from orders where code = $1 for update", [input.orderCode]);
    if (!order) return "order_not_found";
    if (order.payment_provider !== input.provider) return "payment_mismatch";
    if (order.provider_payment_id && order.provider_payment_id !== input.providerPaymentId) {
      return "payment_mismatch";
    }

    await t.query(
      `insert into transactions (order_id, provider, provider_payment_id, status, amount_cents, source, note, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8::text::jsonb)
       on conflict (provider, provider_payment_id, status) do nothing`,
      [
        order.id,
        input.provider,
        input.providerPaymentId,
        input.status,
        input.amountCents,
        input.source,
        input.note ?? null,
        JSON.stringify(input.raw ?? null),
      ],
    );

    if (input.status !== "approved") return "recorded";
    if (order.status === "paid") return "already_paid";
    if (input.currency !== "BRL" || input.amountCents !== order.amount_cents) {
      console.warn(`[payments] valor divergente no pedido ${order.code}: ${input.amountCents} != ${order.amount_cents}`);
      return "amount_mismatch";
    }
    await t.query(
      `update orders set status='paid', paid_at=now(), updated_at=now(),
              provider_payment_id = coalesce(provider_payment_id, $2)
        where id=$1 and status <> 'paid'`,
      [order.id, input.providerPaymentId],
    );
    return "paid";
  });
}

export function mpAmountCents(p: MpPayment) {
  return Math.round(Number(p.transaction_amount) * 100);
}

export async function confirmFromMercadoPago(payment: MpPayment, source: "webhook" | "poll") {
  if (!payment.external_reference) return "order_not_found" as const;
  return confirmPayment({
    provider: "mercadopago",
    providerPaymentId: String(payment.id),
    status: payment.status,
    amountCents: mpAmountCents(payment),
    currency: payment.currency_id ?? "BRL",
    orderCode: payment.external_reference,
    source,
    raw: { id: payment.id, status: payment.status, status_detail: payment.status_detail, date_approved: payment.date_approved },
  });
}

const lastPoll = new Map<string, number>();
/** Consulta ativa ao provedor (complementa o webhook), com limite de frequência. */
export async function refreshOrderFromProvider(order: OrderRow) {
  if (order.status !== "pending" || order.payment_provider !== "mercadopago" || !order.provider_payment_id) return;
  const now = Date.now();
  if ((lastPoll.get(order.id) ?? 0) > now - 10_000) return;
  lastPoll.set(order.id, now);
  try {
    const payment = await getMercadoPagoPayment(order.provider_payment_id);
    await confirmFromMercadoPago(payment, "poll");
  } catch (e) {
    console.warn("[orders] consulta ao provedor falhou", e instanceof Error ? e.message : e);
  }
}

/** Confirmação manual (Pix estático) após o administrador conferir o crédito no extrato. */
export async function confirmManually(orderId: string, reference: string) {
  if (!isUuid(orderId)) throw new OrderError("Pedido inválido.", "invalid");
  const ref = String(reference ?? "").trim();
  if (ref.length < 6 || ref.length > 80) {
    throw new OrderError("Informe o identificador da transação (E2E) que consta no extrato.", "missing_reference");
  }
  const [order] = await q<OrderRow>("select * from orders where id=$1", [orderId]);
  if (!order) throw new OrderError("Pedido não encontrado.", "not_found", 404);
  if (order.payment_provider !== "static") {
    throw new OrderError("Pedidos com provedor automático são confirmados apenas pelo provedor.", "not_manual");
  }
  const [used] = await q<{ code: string }>(
    "select code from orders where payment_provider='static' and provider_payment_id=$1 and id<>$2",
    [`manual:${ref}`, order.id],
  );
  if (used) {
    throw new OrderError(
      `Esta transação já está vinculada ao pedido ${used.code}. Confira o identificador no extrato.`,
      "reference_used",
      409,
    );
  }
  return confirmPayment({
    provider: "static",
    providerPaymentId: `manual:${ref}`,
    status: "approved",
    amountCents: order.amount_cents,
    currency: "BRL",
    orderCode: order.code,
    source: "manual",
    note: `Conferido no extrato pelo administrador. Ref: ${ref}`,
  });
}

export async function cancelOrder(orderId: string) {
  if (!isUuid(orderId)) throw new OrderError("Pedido inválido.", "invalid");
  await q("update orders set status='cancelled', updated_at=now() where id=$1 and status='pending'", [orderId]);
}

export async function expireStaleOrders() {
  // Mantemos uma margem de 24h após o vencimento: pagamentos podem chegar atrasados.
  await q(
    `update orders set status='expired', updated_at=now()
      where status='pending' and expires_at is not null and expires_at < now() - interval '24 hours'`,
  );
}

// ------------------------------------------------------------- download --
/** Gera URL assinada e temporária para o original — somente para pedidos pagos. */
export async function createDownloadLink(token: string, itemId: string, ip?: string) {
  const data = await getOrderByToken(token);
  if (!data) throw new OrderError("Pedido não encontrado.", "not_found", 404);
  if (data.order.status !== "paid") throw new OrderError("Pagamento ainda não confirmado.", "not_paid", 402);
  const item = data.items.find((i) => i.id === itemId);
  if (!item) throw new OrderError("Item não encontrado.", "not_found", 404);
  if (item.download_count >= MAX_DOWNLOADS_PER_ITEM) {
    throw new OrderError("Limite de downloads atingido. Fale conosco para liberar novamente.", "limit", 429);
  }
  const [photo] = await q<{ original_path: string; mime: string | null }>(
    "select original_path, mime from photos where id=$1",
    [item.photo_id],
  );
  if (!photo) throw new OrderError("Arquivo indisponível.", "missing", 410);
  await q("update order_items set download_count = download_count + 1 where id=$1", [item.id]);
  await q("insert into downloads (order_item_id, ip) values ($1,$2)", [item.id, ip ?? null]);
  const filename = downloadFilename(item.title_snapshot, data.order.code, photo.mime);
  return storage().createDownloadUrl(photo.original_path, filename, env.downloadUrlTtlSeconds);
}
