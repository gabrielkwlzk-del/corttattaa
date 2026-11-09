import { env } from "@/lib/env";
import { errorResponse, HttpError, json, requireAdminApi } from "@/lib/http";
import { storage, verifyLocalSignature } from "@/lib/storage";

/** Recebe o arquivo original quando o armazenamento local está em uso. */
export async function PUT(req: Request) {
  try {
    if (env.storageDriver !== "local") throw new HttpError(404, "Indisponível.");
    await requireAdminApi(req);
    const u = new URL(req.url);
    const key = u.searchParams.get("key") ?? "";
    const exp = u.searchParams.get("exp") ?? "";
    const sig = u.searchParams.get("sig") ?? "";
    if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) throw new HttpError(410, "Upload expirado.");
    if (!verifyLocalSignature({ op: "upload", key, exp }, sig)) throw new HttpError(403, "Assinatura inválida.");
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > env.maxUploadBytes) throw new HttpError(413, "Arquivo excede o limite.");
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0 || buf.length > env.maxUploadBytes) throw new HttpError(413, "Tamanho inválido.");
    await storage().put("originals", key, buf, req.headers.get("content-type") ?? "application/octet-stream");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
