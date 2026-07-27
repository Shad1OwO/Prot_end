import { z } from "zod";
import { localeSchema, uuidSchema } from "./common";

export const oauthProviderSchema = z.enum(["google", "facebook"]);
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;
export const userSchema = z.object({ id: uuidSchema, email: z.email(), displayName: z.string().min(1), avatarUrl: z.url().nullable(), locale: localeSchema, createdAt: z.iso.datetime({ offset: true }) });
export type User = z.infer<typeof userSchema>;
export const userPreferencesSchema = z.object({ locale: localeSchema, defaultScope: z.enum(["thailand", "worldwide"]), travelerTypes: z.array(z.string()).max(10), preferredCategories: z.array(z.string()).max(20), aiHistoryOptIn: z.boolean(), darkMode: z.enum(["system", "light", "dark"]) });
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export const profilePatchSchema = z.object({ displayName: z.string().trim().min(2).max(80).optional(), locale: localeSchema.optional() });
export const sessionResponseSchema = z.object({ user: userSchema, preferences: userPreferencesSchema, csrfToken: z.string().min(32) });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export const preferencesUpdateSchema = userPreferencesSchema;
