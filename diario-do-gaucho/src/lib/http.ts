import "server-only";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { sessionCookieName, validateSession } from "./services/auth";
import { OrderError } from "./services/orders";
import { UserError } from "./errors";

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store", ...extra } });
}

export function errorResponse(err: unknown) {
  if (err instanceof OrderError) return json({ error: err.message, code: err.code }, err.status);
  if (err instanceof HttpError || err instanceof UserError) return json({ error: err.message }, err.status);
  if (err instanceof SyntaxError) return json({ error: "Requisição inválida." }, 400);
  const message = err instanceof Error ? err.message : "Erro inesperado.";
  console.error("[api]", err);
  return json({ error: env.isProd ? "Erro inesperado." : message }, 500);
}

export class HttpError extends UserError {
  constructor(status: number, message: string) {
    super(message, status);
  }
}

export function clientIp(h: Headers): string {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || h.get("x-real-ip") || "unknown").slice(0, 64);
}

/** Proteção CSRF complementar ao SameSite: exige mesma origem nas requisições que alteram dados. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Origem não permitida.");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {}
  const allowed = new Set([host, new URL(env.appUrl).host].filter(Boolean));
  if (!allowed.has(originHost)) throw new HttpError(403, "Origem não permitida.");
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return validateSession(jar.get(sessionCookieName())?.value);
}

/** Para Server Components/páginas do painel. */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Para rotas de API administrativas. */
export async function requireAdminApi(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  if (!(await isAdmin())) throw new HttpError(401, "Sessão expirada. Entre novamente.");
}

export async function requestIp() {
  return clientIp(await headers());
}

/** Limitador simples em memória (por instância) para endpoints públicos. */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return;
  }
  b.count++;
  if (b.count > limit) throw new HttpError(429, "Muitas requisições. Aguarde um instante.");
}
