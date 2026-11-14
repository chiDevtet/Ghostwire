/** http on 127.0.0.1, so the session cookie is gw_session (no __Host- prefix, no Secure). */
export const E2E_PORT = process.env.GW_E2E_PORT ?? "3210";
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
