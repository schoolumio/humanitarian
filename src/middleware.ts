import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content Security Policy with a nonce. Next.js applies the nonce to its own
 * scripts automatically when it finds it in the request's CSP header.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const storageOrigin = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL ? new URL(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL).origin : "";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${storageOrigin}`.trim(),
    `media-src 'self' ${storageOrigin}`.trim(),
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://checkout.paystack.com`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(!dev && process.env.APP_BASE_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
