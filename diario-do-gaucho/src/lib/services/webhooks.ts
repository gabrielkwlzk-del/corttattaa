import "server-only";
import { q } from "../db";
import { env } from "../env";
import { getMercadoPagoPayment, verifyMercadoPagoSignature } from "../pix/mercadopago";
import { confirmFromMercadoPago } from "./orders";

export interface WebhookResult {
  status: number;
  body: { ok: boolean; result?: string; error?: string };
}

/**
 * Processa a notificação do Mercado Pago:
 * 1. Verifica a assinatura HMAC (rejeita se ausente/inválida ou se o segredo não estiver configurado).
 * 2. Deduplica pela x-request-id.
 * 3. NÃO confia no corpo da notificação: consulta o pagamento direto na API do provedor.
 * 4. Confirma o pedido somente se status = approved e valor/moeda conferem.
 */
export async function handleMercadoPagoWebhook(req: {
  url: string;
  headers: Headers;
  body: unknown;
}): Promise<WebhookResult> {
  const secret = env.mercadoPagoWebhookSecret;
  if (!secret) return { status: 503, body: { ok: false, error: "webhook_not_configured" } };

  const url = new URL(req.url);
  const body = (req.body ?? {}) as { type?: string; action?: string; data?: { id?: string | number } };
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null);
  const requestId = req.headers.get("x-request-id");

  const valid = verifyMercadoPagoSignature({
    signatureHeader: req.headers.get("x-signature"),
    requestId,
    dataId,
    secret,
  });
  if (!valid) return { status: 401, body: { ok: false, error: "invalid_signature" } };

  const type = url.searchParams.get("type") ?? body.type;
  if (type !== "payment" || !dataId) return { status: 200, body: { ok: true, result: "ignored" } };

  const eventKey = requestId ? `req:${requestId}` : `payment:${dataId}:${body.action ?? ""}`;
  const inserted = await q(
    `insert into webhook_events (provider, event_key) values ('mercadopago', $1)
     on conflict (provider, event_key) do nothing returning id`,
    [eventKey],
  );
  if (!inserted.length) return { status: 200, body: { ok: true, result: "duplicate" } };

  try {
    const payment = await getMercadoPagoPayment(dataId);
    const result = await confirmFromMercadoPago(payment, "webhook");
    await q("update webhook_events set result=$2 where provider='mercadopago' and event_key=$1", [eventKey, result]);
    return { status: 200, body: { ok: true, result } };
  } catch (err) {
    // Falha temporária: removemos o registro para que a nova tentativa do provedor seja processada.
    await q("delete from webhook_events where provider='mercadopago' and event_key=$1", [eventKey]);
    console.error("[webhook] erro ao processar", err);
    return { status: 500, body: { ok: false, error: "processing_failed" } };
  }
}
