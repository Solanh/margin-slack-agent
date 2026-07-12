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

export const InferredFieldSchema = z.enum([
  "organizedText",
  "noteType",
  "priority",
  "reminderIntent",
  "explicitDueAt",
]);

export const TransformationSchema = z.object({
  organizedText: z
    .string()
    .min(1)
    .describe(
      "A conservative, concise restatement that preserves every explicit fact and never adds attribution, ownership, dates, or commitments.",
    ),
  noteType: NoteTypeSchema.describe(
    "The single best structural category for the user's note.",
  ),
  priority: PrioritySchema.describe(
    "Priority based only on explicit urgency signals. Use normal when urgency is not explicit.",
  ),
  reminderIntent: z
    .string()
    .nullable()
    .describe(
      "The reminder request expressed by the user, normalized conservatively, or null when no reminder was requested.",
    ),
  explicitDueAt: z
    .string()
    .datetime()
    .nullable()
    .describe(
      "An ISO 8601 timestamp only when the user supplied enough information to resolve an exact time; otherwise null.",
    ),
  inferredFields: z
    .array(InferredFieldSchema)
    .describe(
      "Fields that contain model interpretation rather than directly verified data.",
    ),
  uncertainties: z
    .array(z.string().min(1))
    .describe(
      "Concise unresolved ambiguities. Use an empty array only when no material ambiguity remains.",
    ),
});

export type Transformation = z.infer<typeof TransformationSchema>;
export type InferredField = z.infer<typeof InferredFieldSchema>;

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
  reminderIntent: string | null;
  explicitDueAt: Date | null;
  inferredFields: InferredField[];
  uncertainties: string[];
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
  reminderIntent: string | null;
  explicitDueAt: Date | null;
  transformationVersion: string | null;
  inferredFields: InferredField[];
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
