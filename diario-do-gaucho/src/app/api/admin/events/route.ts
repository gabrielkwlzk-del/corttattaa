import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { createEvent, listEvents, type EventInput } from "@/lib/services/catalog";

export async function GET(req: Request) {
  try {
    await requireAdminApi(req);
    return json({ events: await listEvents() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    return json({ id: await createEvent((await req.json()) as EventInput) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
