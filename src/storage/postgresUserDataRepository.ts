import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { OwnerScope } from "../domain/note.js";
import type {
  DeleteAllDataResult,
  RetentionCleanupJob,
  RetentionCleanupResult,
  UserDataExport,
  UserDataRepository,
  UserDataSettings,
} from "./userDataRepository.js";

interface SettingsRow extends QueryResultRow {
  digests_enabled: boolean;
  resurfacing_enabled: boolean;
  retention_days: number | null;
}

interface RetentionJobRow extends QueryResultRow {
  workspace_id: string;
  user_id: string;
  retention_days: number;
  attempts: number;
}

const DEFAULT_SETTINGS: UserDataSettings = {
  digestsEnabled: true,
  resurfacingEnabled: true,
  retentionDays: null,
};

export class PostgresUserDataRepository implements UserDataRepository {
  constructor(private readonly pool: Pool) {}

  async getSettings(owner: OwnerScope): Promise<UserDataSettings> {
    const result = await this.pool.query<SettingsRow>(
      `
        SELECT digests_enabled, resurfacing_enabled, retention_days
        FROM user_notification_preferences
        WHERE workspace_id = $1 AND user_id = $2
      `,
      [owner.workspaceId, owner.userId],
    );
    const row = result.rows[0];
    return row
      ? {
          digestsEnabled: row.digests_enabled,
          resurfacingEnabled: row.resurfacing_enabled,
          retentionDays: row.retention_days,
        }
      : { ...DEFAULT_SETTINGS };
  }

  async setNotificationsEnabled(
    owner: OwnerScope,
    enabled: boolean,
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO user_notification_preferences (
          workspace_id,
          user_id,
          digests_enabled,
          resurfacing_enabled
        )
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (workspace_id, user_id)
        DO UPDATE SET
          digests_enabled = EXCLUDED.digests_enabled,
          resurfacing_enabled = EXCLUDED.resurfacing_enabled
      `,
      [owner.workspaceId, owner.userId, enabled],
    );
  }

  async setRetentionDays(
    owner: OwnerScope,
    days: number | null,
  ): Promise<void> {
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      throw new Error("Retention days must be an integer from 1 through 3650");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO user_notification_preferences (
            workspace_id,
            user_id,
            retention_days
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (workspace_id, user_id)
          DO UPDATE SET retention_days = EXCLUDED.retention_days
        `,
        [owner.workspaceId, owner.userId, days],
      );

