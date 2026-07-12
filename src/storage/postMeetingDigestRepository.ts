import type { Note, OwnerScope } from "../domain/note.js";

export type PostMeetingDigestStatus =
  | "pending"
  | "processing"
  | "sent"
  | "snoozed"
  | "skipped";

export interface PostMeetingDigest extends OwnerScope {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartsAt: Date;
  meetingEndsAt: Date;
  status: PostMeetingDigestStatus;
  scheduledFor: Date;
  deliveredAt: Date | null;
  snoozedUntil: Date | null;
  slackChannelId: string | null;
  slackMessageTs: string | null;
  attempts: number;
}

export interface DigestNoteItem {
  id: string;
  noteType: NonNullable<Note["noteType"]>;
  priority: Note["priority"];
  status: Note["status"];
  text: string;
  rawText: string;
  reminderIntent: string | null;
  explicitDueAt: Date | null;
  createdAt: Date;
}

export interface PostMeetingDigestContent {
  digest: PostMeetingDigest;
  notes: DigestNoteItem[];
}

export interface SlackMessageReference {
  channelId: string;
  messageTs: string;
}

export interface PostMeetingDigestRepository {
  prepareDue(now?: Date, limit?: number): Promise<number>;
  claimDue(now?: Date, limit?: number): Promise<PostMeetingDigest[]>;
  getContent(owner: OwnerScope, digestId: string): Promise<PostMeetingDigestContent | null>;
  markDelivered(
    owner: OwnerScope,
    digestId: string,
    reference: SlackMessageReference,
    deliveredAt?: Date,
  ): Promise<void>;
  markFailed(
    owner: OwnerScope,
    digestId: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void>;
  snooze(owner: OwnerScope, digestId: string, until: Date): Promise<PostMeetingDigest>;
  setDigestsEnabled(owner: OwnerScope, enabled: boolean): Promise<void>;
  areDigestsEnabled(owner: OwnerScope): Promise<boolean>;
}
