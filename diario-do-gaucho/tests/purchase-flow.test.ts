import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { q, resetDbForTests } from "@/lib/db";
import { parseEmv } from "@/lib/pix/brcode";
import { listPublicPhotos, updatePhotos } from "@/lib/services/catalog";
import {
  confirmManually,
  createDownloadLink,
  createOrder,
  getOrderByToken,
  OrderError,
  reportPaidByCustomer,
} from "@/lib/services/orders";
import { readPreview } from "@/lib/services/photos";
import { handleMercadoPagoWebhook } from "@/lib/services/webhooks";
import { storage, verifyLocalSignature } from "@/lib/storage";
import { uploadPhoto } from "./helpers/fixtures";

const EMAIL = "atleta@example.com";

beforeAll(async () => {
  await resetDbForTests();
});
afterAll(async () => {
  await resetDbForTests();
});

async function expectOrderError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof OrderError && e.code === code);
}

describe("upload e catálogo", () => {
  it("processa upload, gera prévia protegida e mantém o original intacto e privado", async () => {
    const { id, status, key, original } = await uploadPhoto({ title: "Chegada da maratona" });
    expect(status).toBe("ready");
    const [row] = await q<{ price_cents: number; status: string }>("select price_cents, status from photos where id=$1", [id]);
    expect(row.price_cents).toBe(900); // preço padrão R$ 9,00
    const stored = await storage().get("originals", key);
    expect(stored.equals(original)).toBe(true);

    const preview = await readPreview(id, "preview", false);
    expect(preview).not.toBeNull();
    expect(preview!.equals(original)).toBe(false);

    const { photos } = await listPublicPhotos({ q: "maratona" });
    expect(photos.map((p) => p.id)).toContain(id);
    // A listagem pública não expõe caminhos de arquivos.
    expect(JSON.stringify(photos)).not.toContain(key);
  });

  it("fotos ocultas não aparecem nem servem prévia ao público", async () => {
    const { id } = await uploadPhoto({ title: "Oculta" });
    await updatePhotos([id], { visibility: "hidden" });
    expect((await listPublicPhotos({ q: "Oculta" })).photos).toHaveLength(0);
    expect(await readPreview(id, "preview", false)).toBeNull();
    expect(await readPreview(id, "preview", true)).not.toBeNull();
  });
});

describe("compra com Pix estático (confirmação manual segura)", () => {
  it("fluxo completo: pedido -> pendente -> 'já paguei' não libera -> confirmação -> download assinado", async () => {
    const { id } = await uploadPhoto({ title: "Largada", priceCents: 1250 });

    // O navegador não define o preço: só envia IDs.
    const { token, code } = await createOrder({
      photoIds: [id],
      customerEmail: EMAIL,
      // @ts-expect-error — campo malicioso ignorado pelo servidor
      amountCents: 1,
    });
    let data = await getOrderByToken(token);
    expect(data!.order.status).toBe("pending");
    expect(data!.order.amount_cents).toBe(1250);
    expect(data!.items[0].price_cents).toBe(1250);
    expect(data!.order.payment_provider).toBe("static");

    const pix = parseEmv(data!.order.pix_copia_cola!);
    expect(pix["54"]).toBe("12.50");
    expect(parseEmv(pix["26"])["01"]).toBe("+5547992145561");
    expect(parseEmv(pix["62"])["05"]).toBe(code);

    // Alterar o preço depois não muda o pedido já criado.
    await updatePhotos([id], { price_cents: 5000 });
    data = await getOrderByToken(token);
    expect(data!.order.amount_cents).toBe(1250);

    // "Já paguei" apenas sinaliza — nada é liberado.
    await reportPaidByCustomer(token);
    data = await getOrderByToken(token);
    expect(data!.order.status).toBe("pending");
    expect(data!.order.customer_reported_paid_at).not.toBeNull();
    await expectOrderError(createDownloadLink(token, data!.items[0].id), "not_paid");

    // Confirmação manual exige referência da transação do extrato.
    await expectOrderError(confirmManually(data!.order.id, ""), "missing_reference");
    expect(await confirmManually(data!.order.id, "E12345678202611091200abcdef")).toBe("paid");
    expect(await confirmManually(data!.order.id, "E12345678202611091200abcdef")).toBe("already_paid");

    data = await getOrderByToken(token);
    expect(data!.order.status).toBe("paid");
    const tx = await q("select * from transactions where order_id=$1", [data!.order.id]);
    expect(tx).toHaveLength(1);

    // Download: URL assinada e temporária do ORIGINAL.
    const url = await createDownloadLink(token, data!.items[0].id);
    const u = new URL(url, "http://localhost");
    expect(u.pathname).toBe("/api/files/original");
    const parts = {
      op: "download",
      key: u.searchParams.get("key")!,
      exp: u.searchParams.get("exp")!,
      name: u.searchParams.get("name")!,
    };
    expect(verifyLocalSignature(parts, u.searchParams.get("sig")!)).toBe(true);
    expect(verifyLocalSignature({ ...parts, key: "outra/chave" }, u.searchParams.get("sig")!)).toBe(false);
    expect(Number(parts.exp)).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 300);
  });

  it("rejeita token inválido e fotos indisponíveis", async () => {
    expect(await getOrderByToken("x".repeat(43))).toBeNull();
    await expectOrderError(
      createOrder({ photoIds: [crypto.randomUUID()], customerEmail: EMAIL }),
      "unavailable",
    );
    await expectOrderError(createOrder({ photoIds: [], customerEmail: EMAIL }), "no_items");
  });

  it("não cria cobrança sem dados obrigatórios do recebedor", async () => {
    const { id } = await uploadPhoto();
    const prev = process.env.PIX_MERCHANT_CITY;
    delete process.env.PIX_MERCHANT_CITY;
    try {
      await expectOrderError(createOrder({ photoIds: [id], customerEmail: EMAIL }), "pix_unavailable");
    } finally {
      process.env.PIX_MERCHANT_CITY = prev;
    }
  });
});

