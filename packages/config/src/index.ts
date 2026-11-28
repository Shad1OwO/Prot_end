import { z } from "zod";

const booleanString = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const sharedSchema = z.object({
  // Unset means production: a deployment that forgets NODE_ENV must not get development behaviour.
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  API_ORIGIN: z.url().default("http://localhost:4000"),
});

const developmentJwtSecret = "development-only-secret-change-me-now";
const developmentInternalKey = "development-internal-key";
/** Matches the built-in development values and the placeholders shipped in `.env.example`. */
const isPlaceholderSecret = (value: string) => /^(development-|replace-)/i.test(value);

export const apiEnvironmentSchema = sharedSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).default(developmentJwtSecret),
  INTERNAL_API_KEY: z.string().min(16).default(developmentInternalKey),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("tourism-media"),
  S3_ACCESS_KEY: z.string().default("minio"),
  S3_SECRET_KEY: z.string().default("development-minio-key"),
  S3_FORCE_PATH_STYLE: booleanString,
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  /** Sign-in, registration and password attempts allowed per client per window. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /**
   * Header the reverse proxy in front of the API writes the client address into.
   * Leave unset when the API is reached directly; never set it to a header clients can send themselves.
   */
  CLIENT_IP_HEADER: z.enum(["x-forwarded-for", "cf-connecting-ip"]).optional(),
  /** When set, `/metrics` requires `Authorization: Bearer <token>`. */
  METRICS_TOKEN: z.string().min(16).optional(),
}).superRefine((env, context) => {
  if (env.NODE_ENV !== "production") return;
  if (isPlaceholderSecret(env.JWT_SECRET)) context.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "JWT_SECRET must be set to a random secret in production (set NODE_ENV=development for local work)." });
  if (isPlaceholderSecret(env.INTERNAL_API_KEY)) context.addIssue({ code: "custom", path: ["INTERNAL_API_KEY"], message: "INTERNAL_API_KEY must be set to a random secret in production." });
  if (!env.DATABASE_URL) context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "DATABASE_URL is required in production; the in-memory store loses all data on restart." });
});

export const workerEnvironmentSchema = sharedSchema.extend({
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_PROVIDER_PRIORITY: z.string().default("openai,gemini,anthropic"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(12_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("tourism-media"),
  S3_ACCESS_KEY: z.string().default("minio"),
  S3_SECRET_KEY: z.string().default("development-minio-key"),
  S3_FORCE_PATH_STYLE: booleanString,
  MEDIA_CLAMAV_HOST: z.string().default("clamav"),
  MEDIA_CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  /** Days between automatic worldwide catalog imports from Wikidata; the first runs as soon as the catalog has none. 0 turns them off. */
  CATALOG_IMPORT_INTERVAL_DAYS: z.coerce.number().min(0).default(30),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export const getApiEnvironment = (source: NodeJS.ProcessEnv = process.env) => apiEnvironmentSchema.parse(source);
export const getWorkerEnvironment = (source: NodeJS.ProcessEnv = process.env) => workerEnvironmentSchema.parse(source);
