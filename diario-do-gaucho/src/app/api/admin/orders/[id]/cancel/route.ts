import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { cancelOrder } from "@/lib/services/orders";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi(req);
    await cancelOrder((await ctx.params).id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
