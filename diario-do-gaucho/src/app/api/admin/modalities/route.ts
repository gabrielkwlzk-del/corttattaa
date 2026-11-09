import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { createModality, listModalities } from "@/lib/services/catalog";

export async function GET(req: Request) {
  try {
    await requireAdminApi(req);
    return json({ modalities: await listModalities() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    const { name } = (await req.json()) as { name: string };
    return json({ id: await createModality(name) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
