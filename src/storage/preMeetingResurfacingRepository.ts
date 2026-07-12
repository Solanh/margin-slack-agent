import type { Note, OwnerScope } from "../domain/note.js";
import type { SlackMessageReference } from "./postMeetingDigestRepository.js";

export type PreMeetingResurfacingStatus =
  | "pending"
  | "processing"
  | "sent"
  | "snoozed"
  | "skipped";

export interface PreMeetingResurfacing extends OwnerScope {
  id: string;
  upcomingMeetingId: string;
  upcomingMeetingTitle: string;
  upcomingStartsAt: Date;
  seriesKey: string;
  status: PreMeetingResurfacingStatus;
  scheduledFor: Date;
  deliveredAt: Date | null;
  snoozedUntil: Date | null;
  slackChannelId: string | null;
  slackMessageTs: string | null;
  attempts: number;
}

export interface ResurfacingNoteItem {
  id: string;
  priorMeetingId: string;
  priorMeetingTitle: string;
  priorMeetingStartsAt: Date;
  noteType: "action" | "question";
  status: Note["status"];
  priority: Note["priority"];
  text: string;
  rawText: string;
  reminderIntent: string | null;
}

export interface PreMeetingResurfacingContent {
  resurfacing: PreMeetingResurfacing;
  notes: ResurfacingNoteItem[];
}

export interface PrepareUpcomingInput extends OwnerScope {
  upcomingMeetingId: string;
  seriesKey: string;
  scheduledFor: Date;
}

export interface PreMeetingResurfacingRepository {
  listEligibleOwners(limit?: number): Promise<OwnerScope[]>;
  prepareForUpcoming(input: PrepareUpcomingInput): Promise<boolean>;
  claimDue(now?: Date, limit?: number): Promise<PreMeetingResurfacing[]>;
  getContent(
    owner: OwnerScope,
    resurfacingId: string,
  ): Promise<PreMeetingResurfacingContent | null>;
  markDelivered(
    owner: OwnerScope,
    resurfacingId: string,
    reference: SlackMessageReference,
    deliveredAt?: Date,
  ): Promise<void>;
  markFailed(
    owner: OwnerScope,
    resurfacingId: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void>;
  snooze(
    owner: OwnerScope,
    resurfacingId: string,
    until: Date,
  ): Promise<PreMeetingResurfacing>;
  markIncludedNotesResolved(
    owner: OwnerScope,
    resurfacingId: string,
  ): Promise<number>;
  setResurfacingEnabled(owner: OwnerScope, enabled: boolean): Promise<void>;
  setSeriesEnabled(
    owner: OwnerScope,
    seriesKey: string,
    enabled: boolean,
  ): Promise<void>;
}
