import crypto from "node:crypto";
import QRCode from "qrcode";
import { buildPix, normalizeKey } from "./brcode.mjs";
import {
  ConfigError,
  hashPassword,
  makeSession,
  orderCode,
  randomToken,
  readSession,
  readToken,
  safeEqual,
  secret,
  sha256,
  signToken,
  verifyHash,
} from "./auth.mjs";
import { DEFAULT_PASSWORD_HASH } from "./defaults.mjs";
import { DbNotConfigured, closeDb, getSetting, setSetting, withDb } from "./db.mjs";
import { FilesNotConfigured, files, getBuffer, signLocal, verifyLocal } from "./files.mjs";
import {
  HttpError,
  assertPrice,
  assertSameOrigin,
  clientIp,
  cookieHeader,
  isUuid,
  json,
  parsePrice,
  readCookie,
  slug,
} from "./http.mjs";
import { IMAGE_TYPES, ingest, safeFilename } from "./photos.mjs";
import * as repo from "./repo.mjs";
import { importConfig, importOrdersList, importOrdersPage, importPhoto, importStart } from "./importer.mjs";

// ------------------------------------------------------------- configuração --
const PIX_KEY = () => process.env.PIX_KEY || "47992145561";
const PIX_NAME = () => process.env.PIX_NAME || "Esporte Show Online";
const PIX_CITY = () => process.env.PIX_CITY || "BRASIL";
const COOKIE = "dg_admin";
const SESSION_HOURS = 12;
const MAX_DOWNLOADS = 25;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const maxUploadMb = () => Math.min(100, Math.max(5, Number(process.env.MAX_UPLOAD_MB || 40)));

// ------------------------------------------------------------------ fotos ----
const urls = (p) => ({
  thumbUrl: `/api/preview/${p.id}/thumb?v=${p.v ?? 1}`,
  previewUrl: `/api/preview/${p.id}/preview?v=${p.v ?? 1}`,
  heroUrl: `/api/preview/${p.id}/hero?v=${p.v ?? 1}`,
});

const publicPhoto = (p) => ({
  id: p.id,
  title: p.title,
  description: p.description || "",
  modalidade: p.modalidade || "",
  evento: p.evento || "",
  priceCents: p.price_cents,
  width: p.width,
  height: p.height,
  ...urls(p),
});

const adminPhoto = (p) => ({ ...publicPhoto(p), hidden: Boolean(p.hidden), createdAt: p.created_at });

// ------------------------------------------------------------------ painel ----
async function epoch() {
  const v = await getSetting("session_epoch");
  return Number.isInteger(v) ? v : 0;
}

async function isAdmin(req) {
  const s = readSession(readCookie(req, COOKIE));
  return Boolean(s) && s.epoch === (await epoch());
}

async function requireAdmin(req) {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  if (!(await isAdmin(req))) throw new HttpError(401, "Sessão expirada. Entre novamente.");
}

async function passwordOk(password) {
  if (typeof password !== "string" || !password || password.length > 200) return false;
  const stored = await getSetting("password_hash");
  if (stored) return verifyHash(password, stored);
  if (process.env.ADMIN_PASSWORD) return safeEqual(sha256(password), sha256(process.env.ADMIN_PASSWORD));
  return verifyHash(password, DEFAULT_PASSWORD_HASH);
}

async function login(req, ip) {
  const { count, first } = await repo.loginFailures(ip, 15);
  if (count >= 5) {
    const wait = Math.max(1, Math.ceil((new Date(first).getTime() + 15 * 60_000 - Date.now()) / 60_000));
    throw new HttpError(429, `Muitas tentativas. Tente novamente em ${wait} min.`);
  }
  const { password } = await req.json().catch(() => ({}));
  if (!(await passwordOk(password))) {
    await repo.recordLogin(ip, false);
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, "Senha incorreta.");
  }
  await repo.clearFailures(ip);
  repo.pruneAttempts().catch(() => {});
  const token = makeSession(await epoch(), SESSION_HOURS);
  return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, COOKIE, token, SESSION_HOURS * 3600) });
}

