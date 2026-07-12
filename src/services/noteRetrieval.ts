import type { OwnerScope } from "../domain/note.js";
import type {
  NoteRetrievalRequest,
  NoteRetrievalResponse,
  RetrievalStatusFilter,
} from "../domain/retrieval.js";
import type { NoteRetrievalRepository } from "../storage/noteRetrievalRepository.js";

const RETRIEVAL_PATTERNS = [
  /^(?:please\s+)?(?:find|search(?:\s+for)?|show(?:\s+me)?|list|pull\s+up|look\s+up)\s+(?:(?:my|all|any|open|unresolved|outstanding|pending|resolved|completed|done|closed|archived|low|normal|high|critical|priority)\s+)*(?:notes?|decisions?|actions?|tasks?|questions?|ideas?|references?)\b/iu,
  /^(?:please\s+)?what\s+did\s+i\s+(?:note|write|save|capture|say)\b/iu,
  /^(?:please\s+)?what\s+(?:are|were)\s+my\s+(?:notes?|decisions?|actions?|questions?|ideas?)\b/iu,
  /^(?:please\s+)?do\s+i\s+have\s+(?:any\s+)?(?:notes?|decisions?|actions?|tasks?|questions?|ideas?)\b/iu,
  /^(?:please\s+)?(?:my\s+)?notes?\s+(?:about|on|from|for|regarding)\b/iu,
  /^(?:please\s+)?remind\s+me\s+what\s+i\s+(?:noted|wrote|saved|captured)\b/iu,
];

const NOTE_TYPE_PATTERNS = [
  { type: "decision" as const, pattern: /\bdecisions?\b/iu },
  { type: "action" as const, pattern: /\b(?:actions?|tasks?|todos?|to-dos?)\b/iu },
  { type: "question" as const, pattern: /\bquestions?\b/iu },
  { type: "idea" as const, pattern: /\bideas?\b/iu },
  { type: "reference" as const, pattern: /\breferences?\b/iu },
];

const PRIORITY_PATTERNS = [
  { priority: "critical" as const, pattern: /\bcritical(?:\s+priority)?\b/iu },
  { priority: "high" as const, pattern: /\bhigh(?:\s+priority)?\b/iu },
  { priority: "normal" as const, pattern: /\bnormal(?:\s+priority)?\b/iu },
  { priority: "low" as const, pattern: /\blow(?:\s+priority)?\b/iu },
];

const STOP_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "any",
  "about",
  "are",
  "did",
  "do",
  "for",
  "from",
  "have",
  "i",
  "in",
  "list",
  "look",
  "me",
  "meeting",
  "meetings",
  "my",
  "note",
  "notes",
  "of",
  "on",
  "please",
  "pull",
  "regarding",
  "related",
  "search",
  "show",
  "the",
  "to",
  "up",
  "what",
  "were",
  "with",
]);

export class NoteRetrievalService {
  constructor(private readonly repository: NoteRetrievalRepository) {}

  interpret(text: string): NoteRetrievalRequest | null {
    return parseNoteRetrievalRequest(text);
  }

  async search(
    owner: OwnerScope,
    text: string,
  ): Promise<NoteRetrievalResponse | null> {
    const request = this.interpret(text);
    if (!request) {
      return null;
    }

    return {
      request,
      notes: await this.repository.search(owner, request),
    };
  }

  getOriginal(owner: OwnerScope, noteId: string) {
    return this.repository.getOriginal(owner, noteId);
  }
}

export function parseNoteRetrievalRequest(
  text: string,
): NoteRetrievalRequest | null {
  const trimmed = text.trim();
  if (!trimmed || !RETRIEVAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  let searchable = trimmed.toLowerCase();
  const noteTypes: NoteRetrievalRequest["noteTypes"] = [];
  const priorities: NoteRetrievalRequest["priorities"] = [];

  for (const entry of NOTE_TYPE_PATTERNS) {
    if (entry.pattern.test(searchable)) {
      noteTypes.push(entry.type);
      searchable = searchable.replace(
        new RegExp(entry.pattern.source, "giu"),
        " ",
      );
    }
  }

  for (const entry of PRIORITY_PATTERNS) {
    if (entry.pattern.test(searchable)) {
      priorities.push(entry.priority);
      searchable = searchable.replace(
        new RegExp(entry.pattern.source, "giu"),
        " ",
      );
    }
  }

  const status = extractStatus(searchable);
  searchable = searchable
    .replace(/\b(?:unresolved|outstanding|pending|resolved|completed|done|closed|archived|open)\b/giu, " ")
    .replace(/\bpriority\b/giu, " ")
    .replace(/\b(?:find|search|show|list|pull|look|remind|wrote|noted|saved|captured|write|save|capture|say)\b/giu, " ")
    .replace(/[“”"'`]/gu, " ")
    .replace(/[^\p{L}\p{N}@._-]+/gu, " ");

  const terms = searchable
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  const searchText = [...new Set(terms)].join(" ") || null;

  return {
    originalText: trimmed,
    searchText,
    noteTypes: [...new Set(noteTypes)],
    priorities: [...new Set(priorities)],
    status,
    limit: 8,
  };
}

function extractStatus(text: string): RetrievalStatusFilter {
  if (/\b(?:unresolved|outstanding|pending)\b/iu.test(text)) {
    return "unresolved";
  }
  if (/\b(?:resolved|completed|done|closed)\b/iu.test(text)) {
    return "resolved";
  }
  if (/\barchived\b/iu.test(text)) {
    return "archived";
  }
  if (/\bopen\b/iu.test(text)) {
    return "open";
  }
  return "any";
}
