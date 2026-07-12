import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  ContextConfidenceSchema,
  ContextSourceSchema,
  type ContextCandidate,
  type Note,
  type OwnerScope,
} from "../domain/note.js";
import type {
  ContextCandidateRepository,
  PersistContextResolutionInput,
  ScoredContextCandidateInput,
} from "./contextCandidateRepository.js";
import type { NoteRepository } from "./noteRepository.js";

interface CandidateRow extends QueryResultRow {
  id: string;
  note_id: string;
  workspace_id: string;
  user_id: string;
  meeting_id: string | null;
  source: string;
  score: number;
  confidence: string;
  signals: unknown;
  selected: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CandidateSelectionRow extends QueryResultRow {
  id: string;
  meeting_id: string | null;
  source: string;
}

const LOCK_NOTE_SQL = `
  SELECT id
  FROM notes
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  FOR UPDATE
`;

const DELETE_CANDIDATES_SQL = `
  DELETE FROM note_context_candidates
  WHERE note_id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const INSERT_CANDIDATE_SQL = `
  INSERT INTO note_context_candidates (
    id,
    note_id,
    workspace_id,
    user_id,
    meeting_id,
    source,
    score,
    confidence,
    signals,
    selected
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`;

const UPDATE_NOTE_RESOLUTION_SQL = `
  UPDATE notes
  SET meeting_id = $4,
      context_source = $5,
      context_confidence = $6,
      context_resolution_status = $7
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
`;

const LIST_CANDIDATES_SQL = `
  SELECT *
  FROM note_context_candidates
  WHERE note_id = $1
    AND workspace_id = $2
    AND user_id = $3
  ORDER BY score DESC, created_at ASC
`;

const SELECT_CANDIDATE_FOR_UPDATE_SQL = `
  SELECT id, meeting_id, source
  FROM note_context_candidates
  WHERE id = $1
    AND note_id = $2
    AND workspace_id = $3
    AND user_id = $4
  FOR UPDATE
`;

const CLEAR_SELECTED_SQL = `
  UPDATE note_context_candidates
  SET selected = FALSE
  WHERE note_id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND selected = TRUE
`;

const MARK_SELECTED_SQL = `
  UPDATE note_context_candidates
  SET selected = TRUE
  WHERE id = $1
    AND note_id = $2
    AND workspace_id = $3
    AND user_id = $4
`;

const VERIFY_MEETING_SQL = `
  SELECT id
  FROM meetings
  WHERE id = $1
    AND workspace_id = $2
    AND user_id = $3
  LIMIT 1
`;

const DELETE_EXPLICIT_CANDIDATES_SQL = `
  DELETE FROM note_context_candidates
  WHERE note_id = $1
    AND workspace_id = $2
    AND user_id = $3
    AND source = 'explicit'
`;

export class PostgresContextCandidateRepository
  implements ContextCandidateRepository
{
  constructor(
    private readonly pool: Pool,
    private readonly notes: NoteRepository,
  ) {}

  async persistResolution(
    input: PersistContextResolutionInput,
  ): Promise<Note> {
    this.validateResolution(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.requireLockedNote(client, input);
      await client.query(DELETE_CANDIDATES_SQL, [
        input.noteId,
        input.workspaceId,
        input.userId,
      ]);

      for (const candidate of input.candidates) {
        await this.insertCandidate(
          client,
          input,
          candidate,
          candidate.id === input.selectedCandidateId,
        );
      }

      const selected = input.selectedCandidateId
        ? input.candidates.find(
            (candidate) => candidate.id === input.selectedCandidateId,
          ) ?? null
        : null;
      const noteState = this.noteState(input.resolutionStatus, selected);

      await client.query(UPDATE_NOTE_RESOLUTION_SQL, [
        input.noteId,
        input.workspaceId,
        input.userId,
        noteState.meetingId,
        noteState.source,
        noteState.confidence,
        input.resolutionStatus,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.requireNote(input, input.noteId);
  }

  async listForNote(
    owner: OwnerScope,
    noteId: string,
  ): Promise<ContextCandidate[]> {
    const result = await this.pool.query<CandidateRow>(LIST_CANDIDATES_SQL, [
      noteId,
      owner.workspaceId,
      owner.userId,
    ]);
    return result.rows.map((row) => this.mapCandidate(row));
  }

  async selectCandidate(
    owner: OwnerScope,
    noteId: string,
    candidateId: string,
  ): Promise<Note> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.requireLockedNote(client, { ...owner, noteId });
      const result = await client.query<CandidateSelectionRow>(
        SELECT_CANDIDATE_FOR_UPDATE_SQL,
        [candidateId, noteId, owner.workspaceId, owner.userId],
      );
      const candidate = result.rows[0];
      if (!candidate) {
        throw new Error("Owner-scoped context candidate was not found");
      }

      await client.query(CLEAR_SELECTED_SQL, [
        noteId,
        owner.workspaceId,
        owner.userId,
      ]);
      await client.query(MARK_SELECTED_SQL, [
        candidateId,
        noteId,
        owner.workspaceId,
        owner.userId,
      ]);

      const standalone = candidate.source === "standalone";
      await client.query(UPDATE_NOTE_RESOLUTION_SQL, [
        noteId,
        owner.workspaceId,
        owner.userId,
        standalone ? null : candidate.meeting_id,
        standalone ? "standalone" : "explicit",
        standalone ? "unresolved" : "exact",
        standalone ? "standalone" : "attached",
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.requireNote(owner, noteId);
  }

  async selectExplicitMeeting(
    owner: OwnerScope,
    noteId: string,
    meetingId: string | null,
  ): Promise<Note> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.requireLockedNote(client, { ...owner, noteId });

      if (meetingId) {
        const meeting = await client.query(VERIFY_MEETING_SQL, [
          meetingId,
          owner.workspaceId,
          owner.userId,
        ]);
        if (meeting.rowCount !== 1) {
          throw new Error("Owner-scoped meeting was not found");
        }
      }

      await client.query(CLEAR_SELECTED_SQL, [
        noteId,
        owner.workspaceId,
        owner.userId,
      ]);
      await client.query(DELETE_EXPLICIT_CANDIDATES_SQL, [
        noteId,
        owner.workspaceId,
        owner.userId,
      ]);

      const id = randomUUID();
      const candidate: ScoredContextCandidateInput = meetingId
        ? {
            id,
            meetingId,
            source: "explicit",
            score: 100,
            confidence: "exact",
            signals: { userSelected: true },
          }
        : {
            id,
            meetingId: null,
            source: "standalone",
            score: 0,
            confidence: "unresolved",
            signals: { userSelectedNoMeeting: true },
          };

      if (!meetingId) {
        await client.query(
          `
            DELETE FROM note_context_candidates
            WHERE note_id = $1
              AND workspace_id = $2
              AND user_id = $3
              AND source = 'standalone'
          `,
          [noteId, owner.workspaceId, owner.userId],
        );
      }

      await this.insertCandidate(
        client,
        { ...owner, noteId, candidates: [], resolutionStatus: "attached", selectedCandidateId: id },
        candidate,
        true,
      );

      await client.query(UPDATE_NOTE_RESOLUTION_SQL, [
        noteId,
        owner.workspaceId,
        owner.userId,
        meetingId,
        meetingId ? "explicit" : "standalone",
        meetingId ? "exact" : "unresolved",
        meetingId ? "attached" : "standalone",
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.requireNote(owner, noteId);
  }

  private async requireLockedNote(
    client: PoolClient,
    owner: OwnerScope & { noteId: string },
  ): Promise<void> {
    const result = await client.query(LOCK_NOTE_SQL, [
      owner.noteId,
      owner.workspaceId,
      owner.userId,
    ]);
    if (result.rowCount !== 1) {
      throw new Error("Owner-scoped note was not found for context resolution");
    }
  }

  private async insertCandidate(
    client: PoolClient,
    owner: OwnerScope & { noteId: string },
    candidate: ScoredContextCandidateInput,
    selected: boolean,
  ): Promise<void> {
    await client.query(INSERT_CANDIDATE_SQL, [
      candidate.id,
      owner.noteId,
      owner.workspaceId,
      owner.userId,
      candidate.meetingId,
      candidate.source,
      candidate.score,
      candidate.confidence,
      JSON.stringify(candidate.signals),
      selected,
    ]);
  }

  private validateResolution(input: PersistContextResolutionInput): void {
    if (input.candidates.length === 0) {
      throw new Error("Context resolution must include a standalone candidate");
    }
    const standalone = input.candidates.filter(
      (candidate) => candidate.source === "standalone",
    );
    if (standalone.length !== 1 || standalone[0]?.meetingId !== null) {
      throw new Error("Context resolution requires exactly one standalone candidate");
    }

    const selected = input.selectedCandidateId
      ? input.candidates.find(
          (candidate) => candidate.id === input.selectedCandidateId,
        )
      : undefined;
    if (input.selectedCandidateId && !selected) {
      throw new Error("Selected context candidate is not in the candidate set");
    }
    if (input.resolutionStatus === "attached") {
      if (!selected || selected.source === "standalone" || !selected.meetingId) {
        throw new Error("Attached context requires a selected meeting candidate");
      }
    } else if (input.resolutionStatus === "standalone") {
      if (!selected || selected.source !== "standalone") {
        throw new Error("Standalone resolution requires the standalone candidate");
      }
    } else if (selected) {
      throw new Error("Pending or ambiguous resolution cannot select a candidate");
    }
  }

  private noteState(
    status: PersistContextResolutionInput["resolutionStatus"],
    selected: ScoredContextCandidateInput | null,
  ): {
    meetingId: string | null;
    source: "google_calendar" | "slack_huddle" | "explicit" | "standalone";
    confidence: "exact" | "high" | "medium" | "low" | "unresolved";
  } {
    if (status === "attached" && selected) {
      return {
        meetingId: selected.meetingId,
        source: selected.source,
        confidence: selected.confidence,
      };
    }
    return {
      meetingId: null,
      source: "standalone",
      confidence: "unresolved",
    };
  }

  private async requireNote(owner: OwnerScope, noteId: string): Promise<Note> {
    const note = await this.notes.getById(owner, noteId);
    if (!note) {
      throw new Error("Resolved note could not be reloaded");
    }
    return note;
  }

  private mapCandidate(row: CandidateRow): ContextCandidate {
    return {
      id: row.id,
      noteId: row.note_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      meetingId: row.meeting_id,
      source: ContextSourceSchema.parse(row.source),
      score: row.score,
      confidence: ContextConfidenceSchema.parse(row.confidence),
      signals: this.object(row.signals),
      selected: row.selected,
      createdAt: this.toDate(row.created_at),
      updatedAt: this.toDate(row.updated_at),
    };
  }

  private object(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Expected context candidate signals to be an object");
    }
    return value as Record<string, unknown>;
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
