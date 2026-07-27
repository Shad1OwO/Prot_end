import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export interface DatabaseConnection {
  client: Sql;
  db: PostgresJsDatabase<typeof schema>;
}

export function createDatabase(databaseUrl: string): DatabaseConnection {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  return { client, db: drizzle(client, { schema }) };
}

export * from "./schema";
