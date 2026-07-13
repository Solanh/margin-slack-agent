import type { Note } from "./note.js";

export type RetrievalStatusFilter =
  | "any"
  | "unresolved"
  | "open"
  | "resolved"
  | "archived";

export interface NoteRetrievalRequest {
  originalText: string;
  searchText: string | null;
  noteTypes: Array<Exclude<Note["noteType"], null>>;
  priorities: Note["priority"][];
  status: RetrievalStatusFilter;
  limit: number;
}

export interface RetrievedNote {
  id: string;
  organizedText: string | null;
  noteType: Note["noteType"];
  priority: Note["priority"];
  status: Note["status"];
  contextResolutionStatus: Note["contextResolutionStatus"];
  reminderIntent: string | null;
  explicitDueAt: Date | null;
  uncertainties: string[];
  meetingTitle: string | null;
  meetingStartsAt: Date | null;
  createdAt: Date;
  relevance: number;
}

export interface RetrievedOriginalNote {
  id: string;
  rawText: string;
  organizedText: string | null;
  meetingTitle: string | null;
  meetingStartsAt: Date | null;
  createdAt: Date;
}

export interface NoteRetrievalResponse {
  request: NoteRetrievalRequest;
  notes: RetrievedNote[];
}

export interface DashboardUpcomingItem {
  id: string;
  kind: "reminder" | "resurfacing";
  noteId: string | null;
  text: string;
  scheduledFor: Date;
  meetingTitle: string | null;
}

export interface HomeDashboardData {
  recentNotes: RetrievedNote[];
  openActions: RetrievedNote[];
  unresolvedQuestions: RetrievedNote[];
  upcoming: DashboardUpcomingItem[];
}
