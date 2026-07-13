import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { Pool, type QueryResultRow } from "pg";
import {
  loadAIEnvironment,
  loadEncryptionEnvironment,
  loadEnvironment,
  loadGoogleEnvironment,
} from "../config.js";
import { describeError } from "../observability/safeLogger.js";
import { AesGcmTokenCipher } from "../security/tokenCipher.js";
import { GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE } from "../services/googleCalendarOAuth.js";
import { getMigrationStatus } from "../storage/migrationStatus.js";
import { loadDemoOwnerEnvironment } from "./demoEnvironment.js";
import {
  evaluateDemoSeed,
  formatCheckLine,
  normalizeBaseUrl,
  summarizeChecks,
  type DemoSeedSnapshot,
  type PreflightCheck,
} from "./preflightChecks.js";

interface SeedSnapshotRow extends QueryResultRow {
  note_count: string;
  meeting_count: string;
  ambiguous_candidate_count: string;
  digest_status: string | null;
  digest_channel_id: string | null;
  resurfacing_status: string | null;
  resurfacing_channel_id: string | null;
}

interface OAuthScopeRow extends QueryResultRow {
  scopes: string[];
}

interface ReadinessResponse {
  ready?: unknown;
  checks?: unknown;
}

const requireLive = process.argv.includes("--require-live");

async function main(): Promise<void> {
  const checks: PreflightCheck[] = [];
  const environment = loadEnvironment();
  const encryption = loadEncryptionEnvironment();
  loadAIEnvironment();
  const google = loadGoogleEnvironment();
  const demo = loadDemoOwnerEnvironment();
  const pool = new Pool({ connectionString: environment.DATABASE_URL });

  checks.push({
    name: "Environment configuration",
    status: "pass",
    detail: "Slack, database, HTTP, AI, and encryption variables parsed successfully.",
  });

  try {
    AesGcmTokenCipher.fromBase64(
      encryption.TOKEN_ENCRYPTION_KEY,
      encryption.TOKEN_ENCRYPTION_KEY_VERSION,
    );
    checks.push({
      name: "Token encryption key",
      status: "pass",
      detail: `Valid 32-byte key at version ${encryption.TOKEN_ENCRYPTION_KEY_VERSION}.`,
    });
  } catch (error) {
    checks.push(failedCheck("Token encryption key", error));
  }

  checks.push(identifierCheck("Demo workspace ID", demo.workspaceId, "T"));
  checks.push(identifierCheck("Demo user ID", demo.userId, "U"));
  checks.push(identifierCheck("Demo source channel", demo.sourceChannelId, "D"));

  try {
    await pool.query("SELECT 1");
    checks.push({
      name: "PostgreSQL connection",
      status: "pass",
      detail: "Database accepted a query.",
    });

    const migrationStatus = await getMigrationStatus(pool);
    checks.push(
      migrationStatus.current
        ? {
            name: "Database migrations",
            status: "pass",
            detail: `${migrationStatus.applied.length} expected migrations are applied.`,
          }
        : {
            name: "Database migrations",
            status: "fail",
            detail: `Pending: ${migrationStatus.pending.join(", ") || "none"}; unexpected: ${migrationStatus.unexpected.join(", ") || "none"}.`,
          },
    );

    const seedSnapshot = await loadSeedSnapshot(
      pool,
      demo.workspaceId,
      demo.userId,
    );
    checks.push(...evaluateDemoSeed(seedSnapshot));

    if (google.enabled) {
      checks.push(
        await checkGoogleConnection(pool, demo.workspaceId, demo.userId),
      );
    } else {
      checks.push({
        name: "Google Calendar",
        status: "warn",
        detail:
          "Calendar is disabled. Seeded fallback scenarios work, but the final video should disclose that live Calendar matching is unavailable.",
      });
    }
  } catch (error) {
    checks.push(failedCheck("PostgreSQL validation", error));
  } finally {
    await pool.end();
  }

  checks.push(
    ...(await checkSlack(
      environment.SLACK_BOT_TOKEN,
      demo.workspaceId,
      demo.userId,
    )),
  );

  const baseUrl = normalizeBaseUrl(
    process.env.PREFLIGHT_BASE_URL ??
      `http://127.0.0.1:${environment.HTTP_PORT}`,
  );
  checks.push(...(await checkLiveApplication(baseUrl, requireLive)));

  for (const check of checks) {
    console.log(formatCheckLine(check));
  }

  const summary = summarizeChecks(checks);
  console.log(
    `\nPreflight: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed.`,
  );
  if (!summary.ready) {
    process.exitCode = 1;
    return;
  }

  console.log(
    requireLive
      ? "Submission environment is ready for a final Slack rehearsal."
      : "Static preflight passed. Run npm run preflight:live while Margin is running before recording.",
  );
}

