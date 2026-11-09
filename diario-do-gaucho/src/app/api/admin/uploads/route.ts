import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { prepareUploads } from "@/lib/services/photos";

/** Etapa 1 do upload em lote: devolve URLs de envio direto ao armazenamento privado. */
export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    const body = (await req.json()) as { files?: { name: string; size: number; type: string }[] };
    return json({ uploads: await prepareUploads(body.files ?? []) });
  } catch (e) {
    return errorResponse(e);
  }
}
