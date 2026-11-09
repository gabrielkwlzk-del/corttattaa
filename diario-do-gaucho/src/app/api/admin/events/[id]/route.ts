import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { deleteEvent, updateEvent, type EventInput } from "@/lib/services/catalog";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdminApi(req);
    await updateEvent((await ctx.params).id, (await req.json()) as EventInput);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAdminApi(req);
    await deleteEvent((await ctx.params).id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
