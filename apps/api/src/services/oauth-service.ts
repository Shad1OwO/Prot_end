import type { Locale, OAuthProvider } from "@tourism/contracts";
import type { ApiEnvironment } from "@tourism/config";
import type { OAuthIdentityProvider } from "../domain/providers";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";
import { cookie, parseCookies } from "../http/validation";
import { cookiesAreSecure, SessionService, type IssuedSession } from "./session-service";
import { TokenService } from "./token-service";

export interface OAuthStartResult {
  redirectUrl: string;
  stateCookie: string;
}

export class OAuthService {
  readonly #secure: boolean;

  constructor(
    readonly repository: AppRepository,
    readonly sessions: SessionService,
    readonly tokens: TokenService,
    readonly providers: Record<OAuthProvider, OAuthIdentityProvider>,
    readonly env: ApiEnvironment,
  ) {
    this.#secure = cookiesAreSecure(env);
  }

  async start(providerName: OAuthProvider, locale: Locale, returnTo: string): Promise<OAuthStartResult> {
    const provider = this.providers[providerName];
    const redirectUri = `${this.env.API_ORIGIN}/api/v1/auth/oauth/${providerName}/callback`;
    const request = await provider.createAuthorizationRequest(redirectUri);
    const safeReturnTo = returnTo.startsWith(`/${locale}/`) || returnTo === `/${locale}` ? returnTo : `/${locale}`;
    const stateToken = await this.tokens.createOAuthState({ provider: providerName, state: request.state, nonce: request.nonce, codeVerifier: request.codeVerifier, locale, returnTo: safeReturnTo });
    return { redirectUrl: request.url, stateCookie: cookie("oauth_state", stateToken, { maxAge: 10 * 60, secure: this.#secure, sameSite: "Lax" }) };
  }

  async callback(providerName: OAuthProvider, request: Request, code: string, state: string): Promise<{ session: IssuedSession; returnTo: string; clearStateCookie: string }> {
    const cookies = parseCookies(request.headers.get("cookie"));
    if (!cookies.oauth_state) throw new HttpError(400, "Invalid OAuth State", "The sign-in state cookie is missing.");
    const claims = await this.tokens.verifyOAuthState(cookies.oauth_state);
    if (claims.provider !== providerName || !this.tokens.equal(claims.state, state)) throw new HttpError(400, "Invalid OAuth State", "The sign-in state did not match the original request.");
    const provider = this.providers[providerName];
    const identity = await provider.exchangeCode({ code, codeVerifier: claims.codeVerifier, expectedNonce: claims.nonce, redirectUri: `${this.env.API_ORIGIN}/api/v1/auth/oauth/${providerName}/callback` });
    const user = await this.repository.upsertOAuthIdentity(identity, claims.locale);
    const userAgent = request.headers.get("user-agent");
    const session = await this.sessions.issue(user, userAgent ? { userAgent } : {});
    return { session, returnTo: claims.returnTo, clearStateCookie: cookie("oauth_state", "", { maxAge: 0, secure: this.#secure }) };
  }
}
