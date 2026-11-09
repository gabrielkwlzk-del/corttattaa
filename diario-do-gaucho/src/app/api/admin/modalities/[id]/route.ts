import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { deleteModality, updateModality } from "@/lib/services/catalog";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdminApi(req);
    const { name } = (await req.json()) as { name: string };
    await updateModality((await ctx.params).id, name);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAdminApi(req);
    await deleteModality((await ctx.params).id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
