import type { EmailLogin, EmailRegistration } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";
import { SessionService, type IssuedSession } from "./session-service";

const dummyPasswordHash = "$argon2id$v=19$m=65536,t=2,p=1$Rg88eMo+0IaHAIAEmHXRIUIEn+ts3k31A291REfwMow$peAl+3OAaXDLB/aOTNQHwEOsB+tKlysqOnU7KM+J7dc";

export class EmailAuthService {
  constructor(
    readonly repository: AppRepository,
    readonly sessions: SessionService,
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
    const credential = await this.repository.findEmailCredential(input.email);
    const valid = await Bun.password.verify(input.password, credential?.passwordHash ?? dummyPasswordHash);
    if (!credential || !valid) throw new HttpError(401, "Invalid Credentials", "The email address or password is incorrect.");
    return this.sessions.issue(credential.user, this.#metadata(request));
  }

  #metadata(request: Request): { userAgent?: string } {
    const userAgent = request.headers.get("user-agent");
    return userAgent ? { userAgent } : {};
  }
}
