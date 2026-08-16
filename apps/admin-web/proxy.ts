import { NextResponse, type NextRequest } from "next/server";

const apiOrigin = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
const sessionCookieName =
  process.env.NODE_ENV === "production" ? "__Host-wifi_session" : "wifi_session";

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return NextResponse.next();

  const session = request.cookies.get(sessionCookieName);
  let authenticated = false;
  if (session) {
    try {
      const response = await fetch(`${apiOrigin}/api/v1/auth/admin/session`, {
        cache: "no-store",
        headers: {
          cookie: request.headers.get("cookie") ?? "",
          "x-correlation-id": request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
        },
        signal: AbortSignal.timeout(2_000),
      });
      authenticated = response.ok;
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated) {
    const login = new URL("/", request.url);
    login.searchParams.set("returnTo", request.nextUrl.pathname);
    const response = NextResponse.redirect(login);
    if (session) response.cookies.delete(sessionCookieName);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/administracion/:path*",
    "/organizaciones/:path*",
    "/sedes/:path*",
    "/red/:path*",
    "/portales/:path*",
    "/servicios/:path*",
    "/usuarios/:path*",
    "/sesiones/:path*",
    "/vouchers/:path*",
    "/dispositivos/:path*",
    "/estadisticas/:path*",
    "/legal/:path*",
    "/auditoria/:path*",
    "/ajustes/:path*",
  ],
};
