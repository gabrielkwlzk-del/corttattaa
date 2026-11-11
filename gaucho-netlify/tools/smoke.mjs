// Teste de fluxo completo contra um servidor rodando (padrão http://localhost:8888).
// Uso: BASE=http://localhost:8888 ADMIN_PASSWORD=89221570 node tools/smoke.mjs
import assert from "node:assert/strict";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:8888";
const PASS = process.env.ADMIN_PASSWORD || "89221570";
const ok = (m) => console.log("✓", m);
const j = async (r) => ({ s: r.status, b: await r.json().catch(() => null), r });
let cookie = "";
const call = (path, opts = {}) =>
  fetch(BASE + path, { ...opts, headers: { origin: BASE, cookie, ...(opts.headers || {}) }, redirect: "manual" });

// 1. catálogo público
let r = await j(await call("/api/photos"));
assert.equal(r.s, 200);
assert.ok(r.b.photos.length >= 8, "8 fotos de semente");
assert.ok(r.b.photos.every((p) => p.priceCents === 900), "preço padrão R$ 9,00");
assert.ok(!JSON.stringify(r.b).includes("b64") && !JSON.stringify(r.b).includes("orig"), "sem dados de original");
ok(`catálogo: ${r.b.photos.length} fotos a R$ 9,00`);
const seed = r.b.photos[0];
const prev = await call(seed.previewUrl);
assert.equal(prev.status, 200);
assert.equal(prev.headers.get("content-type"), "image/webp");
ok("prévia pública com marca d'água é servida");

// 2. painel exige senha
assert.equal((await call("/api/admin/photos")).status, 401);
assert.equal((await call("/api/admin/orders")).status, 401);
ok("rotas do painel bloqueadas sem login");
r = await j(await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "errada" }) }));
assert.equal(r.s, 401);
ok("senha errada recusada");
r = await j(await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: PASS }) }));
assert.equal(r.s, 200);
const sc = r.r.headers.getSetCookie()[0];
assert.match(sc, /HttpOnly/);
assert.match(sc, /SameSite=Strict/);
cookie = sc.split(";")[0];
ok("login ok, cookie HttpOnly + SameSite=Strict");

// 3. origem cruzada é recusada
const evil = await fetch(BASE + "/api/admin/photos", { method: "PATCH", headers: { origin: "https://evil.example", cookie }, body: "{}" });
assert.equal(evil.status, 403);
ok("requisição de outra origem recusada (CSRF)");

// 4. upload de nova foto (processada no servidor)
const jpg = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "#2a6" } })
  .composite([{ input: Buffer.from('<svg width="1800" height="1200"><circle cx="900" cy="600" r="300" fill="#fc3"/></svg>') }])
  .jpeg({ quality: 90 }).toBuffer();
const fd = new FormData();
fd.set("file", new Blob([jpg], { type: "image/jpeg" }), "teste.jpg");
fd.set("title", "Foto de teste");
fd.set("modalidade", "Corrida");
fd.set("price", "12,50");
r = await j(await call("/api/admin/photos", { method: "POST", body: fd }));
assert.equal(r.s, 201, JSON.stringify(r.b));
const up = r.b.photo;
assert.equal(up.priceCents, 1250);
assert.equal(up.width, 1800);
ok("upload processado: prévia + miniatura geradas, preço R$ 12,50");
const bad = new FormData();
bad.set("file", new Blob([Buffer.from("não é imagem")], { type: "image/jpeg" }), "x.jpg");
assert.equal((await call("/api/admin/photos", { method: "POST", body: bad })).status, 400);
ok("arquivo inválido recusado");
const upPrev = Buffer.from(await (await call(up.previewUrl)).arrayBuffer());
const pm = await sharp(upPrev).metadata();
assert.equal(pm.format, "webp");
assert.ok(Math.max(pm.width, pm.height) <= 1600 && !upPrev.equals(jpg), "prévia reduzida e diferente do original");

const heroRes = await call(up.heroUrl);
assert.equal(heroRes.status, 200);
const heroBuf = Buffer.from(await heroRes.arrayBuffer());
const hm = await sharp(heroBuf).metadata();
assert.equal(hm.format, "webp");
assert.ok(Math.max(hm.width, hm.height) <= 1200 && !heroBuf.equals(upPrev), "fundo do topo é uma versão reduzida e borrada");
assert.equal((await call(seed.heroUrl)).status, 200);
ok("fundo borrado (sem texto) gerado para fotos novas e de exemplo");

