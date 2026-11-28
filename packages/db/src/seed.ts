import { createDatabase } from "./index";
import { seedCatalog } from "./seed-catalog";

// The worker runs the same seed each time it starts; this runs it by hand.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const { client, db } = createDatabase(databaseUrl);
try {
  const result = await seedCatalog(db);
  console.info(JSON.stringify({ message: "catalog_seed_finished", added: result.added.length, archivedDuplicates: result.archivedDuplicates, skipped: result.skipped }));
} finally {
  await client.end();
}
