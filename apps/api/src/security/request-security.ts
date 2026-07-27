import { timingSafeEqual } from "node:crypto";
import { HttpError } from "../http/errors";
import { parseCookies } from "../http/validation";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyWriteRequest(request: Request, expectedOrigin: string): void {
  if (safeMethods.has(request.method)) return;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const originMatches = origin === expectedOrigin;
  const refererMatches = referer ? new URL(referer).origin === expectedOrigin : false;
  if (!originMatches && !refererMatches) throw new HttpError(403, "Forbidden", "Write requests must originate from the configured web application.");

  const cookies = parseCookies(request.headers.get("cookie"));
  if (!cookies.refresh_token && !cookies.access_token) return;
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = cookies.csrf_token;
  if (!headerToken || !cookieToken || !constantTimeEqual(headerToken, cookieToken)) throw new HttpError(403, "Forbidden", "A valid CSRF token is required.");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export const securityHeaders: Record<string, string> = {
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};
