import "dotenv/config";
import {
  loadAIEnvironment,
  loadEncryptionEnvironment,
  loadEnvironment,
  loadGoogleEnvironment,
} from "./config.js";
import { ApplicationHttpServer } from "./http/applicationHttpServer.js";
import { RuntimeReadiness } from "./http/readiness.js";
import { describeError } from "./observability/safeLogger.js";
import { AesGcmTokenCipher } from "./security/tokenCipher.js";
import { CaptureRawNoteService } from "./services/captureRawNote.js";
import { ContextResolutionService } from "./services/contextResolution.js";
import { GoogleCalendarApiService } from "./services/googleCalendarApi.js";
import {
  GoogleCalendarConnectionService,
  GoogleCalendarOAuthClient,
} from "./services/googleCalendarOAuth.js";
import { NoteCardService } from "./services/noteCard.js";
import { NoteRetrievalService } from "./services/noteRetrieval.js";
import { OpenAITransformationModel } from "./services/openAITransformationModel.js";
import { OrganizeNoteService } from "./services/organizeNote.js";
import { PostMeetingDigestService } from "./services/postMeetingDigest.js";
import { PreMeetingResurfacingService } from "./services/preMeetingResurfacing.js";
import { SlackContextSignalService } from "./services/slackContextSignals.js";
import {
  RetentionCleanupService,
  UserDataControlService,
} from "./services/userDataControls.js";
import { createSlackApp } from "./slack/app.js";
import { getMigrationStatus } from "./storage/migrationStatus.js";
import { createPostgresPool } from "./storage/postgres.js";
import { PostgresContextCandidateRepository } from "./storage/postgresContextCandidateRepository.js";
import { PostgresMeetingRepository } from "./storage/postgresMeetingRepository.js";
import { PostgresNoteInteractionRepository } from "./storage/postgresNoteInteractionRepository.js";
import { PostgresNoteRepository } from "./storage/postgresNoteRepository.js";
import { PostgresNoteRetrievalRepository } from "./storage/postgresNoteRetrievalRepository.js";
import { PostgresOAuthAuthorizationStateRepository } from "./storage/postgresOAuthAuthorizationStateRepository.js";
import { PostgresOAuthConnectionRepository } from "./storage/postgresOAuthConnectionRepository.js";
import { PostgresPostMeetingDigestRepository } from "./storage/postgresPostMeetingDigestRepository.js";
import { PostgresPreMeetingResurfacingRepository } from "./storage/postgresPreMeetingResurfacingRepository.js";
import { PostgresSlackContextSignalRepository } from "./storage/postgresSlackContextSignalRepository.js";
import { PostgresTransformationRepository } from "./storage/postgresTransformationRepository.js";
import { PostgresUserDataRepository } from "./storage/postgresUserDataRepository.js";

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
const noteRetrievalRepository = new PostgresNoteRetrievalRepository(pool);
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
const preMeetingResurfacings =
  new PostgresPreMeetingResurfacingRepository(pool);
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
const userDataRepository = new PostgresUserDataRepository(pool);

let calendarConnections: GoogleCalendarConnectionService;
let googleCalendar: GoogleCalendarApiService;

if (googleEnvironment.enabled) {
  const googleOAuthClient = new GoogleCalendarOAuthClient({
    clientId: googleEnvironment.GOOGLE_CLIENT_ID,
    clientSecret: googleEnvironment.GOOGLE_CLIENT_SECRET,
    redirectUri: googleEnvironment.GOOGLE_REDIRECT_URI,
  });
  calendarConnections = new GoogleCalendarConnectionService(
    oauthStateRepository,
    oauthConnectionRepository,
    googleOAuthClient,
  );
  googleCalendar = new GoogleCalendarApiService(
    oauthConnectionRepository,
    googleOAuthClient,
  );
} else {
  calendarConnections = GoogleCalendarConnectionService.disabled();
  googleCalendar = GoogleCalendarApiService.disabled();
}

const userDataControls = new UserDataControlService(
  userDataRepository,
  calendarConnections,
);
const contextResolver = new ContextResolutionService(
  noteRepository,
  meetingRepository,
  contextCandidateRepository,
  googleCalendar,
  slackContextSignals,
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
const noteRetrieval = new NoteRetrievalService(noteRetrievalRepository);
const app = createSlackApp(environment, {
  rawNoteCapturer,
  organizer,
  noteCards,
  noteRetrieval,
  contextResolver,
  calendarConnections,
  slackContextSignals,
  postMeetingDigests,
  preMeetingResurfacings,
  userDataControls,
});
const digestWorker = new PostMeetingDigestService(postMeetingDigests, app.client);
const retentionWorker = new RetentionCleanupService(userDataRepository);
const resurfacingWorker = googleEnvironment.enabled
  ? new PreMeetingResurfacingService(
      preMeetingResurfacings,
      meetingRepository,
      googleCalendar,
      app.client,
    )
  : null;
const readiness = new RuntimeReadiness({
  checkDatabase: async () => {
    await pool.query("SELECT 1");
    return true;
  },
  checkMigrations: async () => (await getMigrationStatus(pool)).current,
  resurfacingRequired: googleEnvironment.enabled,
});
const httpServer = new ApplicationHttpServer({
  host: environment.HTTP_HOST,
  port: environment.HTTP_PORT,
  readiness,
  ...(googleEnvironment.enabled
    ? {
        googleCalendar: {
          redirectUri: googleEnvironment.GOOGLE_REDIRECT_URI,
          connections: calendarConnections,
        },
      }
    : {}),
});

async function start(): Promise<void> {
  await httpServer.start();
  await pool.query("SELECT 1");
  const migrationStatus = await getMigrationStatus(pool);
  if (!migrationStatus.current) {
    throw new Error(
      `Database migrations are not current. Pending: ${migrationStatus.pending.join(", ") || "none"}; unexpected: ${migrationStatus.unexpected.join(", ") || "none"}.`,
    );
  }
  await slackContextSignals.deleteExpired();
  await app.start();
  readiness.markSlackStarted();
  digestWorker.start();
  readiness.markDigestWorkerStarted();
  retentionWorker.start();
  if (resurfacingWorker) {
    resurfacingWorker.start();
    readiness.markResurfacingWorkerStarted();
  }
  console.log(
    googleEnvironment.enabled
      ? "Margin is ready with Slack, PostgreSQL, workers, private data controls, note retrieval, scored context resolution, note organization, and Google Calendar."
      : "Margin is ready with Slack, PostgreSQL, workers, private data controls, note retrieval, Slack context resolution, and note organization. Google Calendar integration is disabled.",
  );
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; stopping Margin.`);
  retentionWorker.stop();
  resurfacingWorker?.stop();
  readiness.markResurfacingWorkerStopped();
  digestWorker.stop();
  readiness.markDigestWorkerStopped();
  await app.stop();
  readiness.markSlackStopped();
  await httpServer.stop();
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
  console.error("Margin failed to start", describeError(error));
  retentionWorker.stop();
  resurfacingWorker?.stop();
  readiness.markResurfacingWorkerStopped();
  digestWorker.stop();
  readiness.markDigestWorkerStopped();
  readiness.markSlackStopped();
  await httpServer.stop().catch(() => undefined);
  await pool.end();
  process.exit(1);
});
