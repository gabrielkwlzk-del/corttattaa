import { assertSameOrigin, clientIp, errorResponse, json, rateLimit } from "@/lib/http";
import { reportPaidByCustomer } from "@/lib/services/orders";

/** "Já paguei": apenas sinaliza ao administrador. Nunca libera arquivos. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(req);
    rateLimit(`reported:${clientIp(req.headers)}`, 20, 10 * 60_000);
    const { token } = await ctx.params;
    await reportPaidByCustomer(token);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
