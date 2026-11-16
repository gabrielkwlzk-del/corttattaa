import { hashPassword } from "./auth.mjs";
import { files } from "./files.mjs";
import { HttpError, assertPrice, isUuid } from "./http.mjs";
import { ingest, safeFilename } from "./photos.mjs";
import * as repo from "./repo.mjs";
import { setSetting } from "./db.mjs";

/**
 * Importa fotos, pedidos e configurações do site antigo (Netlify).
 * O servidor entra no painel do site antigo com a senha antiga e puxa tudo, mantendo os mesmos ids:
 * os links dos pedidos que os clientes já têm continuam funcionando no site novo.
 * Segurança: só aceita endereços https de *.netlify.app (ou os de IMPORT_ALLOWED_HOSTS).
 */
export function assertImportUrl(input) {
  let u;
  try {
    u = new URL(String(input ?? "").trim());
  } catch {
    throw new HttpError(400, "Endereço do site antigo inválido.");
  }
  const allowed = (process.env.IMPORT_ALLOWED_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const host = u.hostname.toLowerCase();
  const local = process.env.ALLOW_LOCAL_IMPORT === "1" && (host === "localhost" || host === "127.0.0.1");
  if (!local) {
    if (u.protocol !== "https:") throw new HttpError(400, "Use o endereço completo do site antigo, começando com https://.");
    if (!(host.endsWith(".netlify.app") || allowed.includes(host))) {
      throw new HttpError(400, "Só é possível importar de um site *.netlify.app.");
    }
  }
  return u.origin;
}

async function oldFetch(base, cookie, pathAndQuery, init = {}) {
  let res;
  try {
    res = await fetch(base + pathAndQuery, {
      ...init,
      headers: { origin: base, ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
      signal: AbortSignal.timeout(45_000),
      redirect: "manual",
    });
  } catch {
    throw new HttpError(502, "Não consegui falar com o site antigo. Confira o endereço e se ele está no ar.");
  }
  return res;
}

export async function importStart({ url, password }) {
  const base = assertImportUrl(url);
  const res = await oldFetch(base, null, "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: String(password ?? "") }),
  });
  if (res.status === 401) throw new HttpError(400, "Senha do site antigo incorreta.");
  if (res.status === 429) throw new HttpError(429, "O site antigo bloqueou novas tentativas por alguns minutos. Tente mais tarde.");
  if (!res.ok) throw new HttpError(502, `O site antigo respondeu com erro (${res.status}).`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("dg_admin="));
  if (!cookie) throw new HttpError(502, "O site antigo não devolveu a sessão do painel.");
  const meta = await oldFetch(base, cookie, "/api/admin/export?part=meta");
  if (meta.status === 404) {
    throw new HttpError(409, "O site antigo ainda não tem o recurso de exportação. Atualize o site antigo com a versão nova (instruções no README) e tente de novo.");
  }
  if (!meta.ok) throw new HttpError(502, `Falha ao ler os dados do site antigo (${meta.status}).`);
  const data = await meta.json();
  if (!Array.isArray(data.photos)) throw new HttpError(502, "Resposta inesperada do site antigo.");
  return { base, cookie, meta: data };
}

export async function importPhoto({ url, cookie, photo }) {
  const base = assertImportUrl(url);
  if (!photo || !isUuid(photo.id)) throw new HttpError(400, "Foto inválida.");
  const res = await oldFetch(base, cookie, `/api/admin/export/file?id=${encodeURIComponent(photo.id)}&kind=orig`);
  if (res.status === 404) return { id: photo.id, skipped: "sem arquivo original no site antigo" };
  if (!res.ok) throw new HttpError(502, `Falha ao baixar a foto (${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = photo.format === "jpeg" ? "jpg" : photo.format || "jpg";
  const filename = safeFilename(photo.filename || `${photo.title || "foto"}.${ext}`);
  const originalPath = `originals/${photo.id}/${filename}`;
  await files().put(originalPath, buffer, "application/octet-stream");
  await ingest({
    id: photo.id,
    buffer,
    originalPath,
    filename,
    title: photo.title,
    description: photo.description,
    modalidade: photo.modalidade,
    evento: photo.evento,
    priceCents: assertPrice(photo.priceCents),
    hidden: Boolean(photo.hidden),
    deleted: Boolean(photo.deleted),
    createdAt: photo.createdAt ? new Date(photo.createdAt) : undefined,
  });
  return { id: photo.id, ok: true };
}

const ORDER_STATUS = new Set(["pending", "paid", "cancelled"]);

export async function importOrdersPage({ url, cookie, offset = 0 }) {
  const base = assertImportUrl(url);
  const off = Math.max(0, Number(offset) || 0);
  const res = await oldFetch(base, cookie, `/api/admin/export?part=orders&offset=${off}&limit=100`);
  if (!res.ok) throw new HttpError(502, `Falha ao ler os pedidos do site antigo (${res.status}).`);
  const data = await res.json();
  let imported = 0;
  let skipped = 0;
  for (const o of data.orders ?? []) {
    const valid =
      /^[0-9a-f]{64}$/.test(o.id) && typeof o.code === "string" && ORDER_STATUS.has(o.status) && Number.isInteger(o.amountCents) && o.amountCents > 0 &&
      typeof o.email === "string" && typeof o.pix === "string" && Array.isArray(o.items) && o.items.length > 0 &&
      o.items.every((i) => isUuid(i.photoId) && Number.isInteger(i.priceCents) && i.priceCents > 0);
    if (!valid) {
      skipped++;
      continue;
    }
    if (await repo.importOrder(o)) imported++;
  }
  const count = (data.orders ?? []).length;
  const next = count === 0 || off + count >= data.total ? null : off + count;
  return { imported, skipped, total: data.total, next };
}

export async function importConfig({ url, cookie, password, keepPassword }) {
  const base = assertImportUrl(url);
  const res = await oldFetch(base, cookie, "/api/admin/export?part=meta");
  if (!res.ok) throw new HttpError(502, `Falha ao ler as configurações (${res.status}).`);
  const meta = await res.json();
  const price = meta?.config?.defaultPriceCents;
  if (Number.isInteger(price)) await setSetting("default_price_cents", assertPrice(price));
  if (keepPassword && typeof password === "string" && password.length >= 8) {
    await setSetting("password_hash", await hashPassword(password));
  }
  return { ok: true, defaultPriceCents: Number.isInteger(price) ? price : null, passwordKept: Boolean(keepPassword) };
}
