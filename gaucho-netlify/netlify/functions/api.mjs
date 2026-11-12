import crypto from "node:crypto";
import QRCode from "qrcode";
import { buildPix, normalizeKey } from "../lib/brcode.mjs";
import { hashPassword, orderCode, randomToken, safeEqual, sha256, verifyHash } from "../lib/auth.mjs";
import { DEFAULT_PASSWORD_HASH } from "../lib/defaults.mjs";
import { db, del, getConfig, getJSON, listJSON, listKeys, readSignedToken, saveConfig, setJSON, signedToken } from "../lib/store.mjs";

export const config = { path: "/api/*" };

// ---------------------------------------------------------------- config --
const PIX_KEY = () => process.env.PIX_KEY || "47992145561";
const PIX_NAME = () => process.env.PIX_NAME || "Esporte Show Online";
const PIX_CITY = () => process.env.PIX_CITY || "BRASIL";
const COOKIE = "dg_admin";
const SESSION_HOURS = 12;
const MAX_UPLOAD = 5 * 1024 * 1024; // limite de corpo das Netlify Functions (~6 MB)
const MAX_DOWNLOADS = 25;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const slug = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "foto";

function parsePrice(input) {
  let s = String(input ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ""] = s.split(".");
  return Number(i) * 100 + Number((d + "00").slice(0, 2));
}
const assertPrice = (c) => {
  if (!Number.isInteger(c) || c < 100 || c > 10_000_000) throw new HttpError(400, "Preço inválido. Use entre R$ 1,00 e R$ 100.000,00.");
  return c;
};

