# Structured Note Transformation

Margin treats AI organization as an optional derived view over an already persisted original note.

## Safety contract

1. The exact Slack message is stored before transformation begins.
2. The model has no tools and receives no unrelated Slack history.
3. The note is passed as untrusted data, not executable instructions.
4. Structured output is validated by Zod and then checked against additional provenance rules.
5. The current derived state and its AI revision commit in one PostgreSQL transaction.
6. Any provider, validation, or persistence failure returns the saved verbatim note.
7. `notes.raw_text` remains protected by the database immutability trigger.

## Provider boundary

The initial adapter uses the official OpenAI TypeScript SDK and the Responses API structured-output helper:

- `responses.parse`
- `zodTextFormat`
- `store: false`
- no tools

The configured model is read from `AI_MODEL`; the repository does not hard-code a model name.

## Transformation schema

The model returns:

- `organizedText`
- `noteType`: decision, action, question, idea, or reference
- `priority`: low, normal, high, or critical
- `reminderIntent`
- `explicitDueAt`
- `inferredFields`
- `uncertainties`

`organizedText`, `noteType`, and `priority` must always be labeled as inferred. Reminder fields must also be labeled when present.

## Conservative prompt rules

The versioned `margin-note-v1` prompt forbids the model from inventing:

- speakers or quotations;
- owners or assignees;
- projects;
- deadlines or exact dates;
- confirmed decisions;
- commitments or meeting outcomes.

It also prevents a suggestion or question from silently becoming a decision or action.

Priority defaults to `normal` unless the raw note explicitly communicates urgency. Exact due times are allowed only when the raw note and user timezone resolve a timestamp without guessing.

## Verbatim fallback

`OrganizeNoteService` returns one of two states:

- `organized`: validated transformation persisted successfully;
- `verbatim`: original note remains authoritative.

Verbatim reasons are:

- `provider_failure`
- `invalid_output`
- `persistence_failure`

A fallback does not delete, replace, or rewrite the original note.

## Revision history

A successful transformation updates the current derived columns on `notes` and appends an `ai` row to `note_revisions` in the same transaction. Both records include:

- prompt/schema version;
- inferred fields;
- uncertainties;
- reminder interpretation.

This allows future UI changes or prompt versions without losing provenance.

## Current integration boundary

Issue #4 implements and validates the transformation service. It is not yet invoked directly from the Slack acknowledgement path. Issue #5 will render the organized result and establish the user-facing interaction after durable capture.

## Testing

The test suite covers:

- all five note categories;
- relative reminder interpretation;
- malformed structured output;
- missing inference labels;
- exact due times without reminder intent;
- prompt-injection text remaining inside the raw-note data field;
- tool-free provider requests with server-side storage disabled;
- provider, validation, and persistence fallbacks;
- transactional PostgreSQL note/revision persistence;
- preservation of the immutable original.
