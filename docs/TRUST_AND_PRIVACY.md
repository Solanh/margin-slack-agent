# Trust and Privacy Model

Trust is a product feature, not a policy appendix.

## Trust contract

Margin promises:

1. It never records or transcribes a meeting.
2. It stores only what the user deliberately sends plus narrowly authorized meeting metadata.
3. It preserves the original exactly.
4. It labels AI-generated text as organized/derived.
5. It does not invent speakers, owners, dates, participants, titles, or decisions.
6. It asks when context is ambiguous.
7. It keeps notes private unless the user explicitly shares them.
8. Calendar access is optional and revocable.
9. Slack huddle and active-view signals are short-lived and optional.
10. Model refusal or provider failure never deletes the saved original.

## Provenance labels

Every value has a source classification:

- **User-provided:** appears directly in the note or a user action.
- **Verified context:** supplied by a documented Slack or Calendar signal.
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
- users can select **Keep verbatim**;
- refusal and failure paths keep the original authoritative.

## Data minimization

Default model inputs:

- the note;
- a selected verified meeting title and start/end time;
- context confidence;
- user timezone;
- optional user preference settings.

Do not send:

- huddle audio or transcript;
- unrelated channel history;
- active-view message bodies;
- participant messages;
- Calendar descriptions;
- attendee email identifiers;
- event location, conferencing details, attachments, or reminders.

Google Calendar requests use a partial-response field list. Limited attendee email identifiers are stored only for deterministic matching and are not passed to the model.

Slack active-view context stores only a channel ID and optional message timestamp. Margin does not fetch the corresponding name, message text, thread, or history. Huddle state stores only active state, optional opaque call ID, and observation/expiration timestamps.

## OpenAI data controls and retention

Margin sends transformation requests with `store: false`. This disables Responses API application-state storage for those requests. It does not by itself guarantee zero provider retention.

OpenAI documents that:

- API data is not used to train models by default unless an organization opts in;
- standard abuse-monitoring logs may retain customer content for up to 30 days;
- Zero Data Retention and Modified Abuse Monitoring are account-level controls that require approval and configuration;
- Structured Outputs may return a refusal instead of the requested schema.

Margin therefore does not claim Zero Data Retention merely because this repository sets `store: false`.

Official references:

- https://platform.openai.com/docs/guides/your-data
- https://platform.openai.com/docs/guides/structured-outputs
- https://openai.com/enterprise-privacy/

When a structured-output refusal occurs, Margin detects it before reading parsed output, discards the refusal content, records no derived transformation, and returns the already-saved note verbatim. Refusal content and note bodies are not written to logs.

## Google OAuth controls

- exact scope: `calendar.events.readonly`;
- one-time state values expire after ten minutes;
- only the SHA-256 state hash is persisted;
- authorization codes and state values are not logged;
- access and refresh tokens are encrypted with AES-256-GCM;
- expired access tokens are refreshed only through the stored refresh token;
- disconnect attempts Google revocation and always removes local credentials;
- callback responses use `no-store` and restrictive browser headers.

Calendar is not a prerequisite for note capture.

## Slack signal controls

- `user_huddle_changed` is retained only for workspace users already known to Margin;
- first-use capture stores the raw note before refreshing that user's profile;
- leaving a huddle deletes the active row;
- stale huddle state expires, with bounded fallback and maximum lifetimes;
- active-view context expires after 15 minutes;
- unsupported canvas/list context is discarded;
- cross-workspace entities are ignored;
- active-view context is never treated as proof of a huddle channel;
- no `calls:read` scope is requested;
- `calls.info` is not used for undocumented native huddle IDs;
- missing or failed Slack metadata never blocks note capture.

A huddle record uses `Slack huddle (title unavailable)` and an empty participant list because Slack's supported state signal does not provide verified title or participant metadata.

## Privacy defaults

- private app DM only;
- exports delivered only to the owner's private Margin DM;
- reminders delivered privately;
- App Home scoped to the current user;
- Calendar disabled or disconnected by default;
- no audio, transcript, or unrelated history access;
- configurable retention;
- confirmed owner-scoped delete-all;
- encrypted OAuth credentials excluded from exports;
- proactive notifications can be disabled globally.

## Abuse and failure cases

### Hallucinated attribution

Risk: the model interprets “Maya said…” incorrectly.

Control: extract a speaker only when the raw note explicitly contains the attribution. Label it user-provided, not verified.

### Accidental shared posting

Risk: a private note is posted to a channel.

Control: capture, stored card references, exports, and interaction updates require Slack DM channel identifiers. Channel sharing is not in the MVP.

### Calendar mismatch

Risk: overlapping events cause the wrong context.

Control: retain every plausible event candidate. Auto-attach only when scoring meets the configured threshold and separation rule. Ambiguous candidates remain unresolved.

### Huddle metadata overclaim

Risk: an opaque call ID or active-view channel is interpreted as a verified title, channel, or participant list.

Control: store signals separately, use an explicit title-unavailable label, retain no participants, and never use active-view context as proof of huddle location.

### Workspace-wide event overcollection

Risk: `user_huddle_changed` causes Margin to retain activity for users who never used the app.

Control: discard events unless the workspace/user already owns a Margin note or connected integration.

### OAuth login CSRF or replay

Risk: a callback is associated with the wrong user or replayed.

Control: cryptographic state is hashed, expires quickly, resolves ownership server-side, and is consumed atomically once.

### Prompt injection in note text

Risk: note text contains instructions aimed at the model.

Control: treat note text as data, enforce schema, ignore tool directives, and give the transformation model no external tools.

### Model refusal

Risk: a refusal is mistaken for malformed output or refusal text is retained in logs.

Control: detect refusal content explicitly, throw a content-free refusal error, classify it as `model_refusal`, persist no transformation, and keep the original note verbatim.

### Sensitive content leakage in logs

Risk: raw notes, tokens, authorization codes, Calendar details, refusal text, or Slack context are written to observability systems.

Control: use the structured safe logger, emit categories and fingerprints rather than messages or payloads, hash owner references, and redact process-level failures.

### Cross-owner export or deletion

Risk: a user exports or deletes another user's records.

Control: every export, retention, preference, and deletion query includes workspace and user ownership. Integration tests create multiple owners in one workspace and verify isolation.

## User controls

Current:

- connect/disconnect Calendar;
- edit organized wording;
- change priority;
- change meeting context;
- keep verbatim/use organized;
- enable/disable proactive notifications;
- select a retention period;
- export owner data privately;
- delete all owner data with confirmation.

Planned:

- display original by default;
- more granular notification schedules;
- additional export formats.
