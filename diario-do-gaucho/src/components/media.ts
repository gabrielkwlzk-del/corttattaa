export const previewUrl = (id: string, version: number) => `/media/${id}/preview?v=${version}`;
export const thumbUrl = (id: string, version: number) => `/media/${id}/thumb?v=${version}`;

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(d).replace(".", "");
}

export function formatDateTime(iso: string | null | undefined) {
  return formatDate(iso, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