// 5. compra: preço vem do servidor
const guest = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { origin: BASE, ...(opts.headers || {}) } });
r = await j(await guest("/api/orders", { method: "POST", body: JSON.stringify({ photoIds: [up.id], email: "cliente@exemplo.com", priceCents: 1, amountCents: 1 }) }));
assert.equal(r.s, 201, JSON.stringify(r.b));
const { token, code } = r.b;
r = await j(await guest(`/api/orders/${token}`));
assert.equal(r.b.status, "pending");
assert.equal(r.b.amountCents, 1250);
assert.match(r.b.copiaECola, /^00020101021226/);
assert.ok(r.b.copiaECola.includes("54051 2.50".replace(" ", "")) || r.b.copiaECola.includes("540512.50"));
assert.ok(r.b.copiaECola.includes("+5547992145561"), "chave Pix do recebedor");
assert.ok(r.b.qrSvg.startsWith("<svg"));
ok(`pedido ${code}: R$ 12,50 (preço do servidor), Pix para +5547992145561, QR gerado`);

// 6. 'Já paguei' não libera; download bloqueado
assert.equal((await j(await guest(`/api/orders/${token}/reported`, { method: "POST" }))).s, 200);
r = await j(await guest(`/api/orders/${token}`));
assert.equal(r.b.status, "pending");
assert.equal(r.b.reported, true);
assert.equal((await guest(`/api/orders/${token}/download/${up.id}`, { method: "POST" })).status, 402);
assert.equal((await guest(`/api/dl?t=forjado.assinatura`)).status, 410);
ok("'Já paguei' não libera nada; download e links forjados bloqueados");

// 7. admin confirma -> libera original
r = await j(await call("/api/admin/orders"));
const ord = r.b.orders.find((o) => o.code === code);
assert.ok(ord && ord.reportedAt);
assert.equal(r.b.orders[0].code === code || r.b.orders.some((o) => o.code === code), true);
assert.equal((await j(await call(`/api/admin/orders/${ord.id}/confirm`, { method: "POST" }))).s, 200);
r = await j(await guest(`/api/orders/${token}`));
assert.equal(r.b.status, "paid");
assert.equal(r.b.copiaECola, undefined);
ok("admin confirmou: pedido pago");
r = await j(await guest(`/api/orders/${token}/download/${up.id}`, { method: "POST" }));
assert.equal(r.s, 200);
const dl = await guest(r.b.url);
assert.equal(dl.status, 200);
assert.match(dl.headers.get("content-disposition"), /attachment; filename="esporte-show-online-foto-de-teste-/);
const got = Buffer.from(await dl.arrayBuffer());
assert.ok(got.equals(jpg), "o arquivo baixado é o original, byte a byte");
ok("download do ORIGINAL por link assinado (byte a byte igual ao enviado)");

// 8. foto de semente também baixa o original
r = await j(await guest("/api/orders", { method: "POST", body: JSON.stringify({ photoIds: [seed.id], email: "outro@exemplo.com" }) }));
const t2 = r.b.token;
const o2 = (await (await call("/api/admin/orders")).json()).orders.find((o) => o.code === r.b.code);
await call(`/api/admin/orders/${o2.id}/confirm`, { method: "POST" });
const l2 = await (await guest(`/api/orders/${t2}/download/${seed.id}`, { method: "POST" })).json();
const f2 = Buffer.from(await (await guest(l2.url)).arrayBuffer());
assert.ok(f2.length > 100_000);
assert.notEqual(f2.length, Buffer.from(await (await guest(seed.previewUrl)).arrayBuffer()).length);
ok("foto de semente: original em alta resolução entregue após o pagamento");

// 9. painel: editar, ocultar, excluir
r = await j(await call(`/api/admin/photos/${up.id}`, { method: "PATCH", body: JSON.stringify({ price: "20,00", hidden: true }) }));
assert.equal(r.b.photo.priceCents, 2000);
r = await j(await call("/api/photos"));
assert.ok(!r.b.photos.some((p) => p.id === up.id), "foto oculta some do site");
assert.equal((await guest(up.previewUrl)).status, 404, "prévia de foto oculta não é pública");
assert.equal((await call(up.previewUrl)).status, 200, "o admin ainda vê a prévia");
r = await j(await call(`/api/admin/photos/${up.id}`, { method: "DELETE" }));
assert.equal(r.b.archived, true, "foto vendida é arquivada, não apagada");
ok("editar preço, ocultar e excluir (vendida é só arquivada)");

// 10. limite de tentativas de senha
let locked = false;
for (let i = 0; i < 7; i++) {
  const x = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { origin: BASE, "x-nf-client-connection-ip": "9.9.9.9" }, body: JSON.stringify({ password: "x" + i }) });
  if (x.status === 429) locked = true;
}
console.log(locked ? "✓ bloqueio após tentativas repetidas" : "• bloqueio por IP não verificado neste ambiente (IP vem do proxy)");
console.log("\nTODOS OS TESTES PASSARAM");
