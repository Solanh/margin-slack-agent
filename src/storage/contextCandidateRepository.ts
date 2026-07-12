import type {
  ContextCandidate,
  ContextResolutionStatus,
  ContextSource,
  Note,
  OwnerScope,
} from "../domain/note.js";

export interface ScoredContextCandidateInput {
  id: string;
  meetingId: string | null;
  source: ContextSource;
  score: number;
  confidence: ContextCandidate["confidence"];
  signals: Record<string, unknown>;
}

export interface PersistContextResolutionInput extends OwnerScope {
  noteId: string;
  candidates: ScoredContextCandidateInput[];
  resolutionStatus: ContextResolutionStatus;
  selectedCandidateId: string | null;
}

export interface ContextCandidateRepository {
  persistResolution(input: PersistContextResolutionInput): Promise<Note>;

  listForNote(
    owner: OwnerScope,
    noteId: string,
  ): Promise<ContextCandidate[]>;

  selectCandidate(
    owner: OwnerScope,
    noteId: string,
    candidateId: string,
  ): Promise<Note>;

  selectExplicitMeeting(
    owner: OwnerScope,
    noteId: string,
    meetingId: string | null,
  ): Promise<Note>;
}
