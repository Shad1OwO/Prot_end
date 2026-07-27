import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, localeEnum, oauthProviderEnum, primaryId, scopeEnum, themeEnum, updatedAt } from "./common";

export const users = pgTable("users", {
  id: primaryId(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  locale: localeEnum("locale").notNull().default("en"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const oauthAccounts = pgTable("oauth_accounts", {
  id: primaryId(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: oauthProviderEnum("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  email: text("email"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("oauth_provider_subject_unique").on(table.provider, table.providerSubject),
  index("oauth_accounts_user_idx").on(table.userId),
]);

export const sessions = pgTable("sessions", {
  id: primaryId(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenFamilyId: uuid("token_family_id").notNull(),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [index("sessions_user_active_idx").on(table.userId, table.expiresAt)]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: primaryId(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  parentTokenId: uuid("parent_token_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("refresh_tokens_hash_unique").on(table.tokenHash),
  index("refresh_tokens_family_idx").on(table.familyId),
]);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  locale: localeEnum("locale").notNull().default("en"),
  defaultScope: scopeEnum("default_scope").notNull().default("thailand"),
  travelerTypes: text("traveler_types").array().notNull().default([]),
  preferredCategories: text("preferred_categories").array().notNull().default([]),
  aiHistoryOptIn: boolean("ai_history_opt_in").notNull().default(false),
  darkMode: themeEnum("dark_mode").notNull().default("system"),
  updatedAt: updatedAt(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  oauthAccounts: many(oauthAccounts),
  sessions: many(sessions),
  preferences: one(userPreferences),
}));
