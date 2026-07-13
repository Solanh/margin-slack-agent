import "dotenv/config";
import { Pool } from "pg";
import { loadDatabaseEnvironment } from "../config.js";
import type { OwnerScope } from "../domain/note.js";
import { PostgresMarginMcpNoteStore } from "./noteStore.js";
import { PostgresMarginMcpReminderStore } from "./reminderStore.js";
import { MarginMcpStdioServer } from "./stdioServer.js";
import { MarginMcpTools } from "./tools.js";

interface MarginMcpEnvironment {
  owner: OwnerScope;
  timeZone: string;
}

export function loadMarginMcpEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): MarginMcpEnvironment {
  const workspaceId = required(
    source.MARGIN_MCP_WORKSPACE_ID ?? source.DEMO_WORKSPACE_ID,
    "MARGIN_MCP_WORKSPACE_ID (or DEMO_WORKSPACE_ID)",
  );
  const userId = required(
    source.MARGIN_MCP_USER_ID ?? source.DEMO_USER_ID,
    "MARGIN_MCP_USER_ID (or DEMO_USER_ID)",
  );
  const timeZone = source.MARGIN_MCP_TIME_ZONE?.trim() || "UTC";

  if (!/^T[A-Z0-9]+$/u.test(workspaceId)) {
    throw new Error("MARGIN_MCP_WORKSPACE_ID must be a Slack workspace ID shaped like T…");
  }
  if (!/^U[A-Z0-9]+$/u.test(userId)) {
    throw new Error("MARGIN_MCP_USER_ID must be a Slack user ID shaped like U…");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error(`MARGIN_MCP_TIME_ZONE is not a valid IANA timezone: ${timeZone}`);
  }

  return {
    owner: { workspaceId, userId },
    timeZone,
  };
}

async function main(): Promise<void> {
  const database = loadDatabaseEnvironment();
  const mcp = loadMarginMcpEnvironment();
  const pool = new Pool({ connectionString: database.DATABASE_URL });

  try {
    await pool.query("SELECT 1");
    const notes = new PostgresMarginMcpNoteStore(pool);
    const reminders = new PostgresMarginMcpReminderStore(pool);
    const tools = new MarginMcpTools(
      notes,
      mcp.owner,
      mcp.timeZone,
      reminders,
    );
    const server = new MarginMcpStdioServer(tools);
    await server.run();
  } finally {
    await pool.end();
  }
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown MCP startup error";
  console.error(`Margin MCP failed to start: ${message}`);
  process.exitCode = 1;
});
