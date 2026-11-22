import type { SessionResponse, User } from "@tourism/contracts";
import type { ApiEnvironment } from "@tourism/config";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";
import { cookie, parseCookies } from "../http/validation";
import { TokenService, type AccessTokenClaims } from "./token-service";

export interface IssuedSession {
  response: SessionResponse;
  cookies: string[];
}

export interface SessionServiceOptions {
  /**
   * How long after a refresh token is used a second use is treated as a harmless race (two tabs
   * refreshing at once) rather than as theft. Outside this window reuse revokes the whole family.
   */
  refreshReuseGraceMs?: number;
}

/** Cookies must be Secure whenever the site is HTTPS, whatever NODE_ENV says. */
export const cookiesAreSecure = (env: Pick<ApiEnvironment, "WEB_ORIGIN" | "NODE_ENV">) => env.NODE_ENV === "production" || new URL(env.WEB_ORIGIN).protocol === "https:";

export class SessionService {
  readonly #secure: boolean;
  readonly #refreshReuseGraceMs: number;

  constructor(
    readonly repository: AppRepository,
    readonly tokens: TokenService,
    env: ApiEnvironment,
    options: SessionServiceOptions = {},
  ) {
    this.#secure = cookiesAreSecure(env);
    this.#refreshReuseGraceMs = options.refreshReuseGraceMs ?? 10_000;
  }

  async issue(user: User, metadata: { userAgent?: string; ipHash?: string } = {}): Promise<IssuedSession> {
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    const session = await this.repository.createSession(user.id, familyId, expiresAt, metadata.userAgent, metadata.ipHash);
    return this.#issueTokens(user, session.id, familyId, expiresAt);
  }

  async rotate(rawRefreshToken: string): Promise<IssuedSession> {
    const tokenHash = this.tokens.hashOpaqueToken(rawRefreshToken);
    const stored = await this.repository.findRefreshToken(tokenHash);
    if (!stored) throw new HttpError(401, "Unauthorized", "The refresh token is invalid.");
    if (stored.usedAt) {
      if (Date.now() - stored.usedAt.getTime() < this.#refreshReuseGraceMs) throw refreshInProgress();
      await this.repository.revokeFamily(stored.familyId);
      throw new HttpError(401, "Refresh Token Replay", "Refresh-token reuse was detected and the session family was revoked.");
    }
    if (stored.revokedAt || stored.expiresAt <= new Date()) throw new HttpError(401, "Unauthorized", "The refresh token is expired or revoked.");
    const session = await this.repository.findSession(stored.sessionId);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new HttpError(401, "Unauthorized", "The session is expired or revoked.");
    const user = await this.repository.findUserById(stored.userId);
    if (!user) throw new HttpError(401, "Unauthorized", "The session owner no longer exists.");
    // Checking `usedAt` above and writing it here are separate steps; only the request that wins this claim may rotate.
    if (!(await this.repository.markRefreshTokenUsed(stored.id))) throw refreshInProgress();
    return this.#issueTokens(user, stored.sessionId, stored.familyId, stored.expiresAt, stored.id);
  }

  /** The access token a request presents, from the Authorization header or the session cookie. */
  accessTokenFrom(request: Request): string | undefined {
    const authorization = request.headers.get("authorization");
    return authorization?.startsWith("Bearer ") ? authorization.slice(7) : parseCookies(request.headers.get("cookie")).access_token;
  }

  async authenticate(request: Request, required = true): Promise<{ user: User; claims: AccessTokenClaims } | null> {
    const token = this.accessTokenFrom(request);
    if (!token) {
      if (required) throw new HttpError(401, "Unauthorized", "Sign in is required for this action.");
      return null;
    }
    try {
      const claims = await this.tokens.verifyAccessToken(token);
      const [session, user] = await Promise.all([this.repository.findSession(claims.sessionId), this.repository.findUserById(claims.userId)]);
      if (!session || session.userId !== claims.userId || session.familyId !== claims.familyId || session.revokedAt || session.expiresAt <= new Date() || !user) throw new HttpError(401, "Unauthorized", "The session is expired or revoked.");
      return { user, claims };
    } catch (error) {
      if (!required && error instanceof HttpError) return null;
      throw error;
    }
  }

  async logout(request: Request): Promise<string[]> {
    const cookies = parseCookies(request.headers.get("cookie"));
    if (cookies.refresh_token) {
      const stored = await this.repository.findRefreshToken(this.tokens.hashOpaqueToken(cookies.refresh_token));
      if (stored) await this.repository.revokeFamily(stored.familyId);
    } else {
      const authenticated = await this.authenticate(request, false);
      if (authenticated) await this.repository.revokeFamily(authenticated.claims.familyId);
    }
    return this.clearCookies();
  }

  clearCookies(): string[] {
    return [
      cookie("access_token", "", { maxAge: 0, secure: this.#secure }),
      cookie("refresh_token", "", { maxAge: 0, secure: this.#secure }),
      cookie("csrf_token", "", { maxAge: 0, secure: this.#secure, httpOnly: false }),
    ];
  }

  async #issueTokens(user: User, sessionId: string, familyId: string, expiresAt: Date, parentTokenId?: string): Promise<IssuedSession> {
    const rawRefreshToken = this.tokens.createRefreshToken();
    const refreshTokenId = crypto.randomUUID();
    await this.repository.createRefreshToken({
      id: refreshTokenId,
      sessionId,
      familyId,
      userId: user.id,
      tokenHash: this.tokens.hashOpaqueToken(rawRefreshToken),
      expiresAt,
      ...(parentTokenId ? { parentTokenId } : {}),
    });
    const accessToken = await this.tokens.createAccessToken({ userId: user.id, sessionId, familyId });
    const csrfToken = this.tokens.createCsrfToken();
    const preferences = await this.repository.getPreferences(user.id);
    return {
      response: { user, preferences, csrfToken },
      cookies: [
        cookie("access_token", accessToken, { maxAge: 15 * 60, secure: this.#secure }),
        cookie("refresh_token", rawRefreshToken, { maxAge: 30 * 24 * 60 * 60, secure: this.#secure }),
        cookie("csrf_token", csrfToken, { maxAge: 30 * 24 * 60 * 60, secure: this.#secure, httpOnly: false }),
      ],
    };
  }
}

/** Another request is rotating this token right now; the caller should retry with the cookies that request set. */
function refreshInProgress(): HttpError {
  return new HttpError(409, "Refresh In Progress", "This session is already being refreshed. Retry the original request.");
}
