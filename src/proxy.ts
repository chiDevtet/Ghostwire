import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "./csp";

/**
 * Next 16 proxy (formerly middleware): a per-request nonce CSP on page routes. Next reads the
 * nonce from the request's Content-Security-Policy header and applies it to its own scripts.
 */
export function proxy(request: NextRequest): NextResponse {
  const csp = buildContentSecurityPolicy(createNonce(), {
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
