/**
 * Geração de BR Code Pix (EMV® QRCPS-MPM) estático com valor, conforme o
 * Manual de Padrões para Iniciação do Pix do Banco Central.
 *
 * IMPORTANTE: um Pix estático NÃO oferece confirmação automática de pagamento.
 * Pedidos pagos com ele permanecem pendentes até confirmação segura
 * (provedor com webhook/consulta, ou conferência manual do administrador no extrato).
 */
import { centsToDecimalString } from "../money";

export type PixKeyType = "phone" | "cpf" | "cnpj" | "email" | "evp";

export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const nums = d.split("").map(Number);
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nums[i] * (len + 1 - i);
    return ((sum * 10) % 11) % 10;
  };
  return calc(9) === nums[9] && calc(10) === nums[10];
}

export function isValidCnpj(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const nums = d.split("").map(Number);
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * nums[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === nums[12] && calc(13) === nums[13];
}

/**
 * Normaliza a chave Pix para o formato exigido no BR Code.
 * Telefones devem estar no formato +55DDDNÚMERO. Uma chave de 10–11 dígitos
 * que não seja CPF válido é tratada como celular brasileiro.
 */
export function normalizePixKey(raw: string, forcedType?: PixKeyType): { key: string; type: PixKeyType } {
  const v = raw.trim();
  const digits = v.replace(/\D/g, "");
  const type: PixKeyType =
    forcedType ??
    (v.includes("@")
      ? "email"
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
        ? "evp"
        : v.startsWith("+")
          ? "phone"
          : digits.length === 14 && isValidCnpj(digits)
            ? "cnpj"
            : digits.length === 11 && isValidCpf(digits)
              ? "cpf"
              : "phone");

  switch (type) {
    case "email":
      return { key: v.toLowerCase(), type };
    case "evp":
      return { key: v.toLowerCase(), type };
    case "cpf":
    case "cnpj":
      return { key: digits, type };
    case "phone": {
      const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
      if (national.length < 10 || national.length > 11) throw new Error("Chave Pix de telefone inválida.");
      return { key: `+55${national}`, type };
    }
  }
}

function tlv(id: string, value: string): string {
  const len = Buffer.byteLength(value, "utf8");
  if (len > 99) throw new Error(`Campo ${id} excede 99 bytes.`);
  return `${id}${String(len).padStart(2, "0")}${value}`;
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF). */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres fora do conjunto permitido. */
export function sanitizeEmvText(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export interface StaticPixInput {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid: string;
  description?: string;
}

export function buildStaticPix(input: StaticPixInput): string {
  const name = sanitizeEmvText(input.merchantName, 25);
  const city = sanitizeEmvText(input.merchantCity, 15);
  if (!name || !city) throw new Error("Nome e cidade do recebedor são obrigatórios para Pix estático.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Valor inválido.");
  const txid = input.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const mai =
    tlv("00", "br.gov.bcb.pix") +
    tlv("01", input.key) +
    (input.description ? tlv("02", sanitizeEmvText(input.description, 40)) : "");

  const payload =
    tlv("00", "01") +
    tlv("01", "12") + // uso único: o QR deste pedido não deve ser reutilizado
    tlv("26", mai) +
    tlv("52", "0000") +
    tlv("53", "986") + // BRL
    tlv("54", centsToDecimalString(input.amountCents)) +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return payload + crc16(payload);
}

/** Decodifica TLV (útil para testes e validação). */
export function parseEmv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}
