import { describe, expect, it } from "vitest";
import { MAX_JSON_BODY_BYTES, readJsonBody } from "@/modules/security";
import { ValidationError } from "@/modules/shared";

const URL_ = "https://ghostwire.test/api/v1/x";

function post(body: BodyInit | null, headers?: Record<string, string>): Request {
  return new Request(URL_, { method: "POST", body, headers });
}

/** A JSON string literal of exactly `bytes` bytes. */
function jsonOfBytes(bytes: number): string {
  return `"${"a".repeat(bytes - 2)}"`;
}

async function validationErrorOf(promise: Promise<unknown>): Promise<ValidationError> {
  const error: unknown = await promise.catch((e: unknown) => e);
  if (!(error instanceof ValidationError)) throw new Error("expected a ValidationError");
  return error;
}

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    expect(await readJsonBody(post('{"a":1,"b":[true]}'))).toEqual({ a: 1, b: [true] });
  });

  it("accepts exactly 4096 bytes", async () => {
    expect(MAX_JSON_BODY_BYTES).toBe(4096);
    const body = jsonOfBytes(4096);
    expect(await readJsonBody(post(body))).toBe(body.slice(1, -1));
  });

  it("rejects 4097 bytes without a Content-Length", async () => {
    const error = await validationErrorOf(readJsonBody(post(jsonOfBytes(4097))));
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a declared Content-Length above the limit without reading the body", async () => {
    const request = post("{}", { "content-length": "1000000000" });
    await validationErrorOf(readJsonBody(request));
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects a non-numeric Content-Length", async () => {
    await validationErrorOf(readJsonBody(post("{}", { "content-length": "abc" })));
  });

  it("cancels a chunked stream as soon as it passes the limit", async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1000).fill(0x20));
        if (pulls > 50) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(URL_, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await validationErrorOf(readJsonBody(request));
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("turns a stream that errors mid-read into VALIDATION_FAILED", async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.error(new Error("boom SENTINEL"));
          return;
        }
        sent = true;
        controller.enqueue(new TextEncoder().encode('{"a":'));
      },
    });
    const request = new Request(URL_, {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    const error = await validationErrorOf(readJsonBody(request));
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).not.toContain("SENTINEL");
  });

  it.each([
    { label: "a missing body", request: () => post(null) },
    { label: "an empty body", request: () => post("") },
    { label: "invalid JSON", request: () => post("{not json") },
    { label: "invalid UTF-8", request: () => post(new Uint8Array([0x22, 0xff, 0xfe, 0x22])) },
  ])("rejects $label with VALIDATION_FAILED", async ({ request }) => {
    const error = await validationErrorOf(readJsonBody(request()));
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  it("never puts body content in the error message", async () => {
    const error = await validationErrorOf(readJsonBody(post("{SENTINEL")));
    expect(error.message).not.toContain("SENTINEL");
  });
});
