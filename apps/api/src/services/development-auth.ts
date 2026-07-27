import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";
import { SessionService, type IssuedSession } from "./session-service";

export async function issueDevelopmentSession(repository: AppRepository, sessions: SessionService, nodeEnvironment: string): Promise<IssuedSession> {
  if (nodeEnvironment === "production") throw new HttpError(404, "Not Found", "The requested resource does not exist.");
  const user = await repository.findUserById("00000000-0000-4000-8000-000000000001");
  if (!user) throw new HttpError(503, "Development Session Unavailable", "The local development user is unavailable.");
  return sessions.issue(user);
}
