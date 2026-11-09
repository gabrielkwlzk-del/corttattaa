import "server-only";
import crypto from "node:crypto";
import { env } from "../env";
import { centsToDecimalString } from "../money";

/**
 * Integração Pix via API do Mercado Pago (cobrança dinâmica + webhook).
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs
 *
 * Credenciais via variáveis de ambiente — nunca no código:
 *   MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET
 */
export interface MpPayment {
  id: number | string;
  status: string; // pending | approved | rejected | cancelled | refunded | in_process ...
  status_detail?: string;
  transaction_amount: number;
  currency_id?: string;
  external_reference?: string | null;
  date_approved?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
}

export function mercadoPagoConfigured(): boolean {
  return Boolean(env.mercadoPagoAccessToken && env.mercadoPagoWebhookSecret);
}

async function mpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = env.mercadoPagoAccessToken;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  return fetch(`${env.mercadoPagoApiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Formato exigido pelo MP: yyyy-MM-dd'T'HH:mm:ss.SSSZ com offset. */
function mpDate(d: Date): string {
  const tz = -3 * 60; // horário de Brasília
  const local = new Date(d.getTime() + tz * 60_000);
  return local.toISOString().replace("Z", "-03:00");
}

export async function createMercadoPagoPix(input: {
  orderCode: string;
  amountCents: number;
  description: string;
  payerEmail: string;
  expiresAt: Date;
}): Promise<{ paymentId: string; copiaECola: string; expiresAt: Date }> {
  const res = await mpFetch("/v1/payments", {
    method: "POST",
    headers: { "x-idempotency-key": input.orderCode },
    body: JSON.stringify({
      transaction_amount: Number(centsToDecimalString(input.amountCents)),
      description: input.description.slice(0, 120),
      payment_method_id: "pix",
      external_reference: input.orderCode,
      notification_url: `${env.appUrl}/api/webhooks/mercadopago?source_news=webhooks`,
      date_of_expiration: mpDate(input.expiresAt),
      payer: { email: input.payerEmail },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mercado Pago recusou a cobrança (${res.status}): ${text.slice(0, 300)}`);
  }
  const p = (await res.json()) as MpPayment;
  const code = p.point_of_interaction?.transaction_data?.qr_code;
  if (!code) throw new Error("Mercado Pago não retornou o código Pix.");
  return { paymentId: String(p.id), copiaECola: code, expiresAt: input.expiresAt };
}

export async function getMercadoPagoPayment(paymentId: string): Promise<MpPayment> {
  if (!/^\d{1,30}$/.test(paymentId)) throw new Error("ID de pagamento inválido.");
  const res = await mpFetch(`/v1/payments/${paymentId}`);
  if (!res.ok) throw new Error(`Falha ao consultar pagamento (${res.status}).`);
  return (await res.json()) as MpPayment;
}

/**
 * Verifica a assinatura do webhook (cabeçalho x-signature).
 * Manifesto: `id:{data.id};request-id:{x-request-id};ts:{ts};` com HMAC-SHA256.
 */
export function verifyMercadoPagoSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const { signatureHeader, requestId, dataId, secret } = input;
  if (!signatureHeader || !dataId) return false;
  let ts = "";
  let v1 = "";
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k === "ts") ts = v ?? "";
    if (k === "v1") v1 = v ?? "";
  }
  if (!ts || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1.toLowerCase(), "hex"));
}
