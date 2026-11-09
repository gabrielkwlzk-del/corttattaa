import "server-only";
import QRCode from "qrcode";
import { env } from "../env";
import { buildStaticPix, normalizePixKey, type PixKeyType } from "./brcode";
import { createMercadoPagoPix, mercadoPagoConfigured } from "./mercadopago";

export type PixMode = "mercadopago" | "static";

export class PixNotConfiguredError extends Error {
  constructor(message = "Pagamento via Pix ainda não está configurado.") {
    super(message);
  }
}

/** Qual modo de Pix está ativo, considerando apenas configurações completas. */
export function activePixMode(): PixMode | null {
  const p = env.pixProvider;
  if (p === "mercadopago") return mercadoPagoConfigured() ? "mercadopago" : null;
  if (p === "static") return staticPixConfigured() ? "static" : null;
  return null;
}

export function staticPixConfigured(): boolean {
  return Boolean(env.pixKey && env.pixMerchantName && env.pixMerchantCity);
}

export function receiverKey(): { key: string; type: PixKeyType } | null {
  if (!env.pixKey) return null;
  const forced = process.env.PIX_KEY_TYPE as PixKeyType | undefined;
  return normalizePixKey(env.pixKey, forced || undefined);
}

export interface PixCharge {
  provider: PixMode;
  providerPaymentId: string | null;
  copiaECola: string;
  txid: string;
  expiresAt: Date;
}

export async function createPixCharge(input: {
  orderCode: string;
  amountCents: number;
  description: string;
  payerEmail: string;
}): Promise<PixCharge> {
  const mode = activePixMode();
  if (!mode) throw new PixNotConfiguredError();

  if (mode === "mercadopago") {
    const expiresAt = new Date(Date.now() + env.pixExpirationMinutes * 60_000);
    const r = await createMercadoPagoPix({ ...input, expiresAt });
    return { provider: mode, providerPaymentId: r.paymentId, copiaECola: r.copiaECola, txid: input.orderCode, expiresAt };
  }

  const key = receiverKey()!;
  const copiaECola = buildStaticPix({
    key: key.key,
    merchantName: env.pixMerchantName!,
    merchantCity: env.pixMerchantCity!,
    amountCents: input.amountCents,
    txid: input.orderCode,
  });
  // Pix estático: o pedido fica aguardando conferência segura por até 48h.
  return {
    provider: mode,
    providerPaymentId: null,
    copiaECola,
    txid: input.orderCode,
    expiresAt: new Date(Date.now() + 48 * 3600_000),
  };
}

export async function qrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#08090D", light: "#FFFFFF" },
  });
}
