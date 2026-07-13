import type { OwnerScope, Reminder } from "../domain/note.js";

interface BaseCreateReminderInput extends OwnerScope {
  noteId: string;
}

export interface CreateFixedReminderInput extends BaseCreateReminderInput {
  reminderType: "fixed";
  scheduledFor: Date;
}

export interface CreateEventRelativeReminderInput
  extends BaseCreateReminderInput {
  reminderType: "event_relative";
  relativeRule: Record<string, unknown>;
}

export type CreateReminderInput =
  | CreateFixedReminderInput
  | CreateEventRelativeReminderInput;

export interface ReminderSlackMessageReference {
  channelId: string;
  messageTs: string;
}

export interface DueReminder extends OwnerScope {
  id: string;
  noteId: string;
  scheduledFor: Date;
  rawText: string;
  organizedText: string | null;
  attempts: number;
}

export interface ReminderRepository {
  create(input: CreateReminderInput): Promise<Reminder>;
  getById(owner: OwnerScope, id: string): Promise<Reminder | null>;
  cancel(owner: OwnerScope, id: string): Promise<Reminder | null>;
}

export interface ReminderDeliveryRepository extends ReminderRepository {
  claimDue(now: Date, limit: number): Promise<DueReminder[]>;
  markDelivered(
    owner: OwnerScope,
    id: string,
    reference: ReminderSlackMessageReference,
    deliveredAt: Date,
  ): Promise<void>;
  markFailed(
    owner: OwnerScope,
    id: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void>;
}
