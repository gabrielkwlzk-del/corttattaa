import { cookies } from "next/headers";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";
import { logout, sessionCookieName } from "@/lib/services/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const jar = await cookies();
    await logout(jar.get(sessionCookieName())?.value);
    jar.delete(sessionCookieName());
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
