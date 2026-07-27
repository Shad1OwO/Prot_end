import { customType, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

export const localeEnum = pgEnum("locale", ["en", "th"]);
export const scopeEnum = pgEnum("destination_scope", ["thailand", "worldwide"]);
export const oauthProviderEnum = pgEnum("oauth_provider", ["google", "facebook"]);
export const jobStatusEnum = pgEnum("recommendation_job_status", ["queued", "filtering", "routing", "ranking", "completed", "failed"]);
export const importStatusEnum = pgEnum("import_job_status", ["queued", "processing", "completed", "failed"]);
export const transportModeEnum = pgEnum("transport_mode", ["car", "rail", "transit", "airplane"]);
export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);

export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

export const primaryId = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
