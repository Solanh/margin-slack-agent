import "dotenv/config";
import {
  loadAIEnvironment,
  loadEncryptionEnvironment,
  loadEnvironment,
  loadGoogleEnvironment,
} from "./config.js";
import { GoogleOAuthCallbackServer } from "./http/googleOAuthCallbackServer.js";
import { AesGcmTokenCipher } from "./security/tokenCipher.js";
import { CaptureRawNoteService } from "./services/captureRawNote.js";
import { ContextResolutionService } from "./services/contextResolution.js";
import { GoogleCalendarApiService } from "./services/googleCalendarApi.js";
import {
  GoogleCalendarConnectionService,
  GoogleCalendarOAuthClient,
} from "./services/googleCalendarOAuth.js";
import { NoteCardService } from "./services/noteCard.js";
import { OpenAITransformationModel } from "./services/openAITransformationModel.js";
import { OrganizeNoteService } from "./services/organizeNote.js";
import { PostMeetingDigestService } from "./services/postMeetingDigest.js";
import { SlackContextSignalService } from "./services/slackContextSignals.js";
import { createSlackApp } from "./slack/app.js";
import { createPostgresPool } from "./storage/postgres.js";
import { PostgresContextCandidateRepository } from "./storage/postgresContextCandidateRepository.js";
import { PostgresMeetingRepository } from "./storage/postgresMeetingRepository.js";
import { PostgresNoteInteractionRepository } from "./storage/postgresNoteInteractionRepository.js";
import { PostgresNoteRepository } from "./storage/postgresNoteRepository.js";
import { PostgresOAuthAuthorizationStateRepository } from "./storage/postgresOAuthAuthorizationStateRepository.js";
import { PostgresOAuthConnectionRepository } from "./storage/postgresOAuthConnectionRepository.js";
import { PostgresPostMeetingDigestRepository } from "./storage/postgresPostMeetingDigestRepository.js";
import { PostgresSlackContextSignalRepository } from "./storage/postgresSlackContextSignalRepository.js";
import { PostgresTransformationRepository } from "./storage/postgresTransformationRepository.js";

const environment = loadEnvironment();
const aiEnvironment = loadAIEnvironment();
const googleEnvironment = loadGoogleEnvironment();
const encryptionEnvironment = loadEncryptionEnvironment();
const pool = createPostgresPool(environment.DATABASE_URL);
const cipher = AesGcmTokenCipher.fromBase64(
  encryptionEnvironment.TOKEN_ENCRYPTION_KEY,
  encryptionEnvironment.TOKEN_ENCRYPTION_KEY_VERSION,
);

const noteRepository = new PostgresNoteRepository(pool);
const meetingRepository = new PostgresMeetingRepository(pool);
const interactionRepository = new PostgresNoteInteractionRepository(
  pool,
  noteRepository,
);
const contextCandidateRepository = new PostgresContextCandidateRepository(
  pool,
  noteRepository,
);
const postMeetingDigests = new PostgresPostMeetingDigestRepository(pool);
const transformationRepository = new PostgresTransformationRepository(
  pool,
  noteRepository,
);
const oauthConnectionRepository = new PostgresOAuthConnectionRepository(
  pool,
  cipher,
);
const oauthStateRepository = new PostgresOAuthAuthorizationStateRepository(pool);
const slackContextSignalRepository =
  new PostgresSlackContextSignalRepository(pool);
const slackContextSignals = new SlackContextSignalService(
  slackContextSignalRepository,
);
const googleOAuthClient = new GoogleCalendarOAuthClient({
  clientId: googleEnvironment.GOOGLE_CLIENT_ID,
  clientSecret: googleEnvironment.GOOGLE_CLIENT_SECRET,
  redirectUri: googleEnvironment.GOOGLE_REDIRECT_URI,
});
const calendarConnections = new GoogleCalendarConnectionService(
  oauthStateRepository,
  oauthConnectionRepository,
  googleOAuthClient,
);
const googleCalendar = new GoogleCalendarApiService(
  oauthConnectionRepository,
  googleOAuthClient,
);
const contextResolver = new ContextResolutionService(
  noteRepository,
  meetingRepository,
  contextCandidateRepository,
  googleCalendar,
  slackContextSignals,
);
const callbackServer = new GoogleOAuthCallbackServer(
  {
    host: googleEnvironment.OAUTH_HTTP_HOST,
    port: googleEnvironment.OAUTH_HTTP_PORT,
    redirectUri: googleEnvironment.GOOGLE_REDIRECT_URI,
  },
  calendarConnections,
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
  contextCandidateRepository,
);
const app = createSlackApp(environment, {
  rawNoteCapturer,
  organizer,
  noteCards,
  contextResolver,
  calendarConnections,
  slackContextSignals,
  postMeetingDigests,
});
const digestWorker = new PostMeetingDigestService(postMeetingDigests, app.client);

async function start(): Promise<void> {
  await pool.query("SELECT 1");
  await slackContextSignals.deleteExpired();
  await callbackServer.start();
  await app.start();
  digestWorker.start();
  console.log(
    "Margin is connected to Slack, PostgreSQL, scored context resolution, post-meeting digests, note organization, and Google OAuth.",
  );
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; stopping Margin.`);
  digestWorker.stop();
  await app.stop();
  await callbackServer.stop();
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
  digestWorker.stop();
  await callbackServer.stop().catch(() => undefined);
  await pool.end();
  process.exit(1);
});
