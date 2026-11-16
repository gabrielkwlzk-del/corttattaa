import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_SECRET = "teste-segredo-0123456789-0123456789-abcdef";
const { buildPix, crc16, isValidCpf, normalizeKey, parseEmv } = await import("../lib/brcode.mjs");
const { hashPassword, makeSession, readSession, readToken, signToken, verifyHash } = await import("../lib/auth.mjs");
const { DEFAULT_PASSWORD_HASH } = await import("../lib/defaults.mjs");
const { parsePrice, assertPrice, slug, isUuid } = await import("../lib/http.mjs");

test("CRC16/CCITT-FALSE", () => assert.equal(crc16("123456789"), "29B1"));

test("a chave 47992145561 é tratada como celular", () => {
  assert.equal(isValidCpf("47992145561"), false);
  assert.equal(normalizeKey("47992145561"), "+5547992145561");
  assert.equal(normalizeKey("(47) 99214-5561"), "+5547992145561");
});

test("BR Code com valor, chave, nome e txid corretos", () => {
  const code = buildPix({ key: "+5547992145561", name: "Esporte Show Online", city: "Brasil", amountCents: 900, txid: "DGABC123" });
  const f = parseEmv(code);
  assert.equal(f["54"], "9.00");
  assert.equal(f["59"], "ESPORTE SHOW ONLINE");
  assert.equal(parseEmv(f["26"])["01"], "+5547992145561");
  assert.equal(parseEmv(f["62"])["05"], "DGABC123");
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
  assert.throws(() => buildPix({ key: "+55", name: "A", city: "B", amountCents: 0, txid: "X" }));
});

test("senha inicial confere com o hash embutido (sem texto puro no código)", async () => {
  assert.equal(await verifyHash("89221570", DEFAULT_PASSWORD_HASH), true);
  assert.equal(await verifyHash("89221571", DEFAULT_PASSWORD_HASH), false);
  assert.ok(!DEFAULT_PASSWORD_HASH.includes("89221570"));
  const h = await hashPassword("outra-senha-123");
  assert.equal(await verifyHash("outra-senha-123", h), true);
});

test("sessão assinada: vale, expira e invalida quando a época muda", () => {
  const t = makeSession(3, 12);
  assert.deepEqual(readSession(t), { epoch: 3 });
  assert.equal(readSession(t.slice(0, -2) + "xx"), null);
  assert.equal(readSession("lixo"), null);
  assert.equal(readSession(makeSession(1, -1)), null, "sessão vencida");
});

test("links assinados de download: vencem e não aceitam adulteração", () => {
  const t = signToken({ o: "pedido", p: "foto" }, 300);
  assert.equal(readToken(t).o, "pedido");
  const [body, sig] = t.split(".");
  assert.equal(readToken(`${Buffer.from(JSON.stringify({ o: "outro", p: "foto", e: 9999999999 })).toString("base64url")}.${sig}`), null);
  assert.equal(readToken(signToken({ o: "x" }, -5)), null);
  assert.equal(readToken(undefined), null);
  void body;
});

test("preços em centavos", () => {
  assert.equal(parsePrice("9,00"), 900);
  assert.equal(parsePrice("R$ 1.234,56"), 123456);
  assert.equal(parsePrice("12,5"), 1250);
  assert.equal(parsePrice("abc"), null);
  assert.equal(assertPrice(900), 900);
  assert.throws(() => assertPrice(50));
  assert.throws(() => assertPrice(1.5));
});

test("utilitários", () => {
  assert.equal(slug("Chegada da Maratona!"), "chegada-da-maratona");
  assert.equal(isUuid("5b316224-104c-45df-a571-7d5a34df7eae"), true);
  assert.equal(isUuid("../../etc"), false);
});
