/** 16 random bytes (Web Crypto), base64: 24 characters. A fresh value per request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The page Content-Security-Policy. Next 16 inlines flight-data scripts, so script-src needs the
 * per-request nonce; 'strict-dynamic' lets those trusted scripts load the app's chunks.
 * 'unsafe-eval' only in development (React refresh). Never upgrade-insecure-requests: it would
 * break the http://127.0.0.1 E2E origin.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  options: { readonly dev: boolean },
): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (options.dev) scriptSrc.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