// ------------------------------------------------------------------ cookies --
function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
const isHttps = (req) => new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
const cookieHeader = (req, value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;

function assertSameOrigin(req) {
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
  const mine = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  if (host !== mine && host !== new URL(req.url).host) throw new HttpError(403, "Origem não permitida.");
}

async function isAdmin(req) {
  const token = readCookie(req, COOKIE);
  if (!token || token.length > 100) return false;
  const s = await getJSON(`session/${sha256(token)}`);
  return Boolean(s && s.exp > Date.now());
}
async function requireAdmin(req) {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  if (!(await isAdmin(req))) throw new HttpError(401, "Sessão expirada. Entre novamente.");
}

// ------------------------------------------------------------ rate limiting --
async function rateLimit(key, limit, windowMs) {
  const k = `rl/${key}`;
  const now = Date.now();
  let r = await getJSON(k);
  if (!r || r.reset < now) r = { count: 0, reset: now + windowMs };
  r.count++;
  await setJSON(k, r);
  if (r.count > limit) throw new HttpError(429, "Muitas requisições. Aguarde um instante.");
}

// ------------------------------------------------------------------- photos --
async function ensureSeed() {
  const cfg = await getConfig();
  if (cfg.seeded) return;
  const { SEED } = await import("../lib/seed-data.mjs");
  const base = Date.UTC(2026, 10, 1);
  await Promise.all(
    SEED.map(async (s, i) => {
      if (await getJSON(`photo/${s.id}`)) return;
      await setJSON(`photo/${s.id}`, {
        id: s.id,
        seed: true,
        title: s.title,
        description: "",
        modalidade: s.modalidade,
        evento: "",
        priceCents: cfg.defaultPriceCents,
        width: s.width,
        height: s.height,
        format: s.format,
        hidden: false,
        deleted: false,
        v: 1,
        createdAt: new Date(base + (SEED.length - i) * 1000).toISOString(),
      });
    }),
  );
  await saveConfig({ seeded: true });
}

const urls = (p) =>
  p.seed
    ? { thumbUrl: `/p/${p.id}-t.webp`, previewUrl: `/p/${p.id}.webp`, heroUrl: `/p/${p.id}-h.webp` }
    : {
        thumbUrl: `/api/preview/${p.id}/thumb?v=${p.v ?? 1}`,
        previewUrl: `/api/preview/${p.id}/preview?v=${p.v ?? 1}`,
        heroUrl: `/api/preview/${p.id}/hero?v=${p.v ?? 1}`,
      };

const publicPhoto = (p) => ({
  id: p.id,
  title: p.title,
  description: p.description || "",
  modalidade: p.modalidade || "",
  evento: p.evento || "",
  priceCents: p.priceCents,
  width: p.width,
  height: p.height,
  ...urls(p),
});

const adminPhoto = (p) => ({ ...publicPhoto(p), hidden: Boolean(p.hidden), seed: Boolean(p.seed), createdAt: p.createdAt });

async function allPhotos() {
  await ensureSeed();
  const list = await listJSON("photo/");
  return list.filter((p) => !p.deleted).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function readOriginal(p) {
  if (p.seed) {
    const { SEED } = await import("../lib/seed-data.mjs");
    const s = SEED.find((x) => x.id === p.id);
    return s ? Buffer.from(s.b64, "base64") : null;
  }
  const data = await db().get(`file/orig/${p.id}`, { type: "arrayBuffer" });
  return data ? Buffer.from(data) : null;
}

async function uploadPhoto(req) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_UPLOAD + 400_000) throw new HttpError(413, "Arquivo maior que 5 MB. Reduza o tamanho e tente de novo.");
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Nenhum arquivo enviado.");
  if (file.size > MAX_UPLOAD) throw new HttpError(413, `"${file.name}" tem mais de 5 MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { processImage, ImageError } = await import("../lib/images.mjs");
  let img;
  try {
    img = await processImage(buffer);
  } catch (e) {
    if (e instanceof ImageError) throw new HttpError(400, `${file.name}: ${e.message}`);
    throw e;
  }
  const cfg = await getConfig();
  const priceInput = String(form.get("price") || "").trim();
  const priceCents = priceInput ? assertPrice(parsePrice(priceInput)) : cfg.defaultPriceCents;
  const id = crypto.randomUUID();
  const title = String(form.get("title") || "").trim() || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  await Promise.all([
    db().set(`file/orig/${id}`, ab(buffer)),
    db().set(`file/prev/${id}`, ab(img.preview)),
    db().set(`file/thumb/${id}`, ab(img.thumb)),
    db().set(`file/hero/${id}`, ab(img.hero)),
  ]);
  const photo = {
    id,
    seed: false,
    title: title.slice(0, 160),
    description: "",
    modalidade: String(form.get("modalidade") || "").trim().slice(0, 60),
    evento: String(form.get("evento") || "").trim().slice(0, 120),
    priceCents,
    width: img.width,
    height: img.height,
    format: img.format,
    hidden: false,
    deleted: false,
    v: 1,
    createdAt: new Date().toISOString(),
  };
  await setJSON(`photo/${id}`, photo);
  return photo;
}

// ------------------------------------------------------------------- orders --
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

async function createOrder(req, ip) {
  await rateLimit(`order-${sha256(ip)}`, 20, 3_600_000);
  const body = await req.json().catch(() => ({}));
  const ids = [...new Set(Array.isArray(body.photoIds) ? body.photoIds.map(String) : body.photoId ? [String(body.photoId)] : [])];
  if (!ids.length) throw new HttpError(400, "Selecione uma fotografia.");
  if (ids.length > 10) throw new HttpError(400, "Muitas fotografias em um pedido.");
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "Informe um e-mail válido.");
  const name = String(body.name ?? "").trim().slice(0, 120);

  await ensureSeed();
  const items = [];
  for (const id of ids) {
    const p = await getJSON(`photo/${id}`);
    if (!p || p.deleted || p.hidden) throw new HttpError(409, "Alguma fotografia não está mais disponível.");
    // O preço vem SEMPRE do servidor; qualquer valor enviado pelo navegador é ignorado.
    items.push({ photoId: p.id, title: p.title, priceCents: p.priceCents, downloads: 0 });
  }
  const amountCents = items.reduce((s, i) => s + i.priceCents, 0);
  const code = orderCode();
  const token = randomToken(32);
  const id = sha256(token);
  const pix = buildPix({ key: normalizeKey(PIX_KEY()), name: PIX_NAME(), city: PIX_CITY(), amountCents, txid: code });
  const order = { id, code, status: "pending", amountCents, items, email, name, pix, createdAt: new Date().toISOString(), reportedAt: null, paidAt: null };
  await setJSON(`order/${id}`, order);
  return { token, code, url: `/pedido/${token}` };
}

const validToken = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(t);
async function orderByToken(token) {
  if (!validToken(token)) return null;
  return getJSON(`order/${sha256(token)}`);
}

async function publicOrder(order) {
  const photos = await Promise.all(order.items.map((i) => getJSON(`photo/${i.photoId}`)));
  const out = {
    code: order.code,
    status: order.status,
    amountCents: order.amountCents,
    reported: Boolean(order.reportedAt),
    paidAt: order.paidAt,
    items: order.items.map((i, n) => ({ photoId: i.photoId, title: i.title, priceCents: i.priceCents, thumbUrl: photos[n] ? urls(photos[n]).thumbUrl : "" })),
  };
  if (order.status === "pending") {
    out.copiaECola = order.pix;
    out.qrSvg = await QRCode.toString(order.pix, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#08090D", light: "#FFFFFF" } });
  }
  return out;
}

// -------------------------------------------------------------------- admin --
async function passwordOk(password) {
  const cfg = await getConfig();
  if (typeof password !== "string" || !password || password.length > 200) return false;
  if (cfg.passwordHash) return verifyHash(password, cfg.passwordHash);
  if (process.env.ADMIN_PASSWORD) return safeEqual(sha256(password), sha256(process.env.ADMIN_PASSWORD));
  return verifyHash(password, DEFAULT_PASSWORD_HASH);
}

async function login(req, ip) {
  const key = `attempt/${sha256(ip)}`;
  const now = Date.now();
  let a = await getJSON(key);
  if (a && a.first + 15 * 60_000 < now) a = null;
  if (a && a.count >= 5) {
    const wait = Math.ceil((a.first + 15 * 60_000 - now) / 60_000);
    throw new HttpError(429, `Muitas tentativas. Tente novamente em ${wait} min.`);
  }
  const { password } = await req.json().catch(() => ({}));
  if (!(await passwordOk(password))) {
    await setJSON(key, { count: (a?.count ?? 0) + 1, first: a?.first ?? now });
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, "Senha incorreta.");
  }
  await del(key);
  const token = randomToken(32);
  await setJSON(`session/${sha256(token)}`, { exp: now + SESSION_HOURS * 3_600_000 });
  return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, token, SESSION_HOURS * 3600) });
}

async function adminOrders() {
  const list = await listJSON("order/");
  return list
    .map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      amountCents: o.amountCents,
      email: o.email,
      name: o.name,
      titles: o.items.map((i) => i.title).join(", "),
      createdAt: o.createdAt,
      reportedAt: o.reportedAt,
      paidAt: o.paidAt,
    }))
    .sort((a, b) => {
      const pa = a.status === "pending" ? (a.reportedAt ? 0 : 1) : 2;
      const pb = b.status === "pending" ? (b.reportedAt ? 0 : 1) : 2;
      return pa - pb || (a.createdAt < b.createdAt ? 1 : -1);
    });
}

// ------------------------------------------------------------------- router --
async function handle(req, context) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const parts = path.split("/");
  const m = req.method;
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";

  // ---------- diagnóstico: testa cada peça e mostra qual falhou (sem expor segredos)
  if (path === "health" && m === "GET") {
    const checks = {};
    const run = async (name, fn) => {
      try {
        await fn();
        checks[name] = "ok";
      } catch (e) {
        checks[name] = `FALHOU: ${e?.name || "Erro"}: ${String(e?.message || e).slice(0, 220)}`;
      }
    };
    await run("armazenamento (Netlify Blobs)", async () => {
      await db().set("health/ping", String(Date.now()));
      if (!(await db().get("health/ping"))) throw new Error("não leu o que gravou");
    });
    await run("configuração", () => getConfig());
    await run("QR Code", () => QRCode.toString("teste", { type: "svg" }));
    await run("Pix (BR Code)", async () => buildPix({ key: normalizeKey(PIX_KEY()), name: PIX_NAME(), city: PIX_CITY(), amountCents: 900, txid: "TESTE" }));
    await run("marca d'água (fonte)", async () => (await import("../lib/watermark.mjs")).watermarkSvg(400, 300));
    await run("imagens (sharp)", async () => {
      const { default: sharp } = await import("sharp");
      await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
    });
    await run("fotos de exemplo", async () => (await import("../lib/seed-data.mjs")).SEED.length);
    const ok = Object.values(checks).every((v) => v === "ok");
    return json({ ok, node: process.version, senhaPorVariavel: Boolean(process.env.ADMIN_PASSWORD), checks }, ok ? 200 : 500);
  }

  // ---------- público
  if (path === "photos" && m === "GET") {
    const photos = (await allPhotos()).filter((p) => !p.hidden).map(publicPhoto);
    return json({ photos }, 200, {
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=15, stale-while-revalidate=60",
    });
  }

  if (parts[0] === "preview" && parts.length === 3 && m === "GET") {
    const [, id, variant] = parts;
    const p = await getJSON(`photo/${id}`);
    const admin = await isAdmin(req);
    if (!p || p.seed || p.deleted || (p.hidden && !admin)) return json({ error: "Não encontrado." }, 404);
    const kind = variant === "thumb" ? "thumb" : variant === "hero" ? "hero" : "prev";
    let data = await db().get(`file/${kind}/${id}`, { type: "arrayBuffer" });
    // Fotos antigas sem versão de fundo: usa a miniatura (que já tem marca d'água).
    if (!data && kind === "hero") data = await db().get(`file/thumb/${id}`, { type: "arrayBuffer" });
    if (!data) return json({ error: "Não encontrado." }, 404);
    return new Response(data, {
      headers: {
        "content-type": "image/webp",
        "cache-control": p.hidden ? "private, no-store" : "public, max-age=31536000, immutable",
        "content-disposition": "inline",
      },
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
      if (order.status === "pending" && !order.reportedAt) {
        order.reportedAt = new Date().toISOString();
        await setJSON(`order/${order.id}`, order);
      }
      return json({ ok: true });
    }
    if (parts[2] === "download" && parts[3] && m === "POST") {
      assertSameOrigin(req);
      if (order.status !== "paid") throw new HttpError(402, "Pagamento ainda não confirmado.");
      const item = order.items.find((i) => i.photoId === parts[3]);
      if (!item) throw new HttpError(404, "Item não encontrado.");
      const token = await signedToken({ o: order.id, p: item.photoId }, 300);
      return json({ url: `/api/dl?t=${encodeURIComponent(token)}` });
    }
  }

  // Entrega do original: só com link assinado, temporário (5 min) e pedido pago.
  if (path === "dl" && m === "GET") {
    const data = await readSignedToken(url.searchParams.get("t") || "");
    if (!data) throw new HttpError(410, "Link expirado. Volte à página do pedido para gerar um novo.");
    const order = await getJSON(`order/${data.o}`);
    if (!order || order.status !== "paid") throw new HttpError(402, "Pagamento não confirmado.");
    const item = order.items.find((i) => i.photoId === data.p);
    if (!item) throw new HttpError(404, "Item não encontrado.");
    if ((item.downloads ?? 0) >= MAX_DOWNLOADS) throw new HttpError(429, "Limite de downloads atingido. Fale conosco.");
    const photo = await getJSON(`photo/${item.photoId}`);
    const file = photo ? await readOriginal(photo) : null;
    if (!file) throw new HttpError(410, "Arquivo indisponível.");
    item.downloads = (item.downloads ?? 0) + 1;
    await setJSON(`order/${order.id}`, order);
    const ext = photo.format === "jpeg" ? "jpg" : photo.format || "jpg";
    return new Response(file, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="esporte-show-online-${slug(item.title)}-${order.code}.${ext}"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  }

  // ---------- administração
  if (path === "admin/login" && m === "POST") {
    assertSameOrigin(req);
    return login(req, ip);
  }
  if (path === "admin/logout" && m === "POST") {
    assertSameOrigin(req);
    const token = readCookie(req, COOKIE);
    if (token) await del(`session/${sha256(token)}`);
    return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, "", 0) });
  }
  if (path === "admin/me" && m === "GET") return json({ admin: await isAdmin(req) });

  if (parts[0] === "admin") {
    await requireAdmin(req);

    if (path === "admin/photos" && m === "GET") return json({ photos: (await allPhotos()).map(adminPhoto) });
    if (path === "admin/photos" && m === "POST") return json({ photo: adminPhoto(await uploadPhoto(req)) }, 201);

    if (parts[1] === "photos" && parts[2]) {
      const p = await getJSON(`photo/${parts[2]}`);
      if (!p || p.deleted) throw new HttpError(404, "Fotografia não encontrada.");
      if (m === "PATCH") {
        const b = await req.json().catch(() => ({}));
        if (b.title !== undefined) p.title = String(b.title).trim().slice(0, 160);
        if (b.description !== undefined) p.description = String(b.description).trim().slice(0, 2000);
        if (b.modalidade !== undefined) p.modalidade = String(b.modalidade).trim().slice(0, 60);
        if (b.evento !== undefined) p.evento = String(b.evento).trim().slice(0, 120);
        if (b.hidden !== undefined) p.hidden = Boolean(b.hidden);
        if (b.price !== undefined) {
          const c = parsePrice(b.price);
          if (c === null) throw new HttpError(400, "Preço inválido.");
          p.priceCents = assertPrice(c);
        }
        await setJSON(`photo/${p.id}`, p);
        return json({ photo: adminPhoto(p) });
      }
      if (m === "DELETE") {
        // Se já foi vendida, apenas arquiva (o comprador mantém o acesso ao original).
        const orders = await listJSON("order/");
        const used = orders.some((o) => o.items.some((i) => i.photoId === p.id));
        if (used || p.seed) {
          p.deleted = true;
          p.hidden = true;
          await setJSON(`photo/${p.id}`, p);
          return json({ archived: true });
        }
        await Promise.all([del(`photo/${p.id}`), del(`file/orig/${p.id}`), del(`file/prev/${p.id}`), del(`file/thumb/${p.id}`), del(`file/hero/${p.id}`)]);
        return json({ removed: true });
      }
    }

    if (path === "admin/orders" && m === "GET") {
      const orders = await adminOrders();
      const paid = orders.filter((o) => o.status === "paid");
      return json({
        orders,
        stats: {
          revenueCents: paid.reduce((s, o) => s + o.amountCents, 0),
          paid: paid.length,
          pending: orders.filter((o) => o.status === "pending").length,
          awaitingReview: orders.filter((o) => o.status === "pending" && o.reportedAt).length,
        },
      });
    }
    if (parts[1] === "orders" && parts[2] && parts[3] && m === "POST") {
      const order = await getJSON(`order/${parts[2]}`);
      if (!order) throw new HttpError(404, "Pedido não encontrado.");
      if (parts[3] === "confirm") {
        if (order.status !== "paid") {
          if (order.status !== "pending") throw new HttpError(409, "Este pedido não está aguardando pagamento.");
          order.status = "paid";
          order.paidAt = new Date().toISOString();
          order.confirmedBy = "admin";
          await setJSON(`order/${order.id}`, order);
        }
        return json({ ok: true });
      }
      if (parts[3] === "cancel") {
        if (order.status === "pending") {
          order.status = "cancelled";
          await setJSON(`order/${order.id}`, order);
        }
        return json({ ok: true });
      }
    }

    if (path === "admin/settings" && m === "GET") {
      const cfg = await getConfig();
      const key = normalizeKey(PIX_KEY());
      return json({ defaultPriceCents: cfg.defaultPriceCents, pix: { key: `${key.slice(0, 5)}••••${key.slice(-3)}`, name: PIX_NAME(), city: PIX_CITY() } });
    }
    if (path === "admin/settings" && m === "PUT") {
      const b = await req.json().catch(() => ({}));
      const c = parsePrice(b.defaultPrice);
      if (c === null) throw new HttpError(400, "Preço inválido.");
      await saveConfig({ defaultPriceCents: assertPrice(c) });
      return json({ ok: true });
    }
    if (path === "admin/password" && m === "POST") {
      const b = await req.json().catch(() => ({}));
      if (!(await passwordOk(b.current))) throw new HttpError(403, "Senha atual incorreta.");
      if (typeof b.next !== "string" || b.next.length < 8) throw new HttpError(400, "A nova senha deve ter ao menos 8 caracteres.");
      await saveConfig({ passwordHash: await hashPassword(b.next) });
      for (const k of await listKeys("session/")) await del(k);
      return json({ ok: true }, 200, { "set-cookie": cookieHeader(req, "", 0) });
    }
  }

  throw new HttpError(404, "Rota não encontrada.");
}

export default async (req, context) => {
  try {
    return await handle(req, context);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("[api]", e);
    return json({ error: "Erro inesperado. Tente novamente.", detail: `${e?.name || "Erro"}: ${String(e?.message || e).slice(0, 200)}` }, 500);
  }
};
