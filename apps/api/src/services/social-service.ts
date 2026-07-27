import type { Locale } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";
import { HttpError } from "../http/errors";

export class SocialService {
  constructor(readonly repository: AppRepository) {}

  async favorite(userId: string, destinationId: string, enabled: boolean): Promise<void> {
    await this.#assertDestination(destinationId);
    await this.repository.setFavorite(userId, destinationId, enabled);
  }

  async like(userId: string, destinationId: string, enabled: boolean): Promise<void> {
    await this.#assertDestination(destinationId);
    await this.repository.setLike(userId, destinationId, enabled);
  }

  listFavorites(userId: string, locale: Locale) {
    return this.repository.listFavorites(userId, locale);
  }

  async #assertDestination(destinationId: string): Promise<void> {
    if ((await this.repository.getByIds([destinationId], "en")).length === 0) throw new HttpError(404, "Destination Not Found", "The requested destination is unavailable or archived.");
  }
}
