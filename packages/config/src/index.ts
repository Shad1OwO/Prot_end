import { z } from "zod";

const booleanString = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const sharedSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  API_ORIGIN: z.url().default("http://localhost:4000"),
});

export const apiEnvironmentSchema = sharedSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
  INTERNAL_API_KEY: z.string().min(16).default("development-internal-key"),
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
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export const getApiEnvironment = (source: NodeJS.ProcessEnv = process.env) => apiEnvironmentSchema.parse(source);
export const getWorkerEnvironment = (source: NodeJS.ProcessEnv = process.env) => workerEnvironmentSchema.parse(source);
