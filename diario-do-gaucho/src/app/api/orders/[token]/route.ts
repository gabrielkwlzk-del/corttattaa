import { errorResponse, json } from "@/lib/http";
import { getOrderByToken, refreshOrderFromProvider } from "@/lib/services/orders";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    let data = await getOrderByToken(token);
    if (!data) return json({ error: "Pedido não encontrado." }, 404);
    if (data.order.status === "pending" && data.order.payment_provider === "mercadopago") {
      await refreshOrderFromProvider(data.order);
      data = (await getOrderByToken(token))!;
    }
    const { order } = data;
    return json({
      status: order.status,
      code: order.code,
      paidAt: order.paid_at,
      reported: Boolean(order.customer_reported_paid_at),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
