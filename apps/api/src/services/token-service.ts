import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { OAuthProvider } from "@tourism/contracts";
import { HttpError } from "../http/errors";

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  familyId: string;
}

export interface OAuthStateClaims {
  provider: OAuthProvider;
  state: string;
  nonce: string;
  codeVerifier: string;
  locale: "en" | "th";
  returnTo: string;
}

export class TokenService {
  readonly #key: Uint8Array;

  constructor(secret: string, readonly issuer: string, readonly audience: string) {
    this.#key = new TextEncoder().encode(secret);
  }

  async createAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, fam: claims.familyId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime("15m")
      .setJti(crypto.randomUUID())
      .sign(this.#key);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.#key, { issuer: this.issuer, audience: this.audience, algorithms: ["HS256"] });
      if (!payload.sub || typeof payload.sid !== "string" || typeof payload.fam !== "string") throw new Error("Missing access token claims");
      return { userId: payload.sub, sessionId: payload.sid, familyId: payload.fam };
    } catch {
      throw new HttpError(401, "Unauthorized", "The access token is missing, invalid, or expired.");
    }
  }

  async createOAuthState(claims: OAuthStateClaims): Promise<string> {
    return new SignJWT({ ...claims, kind: "oauth_state" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime("10m")
      .setJti(crypto.randomUUID())
      .sign(this.#key);
  }

  async verifyOAuthState(token: string): Promise<OAuthStateClaims> {
    try {
      const { payload } = await jwtVerify(token, this.#key, { issuer: this.issuer, audience: this.audience, algorithms: ["HS256"] });
      if (payload.kind !== "oauth_state" || (payload.provider !== "google" && payload.provider !== "facebook") || typeof payload.state !== "string" || typeof payload.nonce !== "string" || typeof payload.codeVerifier !== "string" || (payload.locale !== "en" && payload.locale !== "th") || typeof payload.returnTo !== "string") throw new Error("Invalid OAuth state claims");
      return { provider: payload.provider, state: payload.state, nonce: payload.nonce, codeVerifier: payload.codeVerifier, locale: payload.locale, returnTo: payload.returnTo };
    } catch {
      throw new HttpError(400, "Invalid OAuth State", "The sign-in request expired or could not be verified.");
    }
  }

  createRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  createCsrfToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashOpaqueToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  equal(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
  }
}
