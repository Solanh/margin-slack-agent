import { z } from "zod";

export const NoteTypeSchema = z.enum([
  "decision",
  "action",
  "question",
  "idea",
  "reference",
]);

export const PrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "critical",
]);

export const NoteStatusSchema = z.enum(["open", "resolved", "archived"]);

export const ContextConfidenceSchema = z.enum([
  "exact",
  "high",
  "medium",
  "low",
  "unresolved",
]);

export const RevisionSourceSchema = z.enum(["user", "ai", "system"]);
export const ReminderTypeSchema = z.enum(["fixed", "event_relative"]);
export const ReminderStatusSchema = z.enum([
  "pending",
  "sent",
  "snoozed",
  "cancelled",
]);

export const TransformationSchema = z.object({
  organizedText: z.string().min(1),
  noteType: NoteTypeSchema,
  priority: PrioritySchema,
  reminderIntent: z.string().nullable(),
  explicitDueAt: z.string().datetime().nullable(),
  inferredFields: z.array(z.string()),
  uncertainties: z.array(z.string()),
});

export type Transformation = z.infer<typeof TransformationSchema>;

export interface OwnerScope {
  workspaceId: string;
  userId: string;
}

export interface RawNote extends OwnerScope {
  id: string;
  sourceChannelId: string;
  sourceMessageTs: string;
  rawText: string;
  createdAt: Date;
}

export interface MeetingContext extends OwnerScope {
  id: string;
  provider: "google_calendar" | "slack_huddle" | "explicit";
  providerEventId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  participants: string[];
  confidence: z.infer<typeof ContextConfidenceSchema>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note extends RawNote {
  organizedText: string | null;
  noteType: z.infer<typeof NoteTypeSchema> | null;
  priority: z.infer<typeof PrioritySchema>;
  status: z.infer<typeof NoteStatusSchema>;
  meetingId: string | null;
  contextConfidence: z.infer<typeof ContextConfidenceSchema>;
  transformationVersion: string | null;
  updatedAt: Date;
}

export interface NoteRevision extends OwnerScope {
  id: string;
  noteId: string;
  revisionSource: z.infer<typeof RevisionSourceSchema>;
  organizedText: string | null;
  noteType: z.infer<typeof NoteTypeSchema> | null;
  priority: z.infer<typeof PrioritySchema> | null;
  status: z.infer<typeof NoteStatusSchema> | null;
  transformationVersion: string | null;
  inferredFields: string[];
  uncertainties: string[];
  createdAt: Date;
}

export interface Reminder extends OwnerScope {
  id: string;
  noteId: string;
  reminderType: z.infer<typeof ReminderTypeSchema>;
  scheduledFor: Date | null;
  relativeRule: Record<string, unknown> | null;
  status: z.infer<typeof ReminderStatusSchema>;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
