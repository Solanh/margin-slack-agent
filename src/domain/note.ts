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

export const ContextConfidenceSchema = z.enum([
  "exact",
  "high",
  "medium",
  "low",
  "unresolved",
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

export interface RawNote {
  id: string;
  workspaceId: string;
  userId: string;
  sourceChannelId: string;
  sourceMessageTs: string;
  rawText: string;
  createdAt: Date;
}

export interface MeetingContext {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  source: "google_calendar" | "slack_huddle" | "explicit";
  confidence: z.infer<typeof ContextConfidenceSchema>;
}

export interface Note extends RawNote {
  organizedText: string | null;
  noteType: z.infer<typeof NoteTypeSchema> | null;
  priority: z.infer<typeof PrioritySchema>;
  meetingContext: MeetingContext | null;
  transformationVersion: string | null;
}
