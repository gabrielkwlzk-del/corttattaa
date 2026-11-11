// BR Code Pix estático (EMV QRCPS-MPM) com valor. Sem confirmação automática de pagamento.
export function isValidCpf(v) {
  const d = String(v).replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const n = d.split("").map(Number);
  const calc = (len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += n[i] * (len + 1 - i);
    return ((s * 10) % 11) % 10;
  };
  return calc(9) === n[9] && calc(10) === n[10];
}

export function normalizeKey(raw) {
  const v = String(raw).trim();
  const digits = v.replace(/\D/g, "");
  if (v.includes("@")) return v.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v.toLowerCase();
  if (digits.length === 11 && isValidCpf(digits)) return digits;
  if (digits.length === 14) return digits;
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length < 10 || national.length > 11) throw new Error("Chave Pix inválida.");
  return `+55${national}`;
}

const tlv = (id, value) => {
  const len = Buffer.byteLength(value, "utf8");
  if (len > 99) throw new Error(`Campo ${id} muito longo`);
  return `${id}${String(len).padStart(2, "0")}${value}`;
};

export function crc16(payload) {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export const emvText = (s, max) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);

export function centsToDecimal(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function buildPix({ key, name, city, amountCents, txid }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Valor inválido.");
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", key);
  const payload =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", mai) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", centsToDecimal(amountCents)) +
    tlv("58", "BR") +
    tlv("59", emvText(name, 25) || "RECEBEDOR") +
    tlv("60", emvText(city, 15) || "BRASIL") +
    tlv("62", tlv("05", String(txid).replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***")) +
    "6304";
  return payload + crc16(payload);
}

export function parseEmv(payload) {
  const out = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}
