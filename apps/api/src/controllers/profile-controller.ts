import { preferencesUpdateSchema, profilePatchSchema } from "@tourism/contracts";
import type { ProfileService } from "../services/profile-service";
import { parseInput } from "../http/validation";

export class ProfileController {
  constructor(readonly service: ProfileService) {}

  updateProfile(userId: string, body: unknown) {
    const input = parseInput(profilePatchSchema, body);
    return this.service.updateProfile(userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    });
  }

  updatePreferences(userId: string, body: unknown) {
    return this.service.updatePreferences(userId, parseInput(preferencesUpdateSchema, body));
  }
}