// ------------------------------------------------------------------ pedidos ----
async function createOrder(req, ip) {
  if (!(await repo.rateAllowed(`order:${sha256(ip)}`, 20, 3600))) throw new HttpError(429, "Muitas requisições. Aguarde um instante.");
  const body = await req.json().catch(() => ({}));
  const ids = [...new Set(Array.isArray(body.photoIds) ? body.photoIds.map(String) : body.photoId ? [String(body.photoId)] : [])];
  if (!ids.length || !ids.every(isUuid)) throw new HttpError(400, "Selecione uma fotografia.");
  if (ids.length > 10) throw new HttpError(400, "Muitas fotografias em um pedido.");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "Informe um e-mail válido.");
  const name = String(body.name ?? "").trim().slice(0, 120);

  const found = await repo.availablePhotos(ids);
  if (found.length !== ids.length) throw new HttpError(409, "Alguma fotografia não está mais disponível.");
  // O preço vem SEMPRE do servidor; qualquer valor enviado pelo navegador é ignorado.
  const items = found.map((p) => ({ photoId: p.id, title: p.title, priceCents: p.price_cents }));
  const amountCents = items.reduce((s, i) => s + i.priceCents, 0);
  const code = orderCode();
  const token = randomToken(32);
  const pix = buildPix({ key: normalizeKey(PIX_KEY()), name: PIX_NAME(), city: PIX_CITY(), amountCents, txid: code });
  await repo.createOrder({ id: sha256(token), code, amountCents, email, name, pix, items });
  return { token, code, url: `/pedido/${token}` };
}

const validToken = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(t);
const orderByToken = (token) => (validToken(token) ? repo.orderById(sha256(token)) : null);

async function publicOrder(o) {
  const out = {
    code: o.code,
    status: o.status,
    amountCents: o.amount_cents,
    reported: Boolean(o.reported_at),
    paidAt: o.paid_at,
    items: o.items.map((i) => ({ photoId: i.photo_id, title: i.title, priceCents: i.price_cents, thumbUrl: `/api/preview/${i.photo_id}/thumb?v=${i.v ?? 1}` })),
  };
  if (o.status === "pending") {
    out.copiaECola = o.pix;
    out.qrSvg = await QRCode.toString(o.pix, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#08090D", light: "#FFFFFF" } });
  }
  return out;
}

async function deleteFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    await files().del(paths.slice(i, i + 100)).catch((e) => console.error("[del]", e));
  }
}

// ------------------------------------------------------------------ envios ----
function streamResponse(file, headers) {
  return new Response(file.stream, { headers: { "content-length": String(file.size), ...headers } });
}

async function prepareUploads(req) {
  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body.files) ? body.files : [];
  if (!list.length) throw new HttpError(400, "Nenhum arquivo enviado.");
  if (list.length > 100) throw new HttpError(400, "Envie no máximo 100 arquivos por vez.");
  const max = maxUploadMb() * 1024 * 1024;
  const mode = files().name;
  return {
    mode,
    maxMb: maxUploadMb(),
    uploads: list.map((f) => {
      if (!f || typeof f.name !== "string" || typeof f.size !== "number") throw new HttpError(400, "Arquivo inválido.");
      if (f.size <= 0 || f.size > max) throw new HttpError(413, `"${f.name}" passa do limite de ${maxUploadMb()} MB.`);
      if (f.type && !IMAGE_TYPES.includes(f.type)) throw new HttpError(400, `"${f.name}" não é um formato de imagem aceito.`);
      const photoId = crypto.randomUUID();
      const pathname = `originals/${photoId}/${safeFilename(f.name)}`;
      const ticket = signToken({ i: photoId, p: pathname }, 2 * 3600);
      const out = { photoId, pathname, ticket };
      if (mode === "local") {
        const exp = Math.floor(Date.now() / 1000) + 2 * 3600;
        const qs = new URLSearchParams({ path: pathname, exp: String(exp), sig: signLocal({ path: pathname, exp }) });
        out.upload = { url: `/api/admin/uploads/local?${qs}`, method: "PUT" };
      }
      return out;
    }),
  };
}

