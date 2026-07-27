import type { Locale, UserPreferences } from "@tourism/contracts";
import type { AppRepository } from "../domain/repositories";

export class ProfileService {
  constructor(readonly repository: AppRepository) {}

  updateProfile(userId: string, patch: { displayName?: string; locale?: Locale }) {
    return this.repository.updateProfile(userId, patch);
  }

  updatePreferences(userId: string, preferences: UserPreferences) {
    return this.repository.updatePreferences(userId, preferences);
  }
}