async function loadSeedSnapshot(
  pool: Pool,
  workspaceId: string,
  userId: string,
): Promise<DemoSeedSnapshot> {
  const result = await pool.query<SeedSnapshotRow>(
    `SELECT
       (
         SELECT COUNT(*)
         FROM notes
         WHERE workspace_id = $1
           AND user_id = $2
           AND source_message_ts LIKE 'margin-demo-%'
       )::text AS note_count,
       (
         SELECT COUNT(*)
         FROM meetings
         WHERE workspace_id = $1
           AND user_id = $2
           AND provider_event_id LIKE 'margin-demo-%'
       )::text AS meeting_count,
       (
         SELECT COUNT(*)
         FROM note_context_candidates c
         JOIN notes n
           ON n.id = c.note_id
          AND n.workspace_id = c.workspace_id
          AND n.user_id = c.user_id
         WHERE n.workspace_id = $1
           AND n.user_id = $2
           AND n.source_message_ts = 'margin-demo-ambiguous-context'
       )::text AS ambiguous_candidate_count,
       (
         SELECT d.status
         FROM post_meeting_digests d
         JOIN meetings m
           ON m.id = d.meeting_id
          AND m.workspace_id = d.workspace_id
          AND m.user_id = d.user_id
         WHERE d.workspace_id = $1
           AND d.user_id = $2
           AND m.provider_event_id = 'margin-demo-completed-launch-review'
         ORDER BY d.created_at DESC
         LIMIT 1
       ) AS digest_status,
       (
         SELECT d.slack_channel_id
         FROM post_meeting_digests d
         JOIN meetings m
           ON m.id = d.meeting_id
          AND m.workspace_id = d.workspace_id
          AND m.user_id = d.user_id
         WHERE d.workspace_id = $1
           AND d.user_id = $2
           AND m.provider_event_id = 'margin-demo-completed-launch-review'
         ORDER BY d.created_at DESC
         LIMIT 1
       ) AS digest_channel_id,
       (
         SELECT r.status
         FROM pre_meeting_resurfacings r
         JOIN meetings m
           ON m.id = r.upcoming_meeting_id
          AND m.workspace_id = r.workspace_id
          AND m.user_id = r.user_id
         WHERE r.workspace_id = $1
           AND r.user_id = $2
           AND m.provider_event_id = 'margin-demo-planning-upcoming'
         ORDER BY r.created_at DESC
         LIMIT 1
       ) AS resurfacing_status,
       (
         SELECT r.slack_channel_id
         FROM pre_meeting_resurfacings r
         JOIN meetings m
           ON m.id = r.upcoming_meeting_id
          AND m.workspace_id = r.workspace_id
          AND m.user_id = r.user_id
         WHERE r.workspace_id = $1
           AND r.user_id = $2
           AND m.provider_event_id = 'margin-demo-planning-upcoming'
         ORDER BY r.created_at DESC
         LIMIT 1
       ) AS resurfacing_channel_id`,
    [workspaceId, userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("demo_seed_snapshot_unavailable");
  }

  return {
    noteCount: Number(row.note_count),
    meetingCount: Number(row.meeting_count),
    ambiguousCandidateCount: Number(row.ambiguous_candidate_count),
    digestStatus: row.digest_status,
    digestChannelId: row.digest_channel_id,
    resurfacingStatus: row.resurfacing_status,
    resurfacingChannelId: row.resurfacing_channel_id,
  };
}

async function checkGoogleConnection(
  pool: Pool,
  workspaceId: string,
  userId: string,
): Promise<PreflightCheck> {
  const result = await pool.query<OAuthScopeRow>(
    `SELECT scopes
     FROM oauth_connections
     WHERE workspace_id = $1
       AND user_id = $2
       AND provider = 'google_calendar'
     LIMIT 1`,
    [workspaceId, userId],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      name: "Google Calendar",
      status: "fail",
      detail:
        "Calendar is enabled but the demo user has no stored connection. Connect it from App Home.",
    };
  }
  if (!row.scopes.includes(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE)) {
    return {
      name: "Google Calendar",
      status: "fail",
      detail: "The stored connection is missing calendar.events.readonly.",
    };
  }
  return {
    name: "Google Calendar",
    status: "pass",
    detail: "Demo user has a least-privilege read-only Calendar connection.",
  };
}

