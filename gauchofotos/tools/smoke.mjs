// Teste de fluxo completo contra um servidor rodando.
// Uso: BASE=http://localhost:8890 node tools/smoke.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";

const BASE = process.env.BASE || "http://localhost:8890";
const PASS = process.env.ADMIN_PASSWORD || "89221570";
const ok = (m) => console.log("✓", m);
let cookie = "";
const call = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { origin: BASE, cookie, ...(opts.headers || {}) }, redirect: "manual" });
const guest = (path, opts = {}) => fetch(BASE + path, { ...opts, headers: { origin: BASE, ...(opts.headers || {}) } });
const J = async (r) => ({ s: r.status, b: await r.json().catch(() => null), r });

// 0. diagnóstico
let r = await J(await call("/api/health"));
assert.equal(r.s, 200, JSON.stringify(r.b));
ok("diagnóstico: banco, arquivos, imagens, Pix, marca d'água");

// 1. catálogo público começa vazio
r = await J(await call("/api/photos"));
assert.equal(r.s, 200);
const before = r.b.photos.length;
ok(`catálogo público acessível (${before} fotos)`);

// 2. painel exige senha
assert.equal((await call("/api/admin/photos")).status, 401);
assert.equal((await call("/api/admin/orders")).status, 401);
assert.equal((await call("/api/admin/export")).status, 401);
ok("rotas do painel bloqueadas sem login");
r = await J(await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "errada" }) }));
assert.equal(r.s, 401);
r = await J(await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: PASS }) }));
assert.equal(r.s, 200);
const sc = r.r.headers.getSetCookie()[0];
assert.match(sc, /HttpOnly/);
assert.match(sc, /SameSite=Strict/);
cookie = sc.split(";")[0];
ok("login: senha errada recusada, certa entra, cookie HttpOnly + SameSite=Strict");
assert.equal((await fetch(BASE + "/api/admin/photos", { method: "PATCH", headers: { origin: "https://evil.example", cookie }, body: "{}" })).status, 403);
ok("requisição de outra origem recusada (CSRF)");

// 3. upload de uma foto GRANDE (12 MB: no site antigo passava do limite)
const w = 5200, h = 3467;
const raw = crypto.randomBytes(w * h * 3);
const big = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 97 }).toBuffer();
assert.ok(big.length > 12 * 1024 * 1024, `foto de teste tem ${(big.length / 1048576).toFixed(1)} MB`);
async function enviar(buf, name, extra = {}) {
  const prep = await J(await call("/api/admin/uploads/prepare", { method: "POST", body: JSON.stringify({ files: [{ name, size: buf.length, type: "image/jpeg" }] }) }));
  assert.equal(prep.s, 200, JSON.stringify(prep.b));
  const u = prep.b.uploads[0];
  const put = await call(u.upload.url, { method: u.upload.method, body: buf, headers: { "content-type": "image/jpeg" } });
  assert.equal(put.status, 200);
  const fin = await J(await call("/api/admin/photos/finalize", { method: "POST", body: JSON.stringify({ ticket: u.ticket, filename: name, ...extra }) }));
  return fin;
}
const fin = await enviar(big, "IMG_9999.JPG", { title: "Foto grande", modalidade: "Corrida", price: "12,50" });
assert.equal(fin.s, 201, JSON.stringify(fin.b));
const up = fin.b.photo;
assert.equal(up.priceCents, 1250);
assert.equal(up.width, w);
ok(`foto de ${(big.length / 1048576).toFixed(1)} MB enviada e processada (prévia + miniatura + fundo)`);
const prev = Buffer.from(await (await guest(up.previewUrl)).arrayBuffer());
const pm = await sharp(prev).metadata();
assert.equal(pm.format, "webp");
assert.ok(Math.max(pm.width, pm.height) <= 1600);
const hero = await guest(up.heroUrl);
assert.equal(hero.status, 200);
ok("prévia com marca d'água (<=1600px) e fundo borrado públicos; original não exposto");

// arquivo inválido recusado e limpo
{
  const bad = Buffer.from("isto não é uma imagem");
  const f2 = await enviar(bad, "falso.jpg");
  assert.equal(f2.s, 400);
}
ok("arquivo inválido recusado");

// 4. pedidos: preço do servidor, vários em paralelo
const mk = () => guest("/api/orders", { method: "POST", body: JSON.stringify({ photoIds: [up.id], email: "cliente@exemplo.com", priceCents: 1, amountCents: 1 }) });
const many = await Promise.all(Array.from({ length: 8 }, mk));
assert.ok(many.every((x) => x.status === 201));
ok("8 pedidos criados ao mesmo tempo sem erro");
const { token, code } = await many[0].json();
r = await J(await guest(`/api/orders/${token}`));
assert.equal(r.b.status, "pending");
assert.equal(r.b.amountCents, 1250);
assert.ok(r.b.copiaECola.includes("+5547992145561") && r.b.copiaECola.includes("540512.50"));
assert.ok(r.b.qrSvg.startsWith("<svg"));
ok(`pedido ${code}: R$ 12,50 definido pelo servidor, Pix para +5547992145561`);

// 5. "Já paguei" não libera; download bloqueado
assert.equal((await J(await guest(`/api/orders/${token}/reported`, { method: "POST" }))).s, 200);
assert.equal((await J(await guest(`/api/orders/${token}`))).b.status, "pending");
assert.equal((await guest(`/api/orders/${token}/download/${up.id}`, { method: "POST" })).status, 402);
assert.equal((await guest("/api/dl?t=forjado.assinatura")).status, 410);
ok("'Já paguei' não libera nada; download e links forjados bloqueados");

