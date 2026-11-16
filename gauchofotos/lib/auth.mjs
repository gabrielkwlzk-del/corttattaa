import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Segredo de assinatura (sessão e links de download). Vem do ambiente: nunca muda sozinho. */
export function secret() {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV !== "production") return "dev-only-secret-do-not-use-in-production-0000";
  throw new ConfigError("APP_SECRET não configurado (mínimo 32 caracteres).");
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyHash(password, stored) {
  const parts = String(stored).split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const hmac = (data, key = secret()) => crypto.createHmac("sha256", key).update(data).digest("base64url");

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function orderCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "DG";
  for (const b of crypto.randomBytes(8)) out += alphabet[b % alphabet.length];
  return out;
}

// ------------------------------------------------- tokens assinados (sem banco) --
/** Token com validade: `<payload>.<assinatura>`. Serve para links de download e envios. */
export function signToken(payload, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function readToken(token) {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig || !safeEqual(hmac(body), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.e > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------- sessão do painel (cookie) --
/** Sessão assinada: validar não consulta o banco para a assinatura, então não "some" do nada. */
export function makeSession(epoch, hours) {
  const exp = Date.now() + hours * 3_600_000;
  const body = `${exp}.${epoch}.${randomToken(12)}`;
  return `${body}.${hmac(`session:${body}`)}`;
}

export function readSession(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join(".");
  if (!safeEqual(hmac(`session:${body}`), parts[3])) return null;
  const [exp, epoch] = parts;
  if (!(Number(exp) > Date.now())) return null;
  return { epoch: Number(epoch) };
}