async function blobUpload(req) {
  const { handleUpload } = await import("@vercel/blob/client");
  const body = await req.json();
  const out = await handleUpload({
    request: req,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const t = readToken(clientPayload);
      if (!t || t.p !== pathname) throw new Error("Envio não autorizado.");
      return {
        allowedContentTypes: IMAGE_TYPES,
        maximumSizeInBytes: maxUploadMb() * 1024 * 1024,
        addRandomSuffix: false,
        allowOverwrite: true,
        validUntil: Date.now() + 2 * 3600 * 1000,
        tokenPayload: JSON.stringify({ i: t.i }),
      };
    },
  });
  return json(out);
}

async function finalizeUpload(req) {
  const b = await req.json().catch(() => ({}));
  const t = readToken(b.ticket);
  if (!t) throw new HttpError(400, "Envio expirado. Envie a foto de novo.");
  const buffer = await getBuffer(t.p);
  if (!buffer) throw new HttpError(400, "O arquivo não chegou ao armazenamento. Envie de novo.");
  if (buffer.length > maxUploadMb() * 1024 * 1024) {
    await files().del([t.p]);
    throw new HttpError(413, `Arquivo maior que ${maxUploadMb()} MB.`);
  }
  const priceInput = String(b.price ?? "").trim();
  const priceCents = priceInput ? assertPrice(parsePrice(priceInput)) : await repo.defaultPriceCents();
  const filename = String(b.filename ?? "").slice(0, 200);
  const title = String(b.title ?? "").trim() || filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  try {
    const row = await ingest({
      id: t.i,
      buffer,
      originalPath: t.p,
      filename,
      title,
      modalidade: b.modalidade,
      evento: b.evento,
      priceCents,
    });
    return adminPhoto(row);
  } catch (e) {
    if (e instanceof HttpError) await files().del([t.p]).catch(() => {});
    throw e;
  }
}

// -------------------------------------------------------------- diagnóstico ----
async function health() {
  const checks = {};
  const run = async (name, fn) => {
    try {
      checks[name] = { ok: true, detail: (await fn()) ?? "ok" };
    } catch (e) {
      checks[name] = { ok: false, detail: `${e?.name || "Erro"}: ${String(e?.message || e).slice(0, 240)}` };
    }
  };
  await run("segredo (APP_SECRET)", () => (secret(), "ok"));
  await run("banco de dados", async () => {
    const [r] = await withDb((s) => s`select (select count(*) from photos)::int as fotos, (select count(*) from orders)::int as pedidos`);
    return `ok · ${r.fotos} fotos · ${r.pedidos} pedidos`;
  });
  await run("armazenamento de arquivos", async () => {
    const f = files();
    const p = "health/ping.txt";
    const stamp = `ok ${Date.now()}`;
    await f.put(p, Buffer.from(stamp), "text/plain");
    const got = await f.get(p);
    if (!got) throw new Error("gravou mas não conseguiu ler");
    const text = await new Response(got.stream).text();
    await f.del([p]);
    if (text !== stamp) throw new Error("conteúdo lido diferente do gravado");
    return `ok · ${f.name}`;
  });
  await run("imagens (sharp)", async () => {
    const { default: sharp } = await import("sharp");
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
  });
  await run("marca d'água", async () => (await import("./watermark.mjs")).watermarkSvg(400, 300).length > 100 && "ok");
  await run("QR Code e Pix", async () => {
    const code = buildPix({ key: normalizeKey(PIX_KEY()), name: PIX_NAME(), city: PIX_CITY(), amountCents: 900, txid: "TESTE" });
    await QRCode.toString(code, { type: "svg" });
  });
  await run("senha do painel", async () => ((await getSetting("password_hash")) ? "definida pelo painel" : process.env.ADMIN_PASSWORD ? "definida por variável" : "padrão"));
  const ok = Object.values(checks).every((c) => c.ok);
  return json({ ok, node: process.version, checks }, ok ? 200 : 503);
}

