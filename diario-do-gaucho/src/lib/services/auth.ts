import "server-only";
import { UserError } from "../errors";
import { q } from "../db";
import { env } from "../env";
import { hashPassword, randomToken, sha256, verifyPassword } from "../crypto";
import { getSetting, setSetting } from "./settings";

export const SESSION_TTL_HOURS = 12;
export const MAX_FAILURES_PER_IP = 5;
export const MAX_FAILURES_GLOBAL = 30;
export const LOCK_WINDOW_MINUTES = 15;

export function sessionCookieName() {
  // Prefixo __Host- exige Secure + Path=/ e impede sobrescrita por subdomínios.
  return env.isProd ? "__Host-dg_admin" : "dg_admin";
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "locked" | "not_configured"; retryAfterSeconds?: number };

/** Hash da senha administrativa. A senha inicial vem de ADMIN_PASSWORD (ou ADMIN_PASSWORD_HASH). */
async function adminPasswordHash(): Promise<string | null> {
  if (env.adminPasswordHash) return env.adminPasswordHash;
  const stored = await getSetting<string>("admin_password_hash");
  if (stored) return stored;
  const initial = env.adminPassword;
  if (!initial) return null;
  if (initial.length < 8) throw new UserError("ADMIN_PASSWORD precisa ter ao menos 8 caracteres.");
  const hash = await hashPassword(initial);
  await setSetting("admin_password_hash", hash);
  return hash;
}

async function lockStatus(ip: string): Promise<number | null> {
  const [r] = await q<{ ip_failures: number; all_failures: number; oldest: string | null }>(
    `select
        count(*) filter (where ip = $1)::int as ip_failures,
        count(*)::int as all_failures,
        min(created_at) filter (where ip = $1) as oldest
       from login_attempts
      where success = false and created_at > now() - ($2::int * interval '1 minute')`,
    [ip, LOCK_WINDOW_MINUTES],
  );
  if (r.ip_failures >= MAX_FAILURES_PER_IP || r.all_failures >= MAX_FAILURES_GLOBAL) {
    const oldest = r.oldest ? new Date(r.oldest).getTime() : Date.now();
    return Math.max(30, Math.ceil((oldest + LOCK_WINDOW_MINUTES * 60_000 - Date.now()) / 1000));
  }
  return null;
}

export async function login(password: string, ip: string, userAgent?: string): Promise<LoginResult> {
  const retry = await lockStatus(ip);
  if (retry) return { ok: false, reason: "locked", retryAfterSeconds: retry };

  const hash = await adminPasswordHash();
  if (!hash) return { ok: false, reason: "not_configured" };

  const ok = typeof password === "string" && password.length <= 256 && (await verifyPassword(password, hash));
  await q("insert into login_attempts (ip, success) values ($1, $2)", [ip, ok]);
  if (!ok) return { ok: false, reason: "invalid" };

  // Login bem-sucedido limpa as falhas deste IP e sessões vencidas.
  await q("delete from login_attempts where ip=$1 and success=false", [ip]);
  await q("delete from admin_sessions where expires_at < now()");
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await q("insert into admin_sessions (token_hash, ip, user_agent, expires_at) values ($1,$2,$3,$4)", [
    sha256(token),
    ip,
    userAgent?.slice(0, 300) ?? null,
    expiresAt.toISOString(),
  ]);
  return { ok: true, token, expiresAt };
}

export async function validateSession(token: string | undefined | null): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const rows = await q("select 1 from admin_sessions where token_hash=$1 and expires_at > now()", [sha256(token)]);
  return rows.length > 0;
}

export async function logout(token: string | undefined | null) {
  if (!token) return;
  await q("delete from admin_sessions where token_hash=$1", [sha256(token)]);
}

export async function changePassword(current: string, next: string) {
  const hash = await adminPasswordHash();
  if (!hash || !(await verifyPassword(current, hash))) throw new UserError("Senha atual incorreta.");
  if (env.adminPasswordHash) throw new UserError("A senha está fixada por ADMIN_PASSWORD_HASH no servidor.");
  if (typeof next !== "string" || next.length < 10) throw new UserError("A nova senha deve ter ao menos 10 caracteres.");
  await setSetting("admin_password_hash", await hashPassword(next));
  // Encerra todas as sessões existentes.
  await q("delete from admin_sessions");
}