      if (days === null) {
        await client.query(
          `DELETE FROM retention_cleanup_jobs
           WHERE workspace_id = $1 AND user_id = $2`,
          [owner.workspaceId, owner.userId],
        );
      } else {
        await client.query(
          `
            INSERT INTO retention_cleanup_jobs (
              workspace_id,
              user_id,
              status,
              next_run_at
            )
            VALUES ($1, $2, 'pending', NOW())
            ON CONFLICT (workspace_id, user_id)
            DO UPDATE SET
              status = 'pending',
              next_run_at = LEAST(retention_cleanup_jobs.next_run_at, NOW()),
              locked_at = NULL,
              last_error_code = NULL
          `,
          [owner.workspaceId, owner.userId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async exportData(owner: OwnerScope, now = new Date()): Promise<UserDataExport> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const settings = await client.query<SettingsRow>(
        `SELECT digests_enabled, resurfacing_enabled, retention_days
         FROM user_notification_preferences
         WHERE workspace_id = $1 AND user_id = $2`,
        [owner.workspaceId, owner.userId],
      );
      const notes = await this.ownerRows(client, "notes", owner, "created_at ASC");
      const revisions = await this.ownerRows(
        client,
        "note_revisions",
        owner,
        "created_at ASC",
      );
      const meetings = await this.ownerRows(
        client,
        "meetings",
        owner,
        "starts_at ASC",
      );
      const reminders = await this.ownerRows(
        client,
        "reminders",
        owner,
        "created_at ASC",
      );
      const candidates = await this.ownerRows(
        client,
        "note_context_candidates",
        owner,
        "created_at ASC",
      );
      const digests = await this.ownerRows(
        client,
        "post_meeting_digests",
        owner,
        "created_at ASC",
      );
      const resurfacings = await this.ownerRows(
        client,
        "pre_meeting_resurfacings",
        owner,
        "created_at ASC",
      );
      const seriesPreferences = await this.ownerRows(
        client,
        "meeting_series_preferences",
        owner,
        "created_at ASC",
      );
      const integrations = await client.query(
        `
          SELECT
            provider,
            scopes,
            expires_at,
            encryption_key_version,
            created_at,
            updated_at
          FROM oauth_connections
          WHERE workspace_id = $1 AND user_id = $2
          ORDER BY provider ASC
        `,
        [owner.workspaceId, owner.userId],
      );
      const huddles = await this.ownerRows(
        client,
        "slack_huddle_states",
        owner,
        "observed_at ASC",
      );
      const activeContexts = await this.ownerRows(
        client,
        "slack_active_contexts",
        owner,
        "observed_at ASC",
      );
      await client.query("COMMIT");

      const settingsRow = settings.rows[0];
      return {
        schemaVersion: 1,
        exportedAt: now.toISOString(),
        owner,
        settings: settingsRow
          ? {
              digestsEnabled: settingsRow.digests_enabled,
              resurfacingEnabled: settingsRow.resurfacing_enabled,
              retentionDays: settingsRow.retention_days,
            }
          : { ...DEFAULT_SETTINGS },
        notes: notes.rows,
        noteRevisions: revisions.rows,
        meetings: meetings.rows,
        reminders: reminders.rows,
        contextCandidates: candidates.rows,
        postMeetingDigests: digests.rows,
        preMeetingResurfacings: resurfacings.rows,
        meetingSeriesPreferences: seriesPreferences.rows,
        integrations: integrations.rows,
        slackContextSignals: {
          huddles: huddles.rows,
          activeContexts: activeContexts.rows,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAllData(owner: OwnerScope): Promise<DeleteAllDataResult> {
    const client = await this.pool.connect();
    let deletedRows = 0;
    try {
      await client.query("BEGIN");
      for (const table of [
        "oauth_authorization_states",
        "oauth_connections",
        "slack_huddle_states",
        "slack_active_contexts",
        "meeting_series_preferences",
        "notes",
        "meetings",
        "user_notification_preferences",
      ]) {
        const result = await client.query(
          `DELETE FROM ${table}
           WHERE workspace_id = $1 AND user_id = $2`,
          [owner.workspaceId, owner.userId],
        );
        deletedRows += result.rowCount ?? 0;
      }
      await client.query("COMMIT");
      return { deletedRows };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async claimRetentionJobs(
    now: Date,
    limit: number,
  ): Promise<RetentionCleanupJob[]> {
    const result = await this.pool.query<RetentionJobRow>(
      `
        WITH reset_stale AS (
          UPDATE retention_cleanup_jobs
          SET status = 'failed',
              locked_at = NULL,
              next_run_at = LEAST(next_run_at, $1::timestamptz),
              last_error_code = 'stale_retention_lock'
          WHERE status = 'processing'
            AND locked_at < $1::timestamptz - INTERVAL '15 minutes'
        ), due AS (
          SELECT j.workspace_id, j.user_id
          FROM retention_cleanup_jobs j
          JOIN user_notification_preferences p
            USING (workspace_id, user_id)
          WHERE j.status IN ('pending', 'failed')
            AND j.next_run_at <= $1::timestamptz
            AND p.retention_days IS NOT NULL
          ORDER BY j.next_run_at ASC
          FOR UPDATE OF j SKIP LOCKED
          LIMIT $2
        )
        UPDATE retention_cleanup_jobs j
        SET status = 'processing',
            locked_at = $1::timestamptz,
            attempts = j.attempts + 1,
            last_error_code = NULL
        FROM due
        JOIN user_notification_preferences p
          USING (workspace_id, user_id)
        WHERE j.workspace_id = due.workspace_id
          AND j.user_id = due.user_id
        RETURNING
          j.workspace_id,
          j.user_id,
          p.retention_days,
          j.attempts
      `,
      [now, limit],
    );

    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      retentionDays: row.retention_days,
      attempts: row.attempts,
    }));
  }

  async applyRetention(
    job: RetentionCleanupJob,
    now: Date,
  ): Promise<RetentionCleanupResult> {
    const client = await this.pool.connect();
    const cutoff = new Date(
      now.getTime() - job.retentionDays * 24 * 60 * 60 * 1000,
    );
    try {
      await client.query("BEGIN");
      const preference = await client.query<SettingsRow>(
        `SELECT digests_enabled, resurfacing_enabled, retention_days
         FROM user_notification_preferences
         WHERE workspace_id = $1 AND user_id = $2
         FOR UPDATE`,
        [job.workspaceId, job.userId],
      );
      if (preference.rows[0]?.retention_days !== job.retentionDays) {
        throw new Error("retention_preference_changed");
      }

      const notes = await client.query(
        `DELETE FROM notes
         WHERE workspace_id = $1
           AND user_id = $2
           AND created_at < $3`,
        [job.workspaceId, job.userId, cutoff],
      );
      const meetings = await client.query(
        `
          DELETE FROM meetings m
          WHERE m.workspace_id = $1
            AND m.user_id = $2
            AND m.ends_at < $3
            AND NOT EXISTS (
              SELECT 1
              FROM notes n
              WHERE n.workspace_id = m.workspace_id
                AND n.user_id = m.user_id
                AND n.meeting_id = m.id
            )
        `,
        [job.workspaceId, job.userId, cutoff],
      );
      await client.query(
        `
          UPDATE retention_cleanup_jobs
          SET status = 'pending',
              next_run_at = $3 + INTERVAL '24 hours',
              last_completed_at = $3,
              locked_at = NULL,
              attempts = 0,
              last_error_code = NULL
          WHERE workspace_id = $1 AND user_id = $2
        `,
        [job.workspaceId, job.userId, now],
      );
      await client.query("COMMIT");
      return {
        deletedNotes: notes.rowCount ?? 0,
        deletedMeetings: meetings.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markRetentionFailed(
    owner: OwnerScope,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE retention_cleanup_jobs
        SET status = 'failed',
            next_run_at = $3,
            locked_at = NULL,
            last_error_code = $4
        WHERE workspace_id = $1 AND user_id = $2
      `,
      [owner.workspaceId, owner.userId, retryAt, errorCode.slice(0, 120)],
    );
  }

  private ownerRows(
    client: PoolClient,
    table: string,
    owner: OwnerScope,
    orderBy: string,
  ): Promise<{ rows: QueryResultRow[] }> {
    return client.query(
      `SELECT * FROM ${table}
       WHERE workspace_id = $1 AND user_id = $2
       ORDER BY ${orderBy}`,
      [owner.workspaceId, owner.userId],
    );
  }
}
