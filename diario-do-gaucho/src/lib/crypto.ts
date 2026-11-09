import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";

const scrypt = promisify(crypto.scrypt) as (
  pw: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  opts: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Hash de senha com scrypt (memória-intensivo), formato autoexplicativo. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Separador ":" (evita expansão de "$" em arquivos .env); "$" aceito por compatibilidade.
  const parts = stored.split(stored.includes(":") ? ":" : "$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64url");
  if (expected.length < 32) return false;
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hmac(input: string, secret = env.appSecret): string {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Código curto e legível para pedidos (sem caracteres ambíguos). Também usado como txid Pix. */
export function orderCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let out = "DG";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
