import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresOAuthAuthorizationStateRepository } from "../src/storage/postgresOAuthAuthorizationStateRepository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("OAuth authorization state", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const states = new PostgresOAuthAuthorizationStateRepository(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("stores only a hash and consumes a valid state exactly once", async () => {
    const owner = {
      workspaceId: `T-${crypto.randomUUID()}`,
      userId: "U-owner",
    };
    const created = await states.create(
      owner,
      "google_calendar",
      new Date(Date.now() + 60_000),
    );

    const stored = await pool.query<{
      state_hash: string;
      consumed_at: Date | null;
    }>(
      `
        SELECT state_hash, consumed_at
        FROM oauth_authorization_states
        WHERE workspace_id = $1 AND user_id = $2
      `,
      [owner.workspaceId, owner.userId],
    );

    expect(stored.rows[0]?.state_hash).not.toBe(created.state);
    expect(stored.rows[0]?.state_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(stored.rows[0]?.consumed_at).toBeNull();

    await expect(
      states.consume(created.state, "google_calendar"),
    ).resolves.toEqual(owner);
    await expect(
      states.consume(created.state, "google_calendar"),
    ).resolves.toBeNull();

    await pool.query(
      "DELETE FROM oauth_authorization_states WHERE workspace_id = $1",
      [owner.workspaceId],
    );
  });

  it("rejects expired state and deletes expired or consumed rows", async () => {
    const owner = {
      workspaceId: `T-${crypto.randomUUID()}`,
      userId: "U-owner",
    };
    const created = await states.create(
      owner,
      "google_calendar",
      new Date(Date.now() + 1_000),
    );
    const future = new Date(Date.now() + 10_000);

    await expect(
      states.consume(created.state, "google_calendar", future),
    ).resolves.toBeNull();
    await expect(states.deleteExpired(future)).resolves.toBeGreaterThanOrEqual(1);
  });
});
