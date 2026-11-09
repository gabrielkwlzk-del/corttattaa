import { clientIp, errorResponse, json, rateLimit, assertSameOrigin } from "@/lib/http";
import { createOrder } from "@/lib/services/orders";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = clientIp(req.headers);
    rateLimit(`order:${ip}`, 15, 10 * 60_000);
    const body = (await req.json().catch(() => ({}))) as {
      photoIds?: unknown;
      photoId?: unknown;
      email?: unknown;
      name?: unknown;
    };
    // Atenção: qualquer preço enviado pelo navegador é ignorado.
    const photoIds = Array.isArray(body.photoIds) ? body.photoIds.map(String) : body.photoId ? [String(body.photoId)] : [];
    const { token, code } = await createOrder({
      photoIds,
      customerEmail: String(body.email ?? ""),
      customerName: body.name ? String(body.name) : undefined,
    });
    return json({ token, code, url: `/pedido/${token}` }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
