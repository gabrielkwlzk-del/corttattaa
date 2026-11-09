import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/http";
import { readPreview } from "@/lib/services/photos";

/**
 * Serve SOMENTE prévias e miniaturas com marca d'água gravada.
 * Não existe rota pública para o arquivo original.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await ctx.params;
  const v = variant === "thumb" ? "thumb" : variant === "preview" ? "preview" : null;
  if (!v) return new NextResponse("Not found", { status: 404 });
  let buf = await readPreview(id, v, false).catch(() => null);
  let cache = "public, max-age=31536000, immutable";
  if (!buf && (await isAdmin())) {
    buf = await readPreview(id, v, true).catch(() => null);
    cache = "private, no-store";
  }
  if (!buf) return new NextResponse("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(buf.length),
      "cache-control": cache,
      "content-disposition": "inline",
    },
  });
}
