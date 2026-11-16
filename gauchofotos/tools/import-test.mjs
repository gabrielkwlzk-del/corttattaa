// Teste da migração: cria dados no site ANTIGO (Netlify, rodando local), importa no site NOVO e confere tudo.
// Uso: OLD=http://localhost:8888 NEW=http://localhost:8890 node tools/import-test.mjs
import assert from "node:assert/strict";
import sharp from "sharp";

const OLD = process.env.OLD || "http://localhost:8888";
const NEW = process.env.NEW || "http://localhost:8890";
const ok = (m) => console.log("✓", m);
const J = async (r) => ({ s: r.status, b: await r.json().catch(() => null), r });
const mk = (base) => {
  let cookie = "";
  const call = (p, o = {}) => fetch(base + p, { ...o, headers: { origin: base, cookie, ...(o.headers || {}) } });
  return { call, setCookie: (c) => (cookie = c) };
};
const oldS = mk(OLD);
const newS = mk(NEW);

// ---- 1. dados no site antigo
let r = await J(await oldS.call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "89221570" }) }));
assert.equal(r.s, 200, "login no site antigo");
oldS.setCookie(r.r.headers.getSetCookie()[0].split(";")[0]);

const imgs = [];
for (const [i, [w, h, fmt]] of [[1600, 1000, "jpeg"], [1200, 1200, "png"], [1400, 900, "jpeg"]].entries()) {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: ["#c33", "#3a6", "#36c"][i] } }).composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="#fc0"/></svg>`) }])[fmt]().toBuffer();
  const fd = new FormData();
  fd.set("file", new Blob([buf], { type: `image/${fmt}` }), `foto-${i + 1}.${fmt === "jpeg" ? "jpg" : fmt}`);
  fd.set("title", ["Chegada da maratona", "Sprint final", "Foto oculta"][i]);
  fd.set("modalidade", ["Corrida", "Corrida", "Ciclismo"][i]);
  fd.set("evento", ["Maratona de Teste", "", ""][i]);
  fd.set("price", ["9,00", "15,50", "7,00"][i]);
  const up = await J(await oldS.call("/api/admin/photos", { method: "POST", body: fd }));
  assert.equal(up.s, 201, JSON.stringify(up.b));
  imgs.push({ buf, photo: up.b.photo });
}
await oldS.call(`/api/admin/photos/${imgs[2].photo.id}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) });

const newOrder = async (photo, email) => (await J(await fetch(OLD + "/api/orders", { method: "POST", headers: { origin: OLD }, body: JSON.stringify({ photoIds: [photo.id], email, name: "Cliente" }) }))).b;
const oA = await newOrder(imgs[0].photo, "a@exemplo.com"); // pago + baixado
const oB = await newOrder(imgs[1].photo, "b@exemplo.com"); // pendente (cliente avisou)
const oC = await newOrder(imgs[0].photo, "c@exemplo.com"); // cancelado
const list = (await J(await oldS.call("/api/admin/orders"))).b.orders;
const idOf = (o) => list.find((x) => x.code === o.code).id;
await oldS.call(`/api/admin/orders/${idOf(oA)}/confirm`, { method: "POST" });
await oldS.call(`/api/admin/orders/${idOf(oC)}/cancel`, { method: "POST" });
await fetch(`${OLD}/api/orders/${oB.token}/reported`, { method: "POST", headers: { origin: OLD } });
const dlOld = await J(await fetch(`${OLD}/api/orders/${oA.token}/download/${imgs[0].photo.id}`, { method: "POST", headers: { origin: OLD } }));
await (await fetch(OLD + dlOld.b.url)).arrayBuffer();
const oldPendingPix = (await J(await fetch(`${OLD}/api/orders/${oB.token}`))).b.copiaECola;
ok("site antigo preparado: 3 fotos (1 oculta), pedido pago e baixado, pendente, cancelado");

// ---- 2. importar no site novo
r = await J(await newS.call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "89221570" }) }));
assert.equal(r.s, 200, "login no site novo");
newS.setCookie(r.r.headers.getSetCookie()[0].split(";")[0]);

