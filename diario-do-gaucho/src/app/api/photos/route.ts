import { listPublicPhotos } from "@/lib/services/catalog";
import { errorResponse, json } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const result = await listPublicPhotos({
      q: u.searchParams.get("q") ?? undefined,
      event: u.searchParams.get("evento") ?? undefined,
      modality: u.searchParams.get("modalidade") ?? undefined,
      date: u.searchParams.get("data") ?? undefined,
      page: Number(u.searchParams.get("pagina") ?? 1) || 1,
    });
    return json(result, 200, { "cache-control": "public, max-age=15, stale-while-revalidate=60" });
  } catch (e) {
    return errorResponse(e);
  }
}
