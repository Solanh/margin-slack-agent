# Trust and Privacy Model

Trust is a product feature, not a policy appendix.

## Trust contract

Margin promises:

1. It never records or transcribes a meeting.
2. It stores only what the user deliberately sends plus narrowly authorized meeting metadata.
3. It preserves the original exactly.
4. It labels AI-generated text as organized/derived.
5. It does not invent speakers, owners, dates, participants, or decisions.
6. It asks when context is ambiguous.
7. It keeps notes private unless the user explicitly shares them.
8. Calendar access is optional and revocable.

## Provenance labels

Every value has a source classification:

- **User-provided:** appears directly in the note or a user action.
- **Verified context:** supplied by Slack or Calendar.
- **Inferred:** produced by the model or heuristic.
- **Unresolved:** insufficient evidence.

The interface does not visually merge these categories.

## Meaning-preservation strategy

An LLM cannot guarantee zero semantic drift. Margin therefore does not claim that the organized note is perfect.

Instead:

- raw text is immutable;
- the organized version is reversible and editable;
- transformations are conservative;
- quotes are never created unless present in the raw text;
- uncertain interpretation is flagged;
- users can select **Keep verbatim**.

## Data minimization

Default inputs to the model:

- the note;
- a selected verified meeting title and start/end time;
- context confidence;
- user timezone;
- optional user preference settings.

Do not send:

- full huddle audio or transcript;
- unrelated channel history;
- participant messages;
- Calendar descriptions;
- attendee email identifiers;
- event location, conferencing details, attachments, or reminders.

Google Calendar API requests use a partial-response field list and do not retrieve descriptions, locations, conference links, or attachments. Limited attendee email identifiers are normalized and stored only for future deterministic context matching; they are not passed to the transformation model.

## Google OAuth controls

- exact scope: `calendar.events.readonly`;
- one-time state values expire after ten minutes;
- only the SHA-256 state hash is persisted;
- authorization codes and state values are not logged;
- access and refresh tokens are encrypted with AES-256-GCM;
- expired access tokens are refreshed only through the stored refresh token;
- disconnect attempts Google revocation and always removes local credentials;
- OAuth callback responses are marked `no-store` and use restrictive browser headers.

Calendar is not a prerequisite for note capture. A missing connection, authorization failure, token failure, or Calendar API outage produces a standalone note.

## Privacy defaults

- private app DM only;
- no shared exports by default;
- reminders delivered privately;
- App Home scoped to the current user;
- Calendar disconnected by default;
- configurable retention;
- deletion removes derived content, embeddings, and reminders associated with the note.

## Abuse and failure cases

### Hallucinated attribution

Risk: model interprets “Maya said…” incorrectly.

Control: only extract a speaker when the raw note explicitly contains the attribution. Label it user-provided, not verified.

### Accidental shared posting

Risk: a private note is posted to a channel.

Control: capture, stored card references, and interaction updates require Slack DM channel identifiers. Channel sharing is not in the MVP.

### Calendar mismatch

Risk: overlapping events cause the wrong context.

Control: retain every plausible event candidate. Auto-attach only when there is exactly one candidate. Multiple candidates remain unresolved for user selection.

### OAuth login CSRF or replay

Risk: a callback is associated with the wrong user or replayed.

Control: server-generated cryptographic state is stored as a hash, expires quickly, resolves ownership server-side, and is consumed atomically once.

### Prompt injection in note text

Risk: note contains instructions aimed at the model.

Control: treat note text as data, enforce schema, ignore tool-use directives, and do not grant the transformation model external tools.

### Sensitive content leakage in logs

Risk: raw notes, tokens, authorization codes, or Calendar details are written to observability systems.

Control: log identifiers and failure categories, not note bodies or credential material.

## User controls

Current:

- connect/disconnect Calendar;
- edit organized wording;
- change priority;
- change meeting context;
- keep verbatim/use organized.

Planned:

- enable/disable post-meeting digests;
- enable/disable proactive resurfacing;
- default retention;
- export all data;
- delete all data;
- display original by default.
