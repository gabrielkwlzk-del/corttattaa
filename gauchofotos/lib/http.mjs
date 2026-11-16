export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export function clientIp(req) {
  const h = req.headers;
  const ip = h.get("x-vercel-forwarded-for") || h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown";
  return ip.trim().slice(0, 64);
}

export function readCookie(req, name) {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const isHttps = (req) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

export const cookieHeader = (req, name, value, maxAgeSeconds) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${isHttps(req) ? "; Secure" : ""}`;

/** Proteção extra contra CSRF: requisições que alteram dados precisam vir do próprio site. */
export function assertSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Origem não permitida.");
    return;
  }
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {}
  const mine = [req.headers.get("x-forwarded-host"), req.headers.get("host"), new URL(req.url).host].filter(Boolean);
  if (!mine.includes(host)) throw new HttpError(403, "Origem não permitida.");
}

export const slug = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "foto";

export function parsePrice(input) {
  let s = String(input ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ""] = s.split(".");
  return Number(i) * 100 + Number((d + "00").slice(0, 2));
}

export function assertPrice(c) {
  if (!Number.isInteger(c) || c < 100 || c > 10_000_000) throw new HttpError(400, "Preço inválido. Use entre R$ 1,00 e R$ 100.000,00.");
  return c;
}

export const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
