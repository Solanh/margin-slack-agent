import "dotenv/config";
import { Pool } from "pg";
import { describeError } from "../observability/safeLogger.js";
import {
  assertDemoResetAllowed,
  loadDemoOwnerEnvironment,
} from "./demoEnvironment.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const owner = loadDemoOwnerEnvironment();
assertDemoResetAllowed(owner);

const pool = new Pool({ connectionString: databaseUrl });

const OWNER_SCOPED_TABLES = [
  "meeting_series_preferences",
  "slack_huddle_states",
  "slack_active_contexts",
  "notes",
  "meetings",
  "user_notification_preferences",
] as const;

async function main(): Promise<void> {
  const client = await pool.connect();
  const deletedRows: Record<string, number> = {};

  try {
    await client.query("BEGIN");
    for (const table of OWNER_SCOPED_TABLES) {
      const result = await client.query(
        `DELETE FROM ${table} WHERE workspace_id = $1 AND user_id = $2`,
        [owner.workspaceId, owner.userId],
      );
      deletedRows[table] = result.rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(
    JSON.stringify(
      {
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        deletedRows,
        preserved: [
          "workspace_installations",
          "oauth_connections",
          "oauth_authorization_states",
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error("Unable to reset demo data", describeError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