// ------------------------------------------------------------------ roteador ----
async function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const parts = path.split("/");
  const m = req.method === "HEAD" ? "GET" : req.method;
  const ip = clientIp(req);

  if (path === "health" && m === "GET") return health();

  // ---------- público
  if (path === "photos" && m === "GET") {
    const rows = await repo.publicPhotos();
    return json({ photos: rows.map(publicPhoto) }, 200, {
      "cache-control": "public, max-age=0, s-maxage=10, stale-while-revalidate=50",
    });
  }

  if (parts[0] === "preview" && parts.length === 3 && m === "GET") {
    const [, id, variant] = parts;
    const p = await repo.getPhoto(id);
    const kind = variant === "thumb" ? "thumb" : variant === "hero" ? "hero" : "preview";
    if (!p) throw new HttpError(404, "Não encontrado.");
    const visible = !p.hidden && !p.deleted;
    const admin = !visible && (await isAdmin(req));
    // A miniatura (com marca d'água) de foto arquivada continua valendo para quem a comprou.
    const bought = !visible && !admin && kind === "thumb" && (await repo.thumbIsReferenced(id));
    if (!visible && !admin && !bought) throw new HttpError(404, "Não encontrado.");
    const key = kind === "thumb" ? p.thumb_path : kind === "hero" ? p.hero_path : p.preview_path;
    const file = key ? await files().get(key) : null;
    if (!file) throw new HttpError(404, "Não encontrado.");
    return streamResponse(file, {
      "content-type": "image/webp",
      "cache-control": visible ? "public, max-age=31536000, s-maxage=31536000, immutable" : "private, no-store",
      "content-disposition": "inline",
    });
  }

  if (path === "orders" && m === "POST") {
    assertSameOrigin(req);
    return json(await createOrder(req, ip), 201);
  }

  if (parts[0] === "orders" && parts.length >= 2) {
    const order = await orderByToken(parts[1]);
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (parts.length === 2 && m === "GET") return json(await publicOrder(order));
    if (parts[2] === "reported" && m === "POST") {
      assertSameOrigin(req);
      await repo.setReported(order.id);
      return json({ ok: true });
    }
    if (parts[2] === "download" && parts[3] && m === "POST") {
      assertSameOrigin(req);
      if (order.status !== "paid") throw new HttpError(402, "Pagamento ainda não confirmado.");
      const item = order.items.find((i) => i.photo_id === parts[3]);
      if (!item) throw new HttpError(404, "Item não encontrado.");
      return json({ url: `/api/dl?t=${encodeURIComponent(signToken({ o: order.id, p: item.photo_id }, 300))}` });
    }
  }

  // Entrega do original: link assinado e temporário (5 min), pedido pago, limite por item.
  if (path === "dl" && m === "GET") {
    const t = readToken(url.searchParams.get("t"));
    if (!t) throw new HttpError(410, "Link expirado. Volte à página do pedido para gerar um novo.");
    const order = await repo.orderById(t.o);
    if (!order || order.status !== "paid") throw new HttpError(402, "Pagamento não confirmado.");
    const item = order.items.find((i) => i.photo_id === t.p);
    if (!item) throw new HttpError(404, "Item não encontrado.");
    const photo = await repo.getPhoto(item.photo_id);
    const file = photo?.original_path ? await files().get(photo.original_path) : null;
    if (!file) throw new HttpError(410, "Arquivo indisponível. Fale conosco informando o código do pedido.");
    if (!(await repo.takeDownload(order.id, item.photo_id, MAX_DOWNLOADS))) throw new HttpError(429, "Limite de downloads atingido. Fale conosco.");
    const ext = photo.format === "jpeg" ? "jpg" : photo.format || "jpg";
    return streamResponse(file, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="esporte-show-online-${slug(item.title)}-${order.code}.${ext}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    });
  }

  // ---------- administração
  if (path === "admin/login" && m === "POST") {
    assertSameOrigin(req);
    return login(req, ip);
  }
  if (path === "admin/logout" && m === "POST") {
    assertSameOrigin(req);
    return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, COOKIE, "", 0) });
  }
  if (path === "admin/me" && m === "GET") return json({ admin: await isAdmin(req) });

  if (parts[0] === "admin") {
    await requireAdmin(req);

    if (path === "admin/photos" && m === "GET") return json({ photos: (await repo.adminPhotos()).map(adminPhoto) });

    if (path === "admin/uploads/prepare" && m === "POST") return json(await prepareUploads(req));
    if (path === "admin/blob-upload" && m === "POST") return blobUpload(req);
    if (path === "admin/uploads/local" && m === "PUT") {
      if (files().name !== "local") throw new HttpError(404, "Indisponível.");
      const p = url.searchParams.get("path") ?? "";
      const exp = url.searchParams.get("exp") ?? "";
      if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) throw new HttpError(410, "Envio expirado.");
      if (!verifyLocal({ path: p, exp }, url.searchParams.get("sig"))) throw new HttpError(403, "Assinatura inválida.");
      const buf = Buffer.from(await req.arrayBuffer());
      if (!buf.length || buf.length > maxUploadMb() * 1024 * 1024) throw new HttpError(413, "Tamanho inválido.");
      await files().put(p, buf, req.headers.get("content-type") || "application/octet-stream");
      return json({ ok: true });
    }
    if (path === "admin/photos/finalize" && m === "POST") return json({ photo: await finalizeUpload(req) }, 201);

    if (parts[1] === "photos" && parts[2] && parts.length === 3) {
      const p = await repo.getPhoto(parts[2]);
      if (!p || p.deleted) throw new HttpError(404, "Fotografia não encontrada.");
      if (m === "PATCH") {
        const b = await req.json().catch(() => ({}));
        const patch = {};
        if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 160);
        if (b.description !== undefined) patch.description = String(b.description).trim().slice(0, 2000);
        if (b.modalidade !== undefined) patch.modalidade = String(b.modalidade).trim().slice(0, 60);
        if (b.evento !== undefined) patch.evento = String(b.evento).trim().slice(0, 120);
        if (b.hidden !== undefined) patch.hidden = Boolean(b.hidden);
        if (b.price !== undefined) {
          const c = parsePrice(b.price);
          if (c === null) throw new HttpError(400, "Preço inválido.");
          patch.priceCents = assertPrice(c);
        }
        return json({ photo: adminPhoto(await repo.updatePhoto(p.id, patch)) });
      }
      if (m === "DELETE") {
        // Foto já vendida só é arquivada: o comprador continua podendo baixar o original.
        if (await repo.photoSold(p.id)) {
          await repo.archivePhoto(p.id);
          return json({ archived: true });
        }
        await repo.removePhoto(p.id);
        await deleteFiles([p.original_path, p.preview_path, p.thumb_path, p.hero_path].filter(Boolean));
        return json({ removed: true });
      }
    }

    if (path === "admin/orders" && m === "GET") {
      const [rows, stats] = await Promise.all([repo.listOrders(), repo.orderStats()]);
      return json({
        orders: rows.map((o) => ({
          id: o.id,
          code: o.code,
          status: o.status,
          amountCents: o.amount_cents,
          email: o.email,
          name: o.name,
          titles: o.titles,
          createdAt: o.created_at,
          reportedAt: o.reported_at,
          paidAt: o.paid_at,
        })),
        stats,
      });
    }
    if (parts[1] === "orders" && parts[2] && parts.length === 3 && m === "DELETE") {
      const r = await repo.deleteOrderById(parts[2]);
      if (!r.deleted) throw new HttpError(404, "Pedido não encontrado.");
      await deleteFiles(r.paths);
      return json({ ok: true });
    }
    if (path === "admin/data/clear" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.confirm !== "APAGAR") throw new HttpError(400, 'Digite APAGAR para confirmar.');
      if (!["orders", "photos", "all"].includes(b.what)) throw new HttpError(400, "Escolha o que apagar.");
      const r = await repo.clearData(b.what);
      await deleteFiles(r.paths);
      return json({ ok: true, orders: r.orders, photos: r.photos });
    }
    if (parts[1] === "orders" && parts[2] && parts[3] && m === "POST") {
      const order = await repo.orderById(parts[2]);
      if (!order) throw new HttpError(404, "Pedido não encontrado.");
      if (parts[3] === "confirm") {
        if (order.status === "cancelled") throw new HttpError(409, "Este pedido foi cancelado.");
        if (order.status === "pending") await repo.confirmOrder(order.id);
        return json({ ok: true });
      }
      if (parts[3] === "cancel") {
        await repo.cancelOrder(order.id);
        return json({ ok: true });
      }
    }

    if (path === "admin/settings" && m === "GET") {
      const key = normalizeKey(PIX_KEY());
      return json({ defaultPriceCents: await repo.defaultPriceCents(), maxUploadMb: maxUploadMb(), pix: { key: `${key.slice(0, 5)}••••${key.slice(-3)}`, name: PIX_NAME(), city: PIX_CITY() } });
    }
    if (path === "admin/settings" && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const c = parsePrice(b.defaultPrice);
      if (c === null) throw new HttpError(400, "Preço inválido.");
      await setSetting("default_price_cents", assertPrice(c));
      return json({ ok: true });
    }
    if (path === "admin/password" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!(await passwordOk(b.current))) throw new HttpError(403, "Senha atual incorreta.");
      if (typeof b.next !== "string" || b.next.length < 8) throw new HttpError(400, "A nova senha deve ter ao menos 8 caracteres.");
      await setSetting("password_hash", await hashPassword(b.next));
      await setSetting("session_epoch", (await epoch()) + 1); // encerra todas as sessões
      return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, COOKIE, "", 0) });
    }

    // ---------- backup (dados do banco, sem os arquivos) e origem para futuras migrações
    if (path === "admin/export" && m === "GET") {
      const part = url.searchParams.get("part") || "meta";
      if (part === "orders") {
        const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));
        return json(await repo.exportOrders(offset, limit));
      }
      return json(await repo.exportMeta());
    }
    if (path === "admin/export/file" && m === "GET") {
      const p = await repo.getPhoto(url.searchParams.get("id"));
      const file = p?.original_path ? await files().get(p.original_path) : null;
      if (!file) throw new HttpError(404, "Arquivo não encontrado.");
      return streamResponse(file, { "content-type": "application/octet-stream", "cache-control": "private, no-store" });
    }

    // ---------- importação do site antigo (Netlify)
    if (path === "admin/import/start" && m === "POST") return json(await importStart(await req.json().catch(() => ({}))));
    if (path === "admin/import/photo" && m === "POST") return json(await importPhoto(await req.json().catch(() => ({}))));
    if (path === "admin/import/orders-list" && m === "POST") return json(await importOrdersList(await req.json().catch(() => ({}))));
    if (path === "admin/import/orders" && m === "POST") return json(await importOrdersPage(await req.json().catch(() => ({}))));
    if (path === "admin/import/config" && m === "POST") return json(await importConfig(await req.json().catch(() => ({}))));
  }

  throw new HttpError(404, "Rota não encontrada.");
}

export async function handle(req) {
  try {
    return await route(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof DbNotConfigured) {
      return json({ error: "O banco de dados ainda não foi conectado ao site.", setup: "database" }, 503);
    }
    if (e instanceof FilesNotConfigured) {
      return json({ error: "O armazenamento de fotos ainda não foi conectado ao site.", setup: "files" }, 503);
    }
    if (e instanceof ConfigError) return json({ error: e.message, setup: "secret" }, 500);
    console.error("[api]", req.method, req.url, e);
    return json({ error: "Erro inesperado. Tente novamente.", detail: `${e?.name || "Erro"}: ${String(e?.message || e).slice(0, 200)}` }, 500);
  }
}

export { closeDb };
