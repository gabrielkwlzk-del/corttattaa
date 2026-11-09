import { after } from "next/server";
import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { parseBRLToCents } from "@/lib/money";
import { finalizeUpload, processPhoto, type FinalizeInput } from "@/lib/services/photos";

/** Etapa 2: registra a foto e agenda o processamento (prévia + marca d'água) em segundo plano. */
export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    const body = (await req.json()) as FinalizeInput & { price?: string };
    const priceCents = body.price ? parseBRLToCents(body.price) : null;
    const id = await finalizeUpload({ ...body, priceCents: priceCents ?? null });
    after(async () => {
      await processPhoto(id);
    });
    return json({ id, status: "processing" }, 202);
  } catch (e) {
    return errorResponse(e);
  }
}
