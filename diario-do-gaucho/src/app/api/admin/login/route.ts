import { cookies } from "next/headers";
import { assertSameOrigin, clientIp, errorResponse, json } from "@/lib/http";
import { env } from "@/lib/env";
import { login, sessionCookieName } from "@/lib/services/auth";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    const r = await login(String(body.password ?? ""), clientIp(req.headers), req.headers.get("user-agent") ?? undefined);
    if (!r.ok) {
      if (r.reason === "locked") {
        return json(
          { error: `Muitas tentativas. Tente novamente em ${Math.ceil((r.retryAfterSeconds ?? 900) / 60)} min.` },
          429,
          { "retry-after": String(r.retryAfterSeconds ?? 900) },
        );
      }
      if (r.reason === "not_configured") {
        return json({ error: "Senha administrativa não configurada no servidor (ADMIN_PASSWORD)." }, 503);
      }
      // Pequeno atraso uniforme contra força bruta.
      await new Promise((res) => setTimeout(res, 400));
      return json({ error: "Senha incorreta." }, 401);
    }
    (await cookies()).set(sessionCookieName(), r.token, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: "strict",
      path: "/",
      expires: r.expiresAt,
    });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
