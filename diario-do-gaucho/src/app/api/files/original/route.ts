import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { storage, verifyLocalSignature } from "@/lib/storage";

/**
 * Entrega do original para o driver de armazenamento local.
 * Exige assinatura HMAC válida e não expirada (gerada só após pagamento confirmado).
 * Com Supabase, o download usa a URL assinada do próprio Supabase Storage.
 */
export async function GET(req: Request) {
  if (env.storageDriver !== "local") return new NextResponse("Not found", { status: 404 });
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const exp = u.searchParams.get("exp") ?? "";
  const name = u.searchParams.get("name") ?? "foto.jpg";
  const sig = u.searchParams.get("sig") ?? "";
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) {
    return new NextResponse("Link expirado. Volte à página do pedido para gerar um novo.", { status: 410 });
  }
  if (!verifyLocalSignature({ op: "download", key, exp, name }, sig)) {
    return new NextResponse("Assinatura inválida.", { status: 403 });
  }
  try {
    const buf = await storage().get("originals", key);
    const safeName = name.replace(/[^\w.-]/g, "_");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(buf.length),
        "content-disposition": `attachment; filename="${safeName}"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }
}
