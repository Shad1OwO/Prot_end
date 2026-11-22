import { timingSafeEqual } from "node:crypto";
import { HttpError } from "../http/errors";
import { parseCookies } from "../http/validation";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function verifyWriteRequest(request: Request, expectedOrigin: string): void {
  if (safeMethods.has(request.method)) return;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const originMatches = origin === expectedOrigin;
  const refererMatches = referer ? originOf(referer) === expectedOrigin : false;
  if (!originMatches && !refererMatches) throw new HttpError(403, "Forbidden", "Write requests must originate from the configured web application.");

  const cookies = parseCookies(request.headers.get("cookie"));
  if (!cookies.refresh_token && !cookies.access_token) return;
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = cookies.csrf_token;
  if (!headerToken || !cookieToken || !constantTimeEqual(headerToken, cookieToken)) throw new HttpError(403, "Forbidden", "A valid CSRF token is required.");
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the address to rate-limit on. Forwarding headers are client-controlled unless a proxy
 * overwrites them, so they are only read when `trustedHeader` names the one our proxy sets.
 */
export function clientAddress(request: Request, trustedHeader: "x-forwarded-for" | "cf-connecting-ip" | undefined, socketAddress: string | undefined): string {
  if (trustedHeader === "cf-connecting-ip") return request.headers.get("cf-connecting-ip")?.trim() || socketAddress || "local";
  // A proxy appends the address it saw, so only the last entry is one the client could not forge.
  if (trustedHeader === "x-forwarded-for") return request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || socketAddress || "local";
  return socketAddress || "local";
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
