import type { RouteHandler } from "@/modules/auth";

export const TEST_APP_ORIGIN = "https://ghostwire.test";

export interface CallOptions {
  readonly method: "GET" | "POST" | "DELETE";
  /** e.g. "/api/v1/auth/challenge" */
  readonly path: string;
  /** JSON.stringify'd, with Content-Type: application/json. */
  readonly body?: unknown;
  /** Sent as-is, for size and garbage tests. Wins over body. */
  readonly rawBody?: string;
  /** Becomes { params: Promise.resolve(params) }. */
  readonly params?: Readonly<Record<string, string>>;
  /** Default: the client's appOrigin for non-GET, none for GET. null omits the header. */
  readonly origin?: string | null;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface CallResult {
  readonly status: number;
  readonly headers: Headers;
  readonly setCookies: string[];
  /** null for an empty body (204). */
  readonly json: unknown;
}

const SESSION_SET_COOKIE = /^(__Host-gw_session|gw_session)=([^;]*)/;

/**
 * Calls route handlers directly with real Request objects and keeps a one-cookie jar for the
 * session cookie: every call sends it, and every Set-Cookie for it updates it
 * (Max-Age=0 or an empty value clears it).
 */
export class TestClient {
  private readonly appOrigin: string;
  private token: string | null = null;

  constructor(options: { appOrigin?: string } = {}) {
    this.appOrigin = options.appOrigin ?? TEST_APP_ORIGIN;
  }

  /** The raw session token currently in the jar. */
  get cookie(): string | null {
    return this.token;
  }

  /** Puts a raw value in the jar, for forged, expired or foreign-token tests. */
  setCookie(value: string | null): void {
    this.token = value;
  }

  private cookieName(): string {
    return this.appOrigin.startsWith("https://") ? "__Host-gw_session" : "gw_session";
  }

  async call<P extends object>(
    handler: RouteHandler<P>,
    options: CallOptions,
  ): Promise<CallResult> {
    const headers = new Headers(options.headers);
    const origin =
      options.origin === undefined
        ? options.method === "GET"
          ? null
          : this.appOrigin
        : options.origin;
    if (origin !== null) headers.set("origin", origin);
    if (this.token !== null) headers.set("cookie", `${this.cookieName()}=${this.token}`);
    let body: string | undefined;
    if (options.rawBody !== undefined) {
      body = options.rawBody;
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers.set("content-type", "application/json");
    }
    const request = new Request(new URL(options.path, this.appOrigin), {
      method: options.method,
      headers,
      body,
    });
    const params = Promise.resolve((options.params ?? {}) as P);
    const response = await handler(request, { params });
    const setCookies = response.headers.getSetCookie();
    for (const value of setCookies) {
      const match = SESSION_SET_COOKIE.exec(value);
      if (match === null) continue;
      const cookieValue = match[2] ?? "";
      this.token = cookieValue === "" || /;\s*Max-Age=0(;|$)/i.test(value) ? null : cookieValue;
    }
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      setCookies,
      json: text === "" ? null : (JSON.parse(text) as unknown),
    };
  }
}
