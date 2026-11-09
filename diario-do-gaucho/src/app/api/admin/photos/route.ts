import { UserError } from "@/lib/errors";
import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { parseBRLToCents } from "@/lib/money";
import { listAdminPhotos, updatePhotos, type PhotoPatch } from "@/lib/services/catalog";
import { deletePhotos } from "@/lib/services/photos";

export async function GET(req: Request) {
  try {
    await requireAdminApi(req);
    const u = new URL(req.url);
    const status = u.searchParams.get("status");
    return json(
      await listAdminPhotos({
        q: u.searchParams.get("q") ?? undefined,
        eventId: u.searchParams.get("event") ?? undefined,
        status: status === "processing" || status === "failed" || status === "ready" ? status : undefined,
        page: Number(u.searchParams.get("page") ?? 1) || 1,
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminApi(req);
    const body = (await req.json()) as { ids: string[]; patch: PhotoPatch & { price?: string } };
    const patch: PhotoPatch = { ...body.patch };
    if (body.patch?.price !== undefined) {
      const cents = parseBRLToCents(String(body.patch.price));
      if (cents === null) throw new UserError("Preço inválido.");
      patch.price_cents = cents;
    }
    delete (patch as { price?: string }).price;
    return json({ updated: await updatePhotos(body.ids ?? [], patch) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdminApi(req);
    const body = (await req.json()) as { ids: string[] };
    return json(await deletePhotos(body.ids ?? []));
  } catch (e) {
    return errorResponse(e);
  }
}
