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

export interface ReminderRepository {
  create(input: CreateReminderInput): Promise<Reminder>;
  getById(owner: OwnerScope, id: string): Promise<Reminder | null>;
  cancel(owner: OwnerScope, id: string): Promise<Reminder | null>;
}
