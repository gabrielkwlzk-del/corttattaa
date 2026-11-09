import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { reprocessPhoto } from "@/lib/services/photos";

export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    const { id } = (await req.json()) as { id: string };
    return json({ status: await reprocessPhoto(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