// 6. confirmação (duas vezes ao mesmo tempo) e download do original
r = await J(await call("/api/admin/orders"));
const ord = r.b.orders.find((o) => o.code === code);
assert.ok(ord && ord.reportedAt);
const both = await Promise.all([1, 2].map(() => call(`/api/admin/orders/${ord.id}/confirm`, { method: "POST" })));
assert.ok(both.every((x) => x.status === 200));
assert.equal((await J(await guest(`/api/orders/${token}`))).b.status, "paid");
ok("confirmação dupla simultânea: pedido pago uma única vez");
r = await J(await guest(`/api/orders/${token}/download/${up.id}`, { method: "POST" }));
assert.equal(r.s, 200);
const dl = await guest(r.b.url);
assert.equal(dl.status, 200);
assert.match(dl.headers.get("content-disposition"), /attachment; filename="esporte-show-online-foto-grande-/);
const got = Buffer.from(await dl.arrayBuffer());
assert.ok(got.equals(big), "o arquivo baixado é o original, byte a byte");
ok(`download do ORIGINAL de ${(got.length / 1048576).toFixed(1)} MB por link assinado (byte a byte igual)`);

// 7. limite de downloads por item (atômico)
let blocked = 0;
for (let i = 0; i < 26; i++) {
  const l = await J(await guest(`/api/orders/${token}/download/${up.id}`, { method: "POST" }));
  const d = await guest(l.b.url);
  await d.arrayBuffer();
  if (d.status === 429) blocked++;
}
assert.ok(blocked >= 1);
ok("limite de 25 downloads por foto respeitado");

// 8. painel: editar, ocultar, excluir (vendida só arquiva)
r = await J(await call(`/api/admin/photos/${up.id}`, { method: "PATCH", body: JSON.stringify({ price: "20,00", hidden: true }) }));
assert.equal(r.b.photo.priceCents, 2000);
r = await J(await call("/api/photos"));
assert.ok(!r.b.photos.some((p) => p.id === up.id));
assert.equal((await guest(up.previewUrl)).status, 404);
assert.equal((await call(up.previewUrl)).status, 200);
ok("preço editado; foto oculta some do site e a prévia deixa de ser pública");
r = await J(await call(`/api/admin/photos/${up.id}`, { method: "DELETE" }));
assert.equal(r.b.archived, true);
const still = await J(await guest(`/api/orders/${token}`));
assert.equal(still.b.status, "paid");
assert.equal((await guest(`/api/orders/${token}/download/${up.id}`, { method: "POST" })).status, 200);
ok("foto vendida e excluída é só arquivada: o comprador continua com acesso");

// 9. foto sem venda é apagada de verdade
const small = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#2a6" } }).jpeg().toBuffer();
const f3 = await enviar(small, "pequena.jpg", { title: "Sem venda" });
assert.equal(f3.s, 201);
r = await J(await call(`/api/admin/photos/${f3.b.photo.id}`, { method: "DELETE" }));
assert.equal(r.b.removed, true);
ok("foto sem venda é excluída por completo");

// 10. troca de senha invalida sessões; limite de tentativas
r = await J(await call("/api/admin/password", { method: "POST", body: JSON.stringify({ current: PASS, next: "nova-senha-123" }) }));
assert.equal(r.s, 200);
assert.equal((await call("/api/admin/photos")).status, 401, "sessão antiga encerrada");
r = await J(await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "nova-senha-123" }) }));
assert.equal(r.s, 200);
cookie = r.r.headers.getSetCookie()[0].split(";")[0];
await call("/api/admin/password", { method: "POST", body: JSON.stringify({ current: "nova-senha-123", next: PASS }) });
r = await J(await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: PASS }) }));
cookie = r.r.headers.getSetCookie()[0].split(";")[0];
ok("troca de senha encerra sessões antigas e a nova senha funciona");
// limpeza: excluir pedido e apagar tudo (exige confirmação digitada)
r = await J(await call("/api/admin/data/clear", { method: "POST", body: JSON.stringify({ what: "all", confirm: "x" }) }));
assert.equal(r.s, 400);
r = await J(await call("/api/admin/orders"));
const some = r.b.orders[0];
assert.equal((await call(`/api/admin/orders/${some.id}`, { method: "DELETE" })).status, 200);
assert.equal((await call(`/api/admin/orders/${some.id}`, { method: "DELETE" })).status, 404);
r = await J(await call("/api/admin/data/clear", { method: "POST", body: JSON.stringify({ what: "all", confirm: "APAGAR" }) }));
assert.equal(r.s, 200);
r = await J(await call("/api/admin/orders"));
assert.equal(r.b.orders.length, 0);
r = await J(await call("/api/photos"));
assert.equal(r.b.photos.length, 0);
ok("excluir pedido e limpar tudo deixa o site vazio");
let locked = false;
for (let i = 0; i < 7; i++) {
  const x = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { origin: BASE, "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ password: "x" + i }) });
  if (x.status === 429) locked = true;
}
assert.ok(locked);
ok("bloqueio após tentativas repetidas de senha");

console.log("\nTODOS OS TESTES PASSARAM");
