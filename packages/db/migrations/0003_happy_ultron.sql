ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
-- Accounts that already signed in through an identity provider have a provider-verified address.
UPDATE "users" SET "email_verified_at" = now() WHERE "id" IN (SELECT "user_id" FROM "oauth_accounts");
