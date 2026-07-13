import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getMigrationStatus } from "../src/storage/migrationStatus.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("migration readiness", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports the CI database as current after migrations run", async () => {
    const status = await getMigrationStatus(pool);

    expect(status.expected.length).toBeGreaterThan(0);
    expect(status.pending).toEqual([]);
    expect(status.unexpected).toEqual([]);
    expect(status.current).toBe(true);
  });
});
