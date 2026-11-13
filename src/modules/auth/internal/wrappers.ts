import { loadConfig } from "@/modules/config";
import { checkOrigin } from "@/modules/security";
import { UnauthenticatedError, toErrorResponse } from "@/modules/shared";
import {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  hasSessionCookie,
  readSessionToken,
  remainingMaxAgeSeconds,
} from "./cookies";
import { requestMeta } from "./request";
import { resolveSession } from "./sessions";
import type { AuthContext, RouteHandler, SessionHandler } from "./types";

/**
 * Origin check (config read per call, never at import), then the handler. Every thrown value
 * becomes a toErrorResponse, so no route can throw to Next. Outermost on every non-GET route.
 */
export function withOrigin<P extends object>(handler: RouteHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    try {
      checkOrigin(request, loadConfig().APP_ORIGIN);
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Resolves the session cookie (401 UNAUTHENTICATED otherwise) and passes an AuthContext. A 401
 * for a request that carried a session cookie (either name, any non-empty value) also clears the
 * configured cookie; a request without one gets no Set-Cookie. A resolveSession outage goes to
 * the catch (503, no clear: an outage must not sign people out). When the session slid,
 * re-sends the cookie with the new Max-Age unless the handler set it itself.
 */
export function withSession<P extends object>(handler: SessionHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    try {
      const { APP_ORIGIN } = loadConfig();
      const meta = requestMeta(request);
      const token = readSessionToken(request, APP_ORIGIN);
      const resolution = await resolveSession(token, meta.at);
      if (token === null || resolution === null) {
        const response = toErrorResponse(new UnauthenticatedError());
        if (carriesSessionCookie(request)) {
          response.headers.append("Set-Cookie", clearSessionCookie(APP_ORIGIN));
        }
        return response;
      }
      const auth: AuthContext = { ...meta, session: resolution.session };
      const response = await handler(request, auth, context);
      if (resolution.slid && !hasSessionCookie(response, APP_ORIGIN)) {
        const maxAge = remainingMaxAgeSeconds(resolution.session.expiresAt, meta.at);
        response.headers.append("Set-Cookie", buildSessionCookie(token, maxAge, APP_ORIGIN));
      }
      return response;
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
