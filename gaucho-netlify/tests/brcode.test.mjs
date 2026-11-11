import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPix, crc16, isValidCpf, normalizeKey, parseEmv } from "../netlify/lib/brcode.mjs";
import { hashPassword, verifyHash } from "../netlify/lib/auth.mjs";
import { DEFAULT_PASSWORD_HASH } from "../netlify/lib/defaults.mjs";

test("CRC16/CCITT-FALSE", () => assert.equal(crc16("123456789"), "29B1"));

test("a chave 47992145561 é tratada como celular", () => {
  assert.equal(isValidCpf("47992145561"), false);
  assert.equal(normalizeKey("47992145561"), "+5547992145561");
  assert.equal(normalizeKey("(47) 99214-5561"), "+5547992145561");
  assert.equal(normalizeKey("529.982.247-25"), "52998224725");
});

test("BR Code com valor, chave, nome e txid corretos", () => {
  const code = buildPix({ key: "+5547992145561", name: "Diário do Gaúcho", city: "Brasil", amountCents: 900, txid: "DGABC123" });
  const f = parseEmv(code);
  assert.equal(f["53"], "986");
  assert.equal(f["54"], "9.00");
  assert.equal(f["59"], "DIARIO DO GAUCHO");
  assert.equal(parseEmv(f["26"])["01"], "+5547992145561");
  assert.equal(parseEmv(f["62"])["05"], "DGABC123");
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
  assert.throws(() => buildPix({ key: "+55", name: "A", city: "B", amountCents: 0, txid: "X" }));
});

test("senha inicial do painel confere com o hash embutido", async () => {
  assert.equal(await verifyHash("89221570", DEFAULT_PASSWORD_HASH), true);
  assert.equal(await verifyHash("89221571", DEFAULT_PASSWORD_HASH), false);
  const h = await hashPassword("outra-senha-123");
  assert.equal(await verifyHash("outra-senha-123", h), true);
  assert.ok(!DEFAULT_PASSWORD_HASH.includes("89221570"));
});
