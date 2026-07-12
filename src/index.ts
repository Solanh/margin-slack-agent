import "dotenv/config";
import { loadAIEnvironment, loadEnvironment } from "./config.js";
import { CaptureRawNoteService } from "./services/captureRawNote.js";
import { NoteCardService } from "./services/noteCard.js";
import { OpenAITransformationModel } from "./services/openAITransformationModel.js";
import { OrganizeNoteService } from "./services/organizeNote.js";
import { createSlackApp } from "./slack/app.js";
import { PostgresMeetingRepository } from "./storage/postgresMeetingRepository.js";
import { createPostgresPool } from "./storage/postgres.js";
import { PostgresNoteInteractionRepository } from "./storage/postgresNoteInteractionRepository.js";
import { PostgresNoteRepository } from "./storage/postgresNoteRepository.js";
import { PostgresTransformationRepository } from "./storage/postgresTransformationRepository.js";

const environment = loadEnvironment();
const aiEnvironment = loadAIEnvironment();
const pool = createPostgresPool(environment.DATABASE_URL);
const noteRepository = new PostgresNoteRepository(pool);
const meetingRepository = new PostgresMeetingRepository(pool);
const interactionRepository = new PostgresNoteInteractionRepository(
  pool,
  noteRepository,
);
const transformationRepository = new PostgresTransformationRepository(
  pool,
  noteRepository,
);
const transformationModel = new OpenAITransformationModel(
  aiEnvironment.AI_API_KEY,
  aiEnvironment.AI_MODEL,
);
const rawNoteCapturer = new CaptureRawNoteService(noteRepository);
const organizer = new OrganizeNoteService(
  noteRepository,
  transformationRepository,
  transformationModel,
);
const noteCards = new NoteCardService(
  noteRepository,
  interactionRepository,
  meetingRepository,
);
const app = createSlackApp(environment, {
  rawNoteCapturer,
  organizer,
  noteCards,
});

async function start(): Promise<void> {
  await pool.query("SELECT 1");
  await app.start();
  console.log("Margin is connected to Slack, PostgreSQL, and note organization.");
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
