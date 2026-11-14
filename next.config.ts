import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** API responses never render HTML. Pages get their CSP (with a nonce) from src/proxy.ts only. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
};

export default nextConfig;
