import { ValidationError } from "@/modules/shared";

export const MAX_JSON_BODY_BYTES = 4096;
const DIGITS = /^[0-9]+$/;

function invalidBody(detail: string): ValidationError {
  return new ValidationError({ message: `invalid request body: ${detail}` });
}

/**
 * Rejects a Content-Length above maxBytes before reading. Otherwise reads the body stream,
 * cancelling it as soon as more than maxBytes bytes arrive, then decodes UTF-8 (fatal) and parses
 * JSON. Empty body, overflow, invalid UTF-8 or invalid JSON -> ValidationError (VALIDATION_FAILED).
 * Error messages never contain body content.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!DIGITS.test(declared) || Number(declared) > maxBytes)) {
    throw invalidBody("too large");
  }
  if (request.body === null) throw invalidBody("empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw invalidBody("too large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw invalidBody("unreadable");
  }
  if (total === 0) throw invalidBody("empty");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw invalidBody("not UTF-8");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidBody("not JSON");
  }
}
