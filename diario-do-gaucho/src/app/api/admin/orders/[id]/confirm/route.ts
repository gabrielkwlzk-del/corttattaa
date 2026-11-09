import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { confirmManually } from "@/lib/services/orders";

/**
 * Confirmação manual — apenas para Pix estático, depois que o administrador
 * conferiu o crédito no extrato bancário. Exige o identificador E2E da transação.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi(req);
    const { reference } = (await req.json()) as { reference: string };
    const result = await confirmManually((await ctx.params).id, reference);
    return json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
