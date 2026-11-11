import { getStore } from "@netlify/blobs";
import { hmac, randomToken, safeEqual } from "./auth.mjs";

let _store;
export const db = () => (_store ??= getStore({ name: "diario-do-gaucho", consistency: "strong" }));

export async function getJSON(key) {
  return (await db().get(key, { type: "json" })) ?? null;
}
export const setJSON = (key, value) => db().setJSON(key, value);
export const del = (key) => db().delete(key);

export async function listKeys(prefix) {
  const res = await db().list({ prefix });
  return res.blobs.map((b) => b.key);
}

export async function listJSON(prefix) {
  const keys = await listKeys(prefix);
  const items = await Promise.all(keys.map((k) => getJSON(k)));
  return items.filter(Boolean);
}

export const DEFAULT_PRICE_CENTS = 900;

/** Configuração persistente: segredo de assinatura (gerado uma vez), preço padrão, hash de senha trocada. */
export async function getConfig() {
  let cfg = await getJSON("config");
  if (!cfg || !cfg.secret) {
    cfg = { ...(cfg ?? {}), secret: randomToken(48), defaultPriceCents: cfg?.defaultPriceCents ?? DEFAULT_PRICE_CENTS };
    await setJSON("config", cfg);
  }
  return cfg;
}
export async function saveConfig(patch) {
  const cfg = { ...(await getConfig()), ...patch };
  await setJSON("config", cfg);
  return cfg;
}

export async function signedToken(payload, ttlSeconds) {
  const { secret } = await getConfig();
  const body = Buffer.from(JSON.stringify({ ...payload, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}
export async function readSignedToken(token) {
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const { secret } = await getConfig();
  if (!safeEqual(hmac(body, secret), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.e > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}
