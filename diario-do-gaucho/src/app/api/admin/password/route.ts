import { cookies } from "next/headers";
import { errorResponse, json, requireAdminApi } from "@/lib/http";
import { changePassword, sessionCookieName } from "@/lib/services/auth";

export async function POST(req: Request) {
  try {
    await requireAdminApi(req);
    const { current, next } = (await req.json()) as { current: string; next: string };
    await changePassword(String(current ?? ""), String(next ?? ""));
    (await cookies()).delete(sessionCookieName());
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
