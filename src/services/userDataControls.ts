import type { OwnerScope } from "../domain/note.js";
import { describeError } from "../observability/safeLogger.js";
import type { UserDataRepository } from "../storage/userDataRepository.js";
import type { GoogleCalendarConnectionService } from "./googleCalendarOAuth.js";

const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_BATCH_SIZE = 20;

export class UserDataControlService {
  constructor(
    private readonly repository: UserDataRepository,
    private readonly calendarConnections: GoogleCalendarConnectionService,
  ) {}

  getSettings(owner: OwnerScope) {
    return this.repository.getSettings(owner);
  }

  async exportJson(owner: OwnerScope, now = new Date()): Promise<string> {
    const data = await this.repository.exportData(owner, now);
    return JSON.stringify(data, null, 2);
  }

  setNotificationsEnabled(owner: OwnerScope, enabled: boolean) {
    return this.repository.setNotificationsEnabled(owner, enabled);
  }

  setRetentionDays(owner: OwnerScope, days: number | null) {
    return this.repository.setRetentionDays(owner, days);
  }

  async deleteAllData(owner: OwnerScope) {
    // Remote revocation is best effort; disconnect always removes local
    // credentials before the remaining owner data is deleted transactionally.
    await this.calendarConnections.disconnect(owner);
    return this.repository.deleteAllData(owner);
  }
}

export class RetentionCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly repository: UserDataRepository,
    private readonly intervalMs = RETENTION_INTERVAL_MS,
    private readonly batchSize = RETENTION_BATCH_SIZE,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.runOnce().catch((error: unknown) => {
      console.error("Retention cleanup sweep failed", describeError(error));
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        console.error("Retention cleanup sweep failed", describeError(error));
      });
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(now = new Date()): Promise<{
    claimed: number;
    completed: number;
    failed: number;
    deletedNotes: number;
    deletedMeetings: number;
  }> {
    if (this.running) {
      return {
        claimed: 0,
        completed: 0,
        failed: 0,
        deletedNotes: 0,
        deletedMeetings: 0,
      };
    }

    this.running = true;
    try {
      const jobs = await this.repository.claimRetentionJobs(now, this.batchSize);
      let completed = 0;
      let failed = 0;
      let deletedNotes = 0;
      let deletedMeetings = 0;

      for (const job of jobs) {
        try {
          const result = await this.repository.applyRetention(job, now);
          completed += 1;
          deletedNotes += result.deletedNotes;
          deletedMeetings += result.deletedMeetings;
        } catch (error) {
          failed += 1;
          const descriptor = describeError(error);
          const exponent = Math.max(0, Math.min(6, job.attempts - 1));
          await this.repository.markRetentionFailed(
            job,
            descriptor.code ?? `${descriptor.category}_${descriptor.name}`,
            new Date(
              now.getTime() +
                Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** exponent),
            ),
          );
        }
      }

      return {
        claimed: jobs.length,
        completed,
        failed,
        deletedNotes,
        deletedMeetings,
      };
    } finally {
      this.running = false;
    }
  }
}