describe("compra com provedor Pix (Mercado Pago + webhook)", () => {
  const SECRET = "whsec_test_123";
  let payments: Record<string, { status: string; transaction_amount: number; external_reference: string }> = {};
  let nextId = 900001;

  beforeAll(() => {
    process.env.PIX_PROVIDER = "mercadopago";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (init?.method === "POST" && url.pathname === "/v1/payments") {
        const body = JSON.parse(String(init.body));
        const id = String(nextId++);
        payments[id] = { status: "pending", transaction_amount: body.transaction_amount, external_reference: body.external_reference };
        return Response.json({
          id: Number(id),
          status: "pending",
          transaction_amount: body.transaction_amount,
          point_of_interaction: { transaction_data: { qr_code: "00020101021226...MP-COPIA-E-COLA" } },
        });
      }
      const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
      if (m && payments[m[1]]) return Response.json({ id: Number(m[1]), currency_id: "BRL", ...payments[m[1]] });
      return new Response("not found", { status: 404 });
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    process.env.PIX_PROVIDER = "static";
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  });
  afterEach(() => {});

  function signedWebhook(dataId: string, requestId: string, secret = SECRET) {
    const ts = String(Date.now());
    const v1 = crypto.createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
    return {
      url: `http://localhost:3000/api/webhooks/mercadopago?data.id=${dataId}&type=payment`,
      headers: new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }),
      body: { type: "payment", action: "payment.updated", data: { id: dataId } },
    };
  }

  it("só marca como pago após webhook assinado + consulta ao provedor com status approved", async () => {
    const { id } = await uploadPhoto({ title: "Sprint final" });
    const { token } = await createOrder({ photoIds: [id], customerEmail: EMAIL });
    let data = await getOrderByToken(token);
    expect(data!.order.payment_provider).toBe("mercadopago");
    const paymentId = data!.order.provider_payment_id!;
    expect(data!.order.pix_copia_cola).toContain("MP-COPIA-E-COLA");

    // Assinatura inválida -> 401, nada muda.
    payments[paymentId].status = "approved";
    const forged = signedWebhook(paymentId, "req-1", "segredo-errado");
    expect((await handleMercadoPagoWebhook(forged)).status).toBe(401);
    expect((await getOrderByToken(token))!.order.status).toBe("pending");

    // Notificação sem assinatura -> 401.
    const unsigned = signedWebhook(paymentId, "req-x");
    unsigned.headers.delete("x-signature");
    expect((await handleMercadoPagoWebhook(unsigned)).status).toBe(401);

    // Pagamento ainda pendente no provedor -> registrado, não pago.
    payments[paymentId].status = "pending";
    const r0 = await handleMercadoPagoWebhook(signedWebhook(paymentId, "req-2"));
    expect(r0.body.result).toBe("recorded");
    expect((await getOrderByToken(token))!.order.status).toBe("pending");

    // Aprovado -> pago.
    payments[paymentId].status = "approved";
    const r1 = await handleMercadoPagoWebhook(signedWebhook(paymentId, "req-3"));
    expect(r1).toEqual({ status: 200, body: { ok: true, result: "paid" } });

    // Reenvio da mesma notificação -> deduplicado.
    const r2 = await handleMercadoPagoWebhook(signedWebhook(paymentId, "req-3"));
    expect(r2.body.result).toBe("duplicate");
    // Nova notificação do mesmo pagamento -> idempotente.
    const r3 = await handleMercadoPagoWebhook(signedWebhook(paymentId, "req-4"));
    expect(r3.body.result).toBe("already_paid");

    data = await getOrderByToken(token);
    expect(data!.order.status).toBe("paid");
    const tx = await q<{ status: string }>("select status from transactions where order_id=$1 order by created_at", [data!.order.id]);
    expect(tx.map((t) => t.status)).toEqual(["pending", "approved"]);
    await expect(createDownloadLink(token, data!.items[0].id)).resolves.toContain("/api/files/original");
  });

  it("não libera quando o valor pago diverge do pedido", async () => {
    const { id } = await uploadPhoto();
    const { token } = await createOrder({ photoIds: [id], customerEmail: EMAIL });
    const data = await getOrderByToken(token);
    const pid = data!.order.provider_payment_id!;
    payments[pid].status = "approved";
    payments[pid].transaction_amount = 0.5;
    const r = await handleMercadoPagoWebhook(signedWebhook(pid, "req-mismatch"));
    expect(r.body.result).toBe("amount_mismatch");
    expect((await getOrderByToken(token))!.order.status).toBe("pending");
  });

  it("pedidos de provedor automático não podem ser confirmados manualmente", async () => {
    const { id } = await uploadPhoto();
    const { token } = await createOrder({ photoIds: [id], customerEmail: EMAIL });
    const data = await getOrderByToken(token);
    await expectOrderError(confirmManually(data!.order.id, "E1234567890"), "not_manual");
  });
});
