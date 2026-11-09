/** Utilitários monetários — todos os valores internos em centavos (inteiros). */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Converte "9,00" | "9.00" | "R$ 12,5" | 9 em centavos. Retorna null se inválido. */
export function parseBRLToCents(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = input.replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return Number(int) * 100 + Number((dec + "00").slice(0, 2));
}

/** 900 -> "9.00" (formato exigido pelo BR Code e pelas APIs Pix). */
export function centsToDecimalString(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** 900 -> "9,00" para campos de formulário. */
export function centsToInput(cents: number): string {
  return centsToDecimalString(cents).replace(".", ",");
}

export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 10_000_000;
export const DEFAULT_PRICE_CENTS = 900;
