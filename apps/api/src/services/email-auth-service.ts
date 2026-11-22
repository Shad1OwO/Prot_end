import type { EmailLogin, EmailRegistration, PasswordChange, User } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";
import { FixedWindowRateLimiter } from "../security/rate-limit";
import { SessionService, type IssuedSession } from "./session-service";

const dummyPasswordHash = "$argon2id$v=19$m=65536,t=2,p=1$Rg88eMo+0IaHAIAEmHXRIUIEn+ts3k31A291REfwMow$peAl+3OAaXDLB/aOTNQHwEOsB+tKlysqOnU7KM+J7dc";

export class EmailAuthService {
  constructor(
    readonly repository: AppRepository,
    readonly sessions: SessionService,
    /** Failed sign-ins per address: ten in fifteen minutes, then the address is locked until the window ends. */
    readonly failures = new FixedWindowRateLimiter(10, 15 * 60),
  ) {}

  async register(input: EmailRegistration, request: Request): Promise<IssuedSession> {
    if (await this.repository.findUserByEmail(input.email)) {
      throw new HttpError(409, "Account Already Exists", "An account with this email address already exists.");
    }
    const passwordHash = await Bun.password.hash(input.password, { algorithm: "argon2id" });
    try {
      const user = await this.repository.createEmailCredential({ ...input, passwordHash });
      return this.sessions.issue(user, this.#metadata(request));
    } catch (error) {
      if (error instanceof Error && (error.message === "EMAIL_CREDENTIAL_EXISTS" || "code" in error && error.code === "23505")) {
        throw new HttpError(409, "Account Already Exists", "An account with this email address already exists.");
      }
      throw error;
    }
  }

  async login(input: EmailLogin, request: Request): Promise<IssuedSession> {
    // Checked before the password so a locked address cannot be guessed at, even correctly.
    if (!this.failures.peek(input.email).allowed) throw new HttpError(429, "Too Many Attempts", "Too many failed sign-in attempts for this account. Try again later.");
    const credential = await this.repository.findEmailCredential(input.email);
    const valid = await Bun.password.verify(input.password, credential?.passwordHash ?? dummyPasswordHash);
    if (!credential || !valid) {
      this.failures.consume(input.email);
      throw new HttpError(401, "Invalid Credentials", "The email address or password is incorrect.");
    }
    this.failures.reset(input.email);
    return this.sessions.issue(credential.user, this.#metadata(request));
  }

  /** Sets a new password and signs out every session except the one making the change. */
  async changePassword(user: User, sessionId: string, input: PasswordChange): Promise<void> {
    const credential = await this.repository.findEmailCredential(user.email);
    // Accounts created through Google have no password yet, so there is nothing to confirm.
    if (credential && !(input.currentPassword && await Bun.password.verify(input.currentPassword, credential.passwordHash))) {
      throw new HttpError(403, "Invalid Credentials", "The current password is incorrect.");
    }
    await this.repository.setPassword(user.id, await Bun.password.hash(input.newPassword, { algorithm: "argon2id" }));
    await this.repository.revokeUserSessions(user.id, sessionId);
  }

  #metadata(request: Request): { userAgent?: string } {
    const userAgent = request.headers.get("user-agent");
    return userAgent ? { userAgent } : {};
  }
}
