import { describe, expect, test } from "bun:test";
import { assertRequestBodyWithinLimit, MAX_REQUEST_BODY_BYTES } from "./body-limit";
import { HttpError } from "./errors";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/v1/trips", { method: "POST", headers });
}

function statusFor(headers: Record<string, string>): number | "allowed" {
  try {
    assertRequestBodyWithinLimit(requestWith(headers));
    return "allowed";
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
}

describe("assertRequestBodyWithinLimit", () => {
  test("allows requests without a declared body", () => {
    expect(statusFor({})).toBe("allowed");
  });

  test("allows bodies up to and including the limit", () => {
    expect(statusFor({ "content-length": "0" })).toBe("allowed");
    expect(statusFor({ "content-length": String(MAX_REQUEST_BODY_BYTES) })).toBe("allowed");
  });

  test("rejects bodies over the limit", () => {
    expect(statusFor({ "content-length": String(MAX_REQUEST_BODY_BYTES + 1) })).toBe(413);
    expect(statusFor({ "content-length": "99999999999999999999999" })).toBe(413);
  });

  test("rejects chunked bodies, even when a small length is also declared", () => {
    expect(statusFor({ "transfer-encoding": "chunked" })).toBe(411);
    expect(statusFor({ "transfer-encoding": "chunked", "content-length": "10" })).toBe(411);
  });

  test("rejects malformed lengths", () => {
    for (const value of ["abc", "-1", "1.5", "1e6"]) expect(statusFor({ "content-length": value })).toBe(400);
  });
});
