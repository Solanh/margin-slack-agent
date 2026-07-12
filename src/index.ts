import "dotenv/config";
import { loadEnvironment } from "./config.js";
import { CaptureRawNoteService } from "./services/captureRawNote.js";
import { createSlackApp } from "./slack/app.js";
import { createPostgresPool } from "./storage/postgres.js";
import { PostgresNoteRepository } from "./storage/postgresNoteRepository.js";

const environment = loadEnvironment();
const pool = createPostgresPool(environment.DATABASE_URL);
const noteRepository = new PostgresNoteRepository(pool);
const rawNoteCapturer = new CaptureRawNoteService(noteRepository);
const app = createSlackApp(environment, rawNoteCapturer);

async function start(): Promise<void> {
  await pool.query("SELECT 1");
  await app.start();
  console.log("Margin is connected to Slack and PostgreSQL.");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; stopping Margin.`);
  await app.stop();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch(async (error: unknown) => {
  console.error("Margin failed to start", error);
  await pool.end();
  process.exit(1);
});
