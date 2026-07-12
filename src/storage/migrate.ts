import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadDatabaseEnvironment } from "../config.js";
import { createPostgresPool } from "./postgres.js";

const MIGRATION_LOCK_ID = 8_212_026;

async function migrate(): Promise<void> {
  const environment = loadDatabaseEnvironment();
  const pool = createPostgresPool(environment.DATABASE_URL);
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDirectory = resolve(process.cwd(), "migrations");
    const entries = await readdir(migrationsDirectory, { withFileTypes: true });
    const migrationNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();

    for (const name of migrationNames) {
      const applied = await client.query<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [name],
      );

      if (applied.rowCount && applied.rowCount > 0) {
        continue;
      }

      const sql = await readFile(resolve(migrationsDirectory, name), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [name],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Database migration failed", error);
  process.exit(1);
});