r = await J(await newS.call("/api/admin/import/start", { method: "POST", body: JSON.stringify({ url: OLD, password: "senha-errada" }) }));
assert.equal(r.s, 400);
assert.match(r.b.error, /Senha do site antigo incorreta/);
r = await J(await newS.call("/api/admin/import/start", { method: "POST", body: JSON.stringify({ url: "https://evil.example.com", password: "x" }) }));
assert.equal(r.s, 400);
r = await J(await newS.call("/api/admin/import/start", { method: "POST", body: JSON.stringify({ url: "http://169.254.169.254", password: "x" }) }));
assert.equal(r.s, 400);
ok("importação recusa senha errada e endereços que não sejam do site antigo (SSRF)");

async function importAll() {
  const start = await J(await newS.call("/api/admin/import/start", { method: "POST", body: JSON.stringify({ url: OLD, password: "89221570" }) }));
  assert.equal(start.s, 200, JSON.stringify(start.b));
  const { cookie, meta } = start.b;
  assert.equal(meta.photos.length, 3);
  for (const p of meta.photos) {
    const x = await J(await newS.call("/api/admin/import/photo", { method: "POST", body: JSON.stringify({ url: OLD, cookie, photo: p }) }));
    assert.equal(x.s, 200, JSON.stringify(x.b));
  }
  let offset = 0;
  let imported = 0;
  for (;;) {
    const x = await J(await newS.call("/api/admin/import/orders", { method: "POST", body: JSON.stringify({ url: OLD, cookie, offset }) }));
    assert.equal(x.s, 200, JSON.stringify(x.b));
    imported += x.b.imported;
    if (x.b.next == null) break;
    offset = x.b.next;
  }
  const cfg = await J(await newS.call("/api/admin/import/config", { method: "POST", body: JSON.stringify({ url: OLD, cookie, password: "89221570", keepPassword: false }) }));
  assert.equal(cfg.s, 200);
  return { imported };
}
const first = await importAll();
assert.equal(first.imported, 3);
ok("importação concluída: 3 fotos e 3 pedidos");

// ---- 3. conferir no site novo
const admin = (await J(await newS.call("/api/admin/photos"))).b.photos;
assert.equal(admin.length, 3);
for (const { photo } of imgs) {
  const n = admin.find((p) => p.id === photo.id);
  assert.ok(n, "mesmo id de foto");
  assert.equal(n.title, photo.title);
  assert.equal(n.priceCents, photo.priceCents);
  assert.equal(n.modalidade, photo.modalidade);
}
assert.equal(admin.find((p) => p.id === imgs[2].photo.id).hidden, true);
const pub = (await J(await fetch(NEW + "/api/photos"))).b.photos;
assert.equal(pub.length, 2);
assert.ok(pub.some((p) => p.id === imgs[0].photo.id && p.priceCents === 900));
ok("fotos: mesmos ids, títulos, preços, modalidades; a oculta continua oculta");

const a = (await J(await fetch(`${NEW}/api/orders/${oA.token}`))).b;
assert.equal(a.status, "paid");
assert.equal(a.code, oA.code);
const dl = await J(await fetch(`${NEW}/api/orders/${oA.token}/download/${imgs[0].photo.id}`, { method: "POST", headers: { origin: NEW } }));
assert.equal(dl.s, 200);
const file = Buffer.from(await (await fetch(NEW + dl.b.url)).arrayBuffer());
assert.ok(file.equals(imgs[0].buf), "original idêntico ao enviado no site antigo");
ok("o MESMO link de pedido do cliente funciona no site novo e baixa o original idêntico");

const b = (await J(await fetch(`${NEW}/api/orders/${oB.token}`))).b;
assert.equal(b.status, "pending");
assert.equal(b.reported, true);
assert.equal(b.copiaECola, oldPendingPix);
const c = (await J(await fetch(`${NEW}/api/orders/${oC.token}`))).b;
assert.equal(c.status, "cancelled");
ok("pedido pendente mantém o mesmo Pix; cancelado continua cancelado");

const orders = (await J(await newS.call("/api/admin/orders"))).b;
assert.equal(orders.stats.paid, 1);
assert.equal(orders.stats.revenueCents, 900);
ok("painel novo mostra faturamento e status corretos");

// ---- 4. rodar de novo não duplica nada
const second = await importAll();
assert.equal(second.imported, 0);
assert.equal((await J(await newS.call("/api/admin/photos"))).b.photos.length, 3);
assert.equal((await J(await newS.call("/api/admin/orders"))).b.orders.length, 3);
ok("importar de novo não duplica nada (seguro repetir)");

console.log("\nMIGRAÇÃO VALIDADA");
