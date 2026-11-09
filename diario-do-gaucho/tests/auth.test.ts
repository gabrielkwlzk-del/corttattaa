import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { q, resetDbForTests } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { changePassword, login, logout, MAX_FAILURES_PER_IP, validateSession } from "@/lib/services/auth";

beforeAll(async () => {
  await resetDbForTests();
});
afterAll(async () => {
  await resetDbForTests();
});

describe("autenticação administrativa", () => {
  it("hash scrypt verifica corretamente e nunca guarda a senha em texto", async () => {
    const h = await hashPassword("abc12345678");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(h).not.toContain("abc12345678");
    expect(await verifyPassword("abc12345678", h)).toBe(true);
    expect(await verifyPassword("errada", h)).toBe(false);
  });

  it("login cria sessão; logout encerra", async () => {
    const r = await login("senha-forte-de-teste", "10.0.0.1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [stored] = await q<{ value: string }>("select value from settings where key='admin_password_hash'");
    expect(stored.value).not.toContain("senha-forte-de-teste");
    expect(await validateSession(r.token)).toBe(true);
    // O token bruto não é armazenado — só seu hash.
    expect(await q("select 1 from admin_sessions where token_hash=$1", [r.token])).toHaveLength(0);
    await logout(r.token);
    expect(await validateSession(r.token)).toBe(false);
  });

  it("bloqueia após tentativas repetidas", async () => {
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
      expect(await login("errada", "10.0.0.2")).toEqual({ ok: false, reason: "invalid" });
    }
    const locked = await login("senha-forte-de-teste", "10.0.0.2");
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toBe("locked");
    // Outro IP continua podendo entrar.
    expect((await login("senha-forte-de-teste", "10.0.0.3")).ok).toBe(true);
  });

  it("troca de senha exige a senha atual e encerra sessões", async () => {
    const r = await login("senha-forte-de-teste", "10.0.0.4");
    await expect(changePassword("errada", "nova-senha-123456")).rejects.toThrow();
    await changePassword("senha-forte-de-teste", "nova-senha-123456");
    if (r.ok) expect(await validateSession(r.token)).toBe(false);
    expect((await login("nova-senha-123456", "10.0.0.5")).ok).toBe(true);
  });
});
