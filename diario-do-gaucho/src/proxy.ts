import { NextResponse, type NextRequest } from "next/server";

/**
 * Barreira rápida para as páginas do painel: sem cookie de sessão -> login.
 * A validação real da sessão (hash no banco, expiração) acontece no servidor,
 * em cada página e rota de API administrativa.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  const hasSession = req.cookies.has("__Host-dg_admin") || req.cookies.has("dg_admin");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("x-robots-tag", "noindex, nofollow");
  res.headers.set("cache-control", "no-store");
  return res;
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
