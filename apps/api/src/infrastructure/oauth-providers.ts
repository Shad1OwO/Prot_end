import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { OAuthIdentityProvider, OAuthAuthorizationRequest } from "../domain/providers";
import type { OAuthIdentity } from "../domain/repositories";
import { HttpError } from "../http/errors";

function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new HttpError(502, "OAuth Provider Error", `The identity provider returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

/** Turns verified ID-token claims into an identity. The token signature is checked by the caller. */
export function googleIdentityFromClaims(payload: JWTPayload, expectedNonce: string): OAuthIdentity {
  if (payload.nonce !== expectedNonce || !payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") throw new HttpError(400, "Invalid OAuth Identity", "Google returned an incomplete or unverified identity.");
  // Accounts are matched by email address, so an address Google has not verified proves nothing.
  if (payload.email_verified !== true) throw new HttpError(400, "Invalid OAuth Identity", "Google has not verified this email address.");
  return { provider: "google", subject: payload.sub, email: payload.email, displayName: payload.name, avatarUrl: typeof payload.picture === "string" ? payload.picture : null };
}

export class GoogleOAuthProvider implements OAuthIdentityProvider {
  readonly provider = "google" as const;
  readonly configured: boolean;
  readonly #jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

  constructor(readonly clientId?: string, readonly clientSecret?: string) {
    this.configured = Boolean(clientId && clientSecret);
  }

  async createAuthorizationRequest(redirectUri: string): Promise<OAuthAuthorizationRequest> {
    this.#assertConfigured();
    const state = randomUrlSafe();
    const nonce = randomUrlSafe();
    const codeVerifier = randomUrlSafe(64);
    const parameters = new URLSearchParams({ client_id: this.clientId as string, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: codeChallenge(codeVerifier), code_challenge_method: "S256", access_type: "offline", prompt: "select_account" });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}`, state, nonce, codeVerifier };
  }

  async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string; expectedNonce: string }): Promise<OAuthIdentity> {
    this.#assertConfigured();
    const tokens = await fetchJson<{ id_token: string }>("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: input.code, client_id: this.clientId as string, client_secret: this.clientSecret as string, redirect_uri: input.redirectUri, grant_type: "authorization_code", code_verifier: input.codeVerifier }) });
    const { payload } = await jwtVerify(tokens.id_token, this.#jwks, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: this.clientId as string });
    return googleIdentityFromClaims(payload, input.expectedNonce);
  }

  #assertConfigured(): void {
    if (!this.configured) throw new HttpError(503, "OAuth Not Configured", "Google sign-in is not configured on this server.");
  }
}
