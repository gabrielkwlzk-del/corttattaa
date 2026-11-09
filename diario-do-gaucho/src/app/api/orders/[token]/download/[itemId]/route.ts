import { NextResponse } from "next/server";
import { clientIp, errorResponse, rateLimit } from "@/lib/http";
import { createDownloadLink } from "@/lib/services/orders";

/** Gera URL assinada e temporária do ORIGINAL — somente para pedidos pagos. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; itemId: string }> }) {
  try {
    const ip = clientIp(req.headers);
    rateLimit(`download:${ip}`, 60, 10 * 60_000);
    const { token, itemId } = await ctx.params;
    const url = await createDownloadLink(token, itemId, ip);
    const res = NextResponse.redirect(new URL(url, req.url), 303);
    res.headers.set("cache-control", "no-store");
    res.headers.set("referrer-policy", "no-referrer");
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
