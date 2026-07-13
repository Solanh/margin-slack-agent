# Structured Note Transformation

Margin treats AI organization as an optional derived view over an already persisted original note.

## Safety contract

1. The exact Slack message is stored before transformation begins.
2. The model has no tools and receives no unrelated Slack history.
3. The note is passed as untrusted data, not executable instructions.
4. Structured output is validated by Zod and then checked against additional provenance rules.
5. The current derived state and its AI revision commit in one PostgreSQL transaction.
6. Any refusal, provider, validation, or persistence failure returns the saved verbatim note.
7. `notes.raw_text` remains protected by the database immutability trigger.

## Provider boundary

The adapter uses the official OpenAI TypeScript SDK and Responses API structured-output helper:

- `responses.parse`
- `zodTextFormat`
- `store: false`
- no tools

The configured model is read from `AI_MODEL`; the repository does not hard-code a model name.

`store: false` disables Responses API application-state storage for this request. It is not a claim that the provider retains no data under every account configuration. Standard abuse-monitoring retention may still apply, while Zero Data Retention and Modified Abuse Monitoring are account-level controls that require separate eligibility and configuration.

Official references:

- https://platform.openai.com/docs/guides/your-data
- https://platform.openai.com/docs/guides/structured-outputs
- https://openai.com/enterprise-privacy/

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

## Refusal handling

Structured-output responses may contain a refusal item instead of parsed output. The adapter checks the response output before reading `output_parsed`.

When a refusal is present:

1. Margin does not read, persist, or log the refusal text.
2. The adapter throws `OpenAITransformationRefusalError`.
3. `OrganizeNoteService` returns the already-saved note with reason `model_refusal`.
4. No transformation or AI revision is persisted.
5. The private note card remains a verbatim result with the immutable original available.

Refusal is classified separately from malformed output and provider availability failures so aggregate operations can distinguish them without storing private content.

## Verbatim fallback

`OrganizeNoteService` returns one of two states:

- `organized`: validated transformation persisted successfully;
- `verbatim`: original note remains authoritative.

Verbatim reasons are:

- `model_refusal`
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

The transformation service runs after durable capture and context resolution. The Slack note card displays the organized result when available and the verbatim original for refusal or failure paths.

## Testing

The test suite covers:

- all five note categories;
- relative reminder interpretation;
- malformed structured output;
- missing inference labels;
- exact due times without reminder intent;
- prompt-injection text remaining inside the raw-note data field;
- tool-free provider requests with Responses application-state storage disabled;
- explicit refusal detection without refusal-text persistence;
- refusal, provider, validation, and persistence fallbacks;
- transactional PostgreSQL note/revision persistence;
- preservation of the immutable original.
