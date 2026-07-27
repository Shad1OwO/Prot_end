import { getApiEnvironment } from "@tourism/config";
import { createApplication } from "./app";

const env = getApiEnvironment();
const tourism = createApplication({ env });
tourism.app.listen({ hostname: "0.0.0.0", port: env.PORT });

console.info(JSON.stringify({ level: "info", message: "api_started", host: "0.0.0.0", port: env.PORT, database: env.DATABASE_URL ? "remote" : "memory", queue: env.REDIS_URL ? "redis" : "inline" }));

async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ level: "info", message: "api_stopping", signal }));
  await tourism.close();
  process.exit(0);
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
