import { ForbiddenOriginError } from "@/modules/shared";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Safe methods pass. Every other method needs an Origin header exactly equal to appOrigin.
 * @throws ForbiddenOriginError (403 ORIGIN_REJECTED); the rejected Origin is never logged
 */
export function checkOrigin(request: Request, appOrigin: string): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  if (request.headers.get("origin") !== appOrigin) throw new ForbiddenOriginError();
}
