import type { OwnerScope } from "../domain/note.js";

export interface UserDataSettings {
  digestsEnabled: boolean;
  resurfacingEnabled: boolean;
  retentionDays: number | null;
}

export interface UserDataExport {
  schemaVersion: 1;
  exportedAt: string;
  owner: OwnerScope;
  settings: UserDataSettings;
  notes: unknown[];
  noteRevisions: unknown[];
  meetings: unknown[];
  reminders: unknown[];
  contextCandidates: unknown[];
  postMeetingDigests: unknown[];
  preMeetingResurfacings: unknown[];
  meetingSeriesPreferences: unknown[];
  integrations: unknown[];
  slackContextSignals: {
    huddles: unknown[];
    activeContexts: unknown[];
  };
}

export interface DeleteAllDataResult {
  deletedRows: number;
}

export interface RetentionCleanupJob extends OwnerScope {
  retentionDays: number;
  attempts: number;
}

export interface RetentionCleanupResult {
  deletedNotes: number;
  deletedMeetings: number;
}

export interface UserDataRepository {
  getSettings(owner: OwnerScope): Promise<UserDataSettings>;
  setNotificationsEnabled(owner: OwnerScope, enabled: boolean): Promise<void>;
  setRetentionDays(owner: OwnerScope, days: number | null): Promise<void>;
  exportData(owner: OwnerScope, now?: Date): Promise<UserDataExport>;
  deleteAllData(owner: OwnerScope): Promise<DeleteAllDataResult>;

  claimRetentionJobs(now: Date, limit: number): Promise<RetentionCleanupJob[]>;
  applyRetention(
    job: RetentionCleanupJob,
    now: Date,
  ): Promise<RetentionCleanupResult>;
  markRetentionFailed(
    owner: OwnerScope,
    errorCode: string,
    retryAt: Date,
  ): Promise<void>;
}
