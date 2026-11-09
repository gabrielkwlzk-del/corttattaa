import { q } from "@/lib/db";
import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { isUuid } from "@/lib/services/catalog";
import { processPending } from "@/lib/services/photos";

/** Consulta o status de processamento de várias fotos (usado pela fila de upload). */
export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    const { ids } = (await req.json()) as { ids: string[] };
    const valid = (ids ?? []).filter(isUuid).slice(0, 500);
    // Recupera itens que ficaram presos (ex.: reinício do servidor durante o processamento).
    await processPending(3, 90);
    const rows = await q<{ id: string; status: string; processing_error: string | null; version: number }>(
      "select id, status, processing_error, version from photos where id = any($1::uuid[])",
      [valid],
    );
    return json({ photos: rows });
  } catch (e) {
    return errorResponse(e);
  }
}