async function checkSlack(
  botToken: string,
  workspaceId: string,
  userId: string,
): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  const client = new WebClient(botToken);

  try {
    const authentication = await client.auth.test();
    if (authentication.team_id !== workspaceId) {
      checks.push({
        name: "Slack workspace",
        status: "fail",
        detail: `Bot token belongs to ${authentication.team_id ?? "an unknown workspace"}, not ${workspaceId}.`,
      });
    } else {
      checks.push({
        name: "Slack workspace",
        status: "pass",
        detail: `Bot authenticated to ${workspaceId}.`,
      });
    }

    if (authentication.user_id === userId) {
      checks.push({
        name: "Slack demo user",
        status: "fail",
        detail: "DEMO_USER_ID points to the bot instead of a human sandbox user.",
      });
    } else {
      const userResult = await client.users.info({ user: userId });
      const user = userResult.user;
      checks.push(
        user && !user.deleted && !user.is_bot
          ? {
              name: "Slack demo user",
              status: "pass",
              detail: `User ${userId} exists and is active in the authenticated workspace.`,
            }
          : {
              name: "Slack demo user",
              status: "fail",
              detail: `User ${userId} is missing, deleted, or a bot.`,
            },
      );
    }
  } catch (error) {
    checks.push(failedCheck("Slack authentication", error));
  }

  return checks;
}

async function checkLiveApplication(
  baseUrl: string,
  required: boolean,
): Promise<PreflightCheck[]> {
  try {
    const health = await fetchWithTimeout(`${baseUrl}/healthz`);
    const readiness = await fetchWithTimeout(`${baseUrl}/readyz`);
    const readinessBody = (await readiness.json()) as ReadinessResponse;

    return [
      health.ok
        ? {
            name: "Live health endpoint",
            status: "pass",
            detail: `${baseUrl}/healthz returned ${health.status}.`,
          }
        : {
            name: "Live health endpoint",
            status: "fail",
            detail: `${baseUrl}/healthz returned ${health.status}.`,
          },
      readiness.ok && readinessBody.ready === true
        ? {
            name: "Live readiness endpoint",
            status: "pass",
            detail: "Database, migrations, Slack, and required workers report ready.",
          }
        : {
            name: "Live readiness endpoint",
            status: "fail",
            detail: `${baseUrl}/readyz returned ${readiness.status}; checks=${JSON.stringify(readinessBody.checks ?? null)}.`,
          },
    ];
  } catch (error) {
    const descriptor = describeError(error);
    return [
      {
        name: "Live application",
        status: required ? "fail" : "warn",
        detail: `Could not reach ${baseUrl}; ${descriptor.category}/${descriptor.code ?? descriptor.name}.`,
      },
    ];
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  timeout.unref();
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function identifierCheck(
  name: string,
  value: string,
  requiredPrefix: string,
): PreflightCheck {
  return value.startsWith(requiredPrefix)
    ? {
        name,
        status: "pass",
        detail: `${value} has the expected ${requiredPrefix} prefix.`,
      }
    : {
        name,
        status: "fail",
        detail: `${value} must begin with ${requiredPrefix}.`,
      };
}

function failedCheck(name: string, error: unknown): PreflightCheck {
  const descriptor = describeError(error);
  return {
    name,
    status: "fail",
    detail: `${descriptor.category}/${descriptor.code ?? descriptor.name}; fingerprint=${descriptor.fingerprint ?? "none"}.`,
  };
}

main().catch((error: unknown) => {
  console.error("Submission preflight failed to start", describeError(error));
  process.exitCode = 1;
});
