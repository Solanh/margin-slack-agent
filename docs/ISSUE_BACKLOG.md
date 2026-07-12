# Prioritized Issue Backlog

These issues are ordered for implementation. `P0` items are required for the core submission.

## P0 — Foundation

### 1. Bootstrap Slack Agent View application

**Acceptance criteria**

- app installs in the official developer sandbox;
- user can open the agent conversation;
- private messages reach the event handler;
- bot sends a Block Kit response;
- App Home renders a placeholder state.

### 2. Implement durable, idempotent raw-note ingestion

**Acceptance criteria**

- raw text is persisted before external calls;
- Slack retries do not duplicate a note;
- capture failure is visible;
- logs do not contain note bodies.

### 3. Define note domain model and database schema

**Acceptance criteria**

- immutable raw text;
- derived organized text;
- provenance and context confidence;
- revisions;
- reminders;
- workspace/user isolation.

### 4. Implement structured transformation service

**Acceptance criteria**

- strict schema validation;
- conservative prompt;
- unsupported/invented fields rejected;
- transformation failure leaves a valid verbatim note;
- prompt/schema version stored.

### 5. Build interactive note card

**Acceptance criteria**

- organized note;
- meeting context;
- type, priority, reminder;
- original-preserved indicator;
- edit, priority, reminder, meeting, and verbatim actions.

## P0 — Context and lifecycle

### 6. Connect Google Calendar and resolve current event

**Acceptance criteria**

- least-privilege OAuth;
- events overlapping capture time are retrieved;
- tokens stored securely;
- disconnect works;
- overlapping events return multiple candidates.

### 7. Integrate Slack huddle/context signals

**Acceptance criteria**

- current huddle state is cached;
- missing metadata does not block capture;
- unsupported call metadata is explicitly documented;
- no inferred huddle title is presented as verified.

### 8. Implement context scoring and clarification

**Acceptance criteria**

- confidence score/source stored;
- high-confidence event auto-attaches;
- ambiguous candidates produce buttons;
- “No meeting” is always available.

### 9. Create post-meeting digest

**Acceptance criteria**

- sends only to the note owner;
- groups by note type;
- includes zero transcript-derived content;
- can be disabled/snoozed.

### 10. Implement pre-meeting resurfacing

**Acceptance criteria**

- identifies one future related event;
- surfaces unresolved actions/questions privately;
- supports resolve/snooze;
- user can disable proactive messages.

### 11. Implement basic private retrieval

**Acceptance criteria**

- natural-language query searches only the current user's notes;
- results include meeting/date and organized text;
- original is accessible;
- no results produces a useful response.

## P1 — Submission and polish

### 12. Build App Home memory dashboard

- recent notes;
- unresolved questions/actions;
- upcoming reminders;
- filters;
- settings/privacy controls.

### 13. Add observability without content leakage

- request/event IDs;
- latency;
- context resolution outcome;
- model failure rate;
- no raw-note body.

### 14. Create end-to-end demo seed and reset

- deterministic meetings;
- deterministic notes;
- reset script;
- fallback when live Calendar is unavailable.

### 15. Add README setup and architecture assets

- local setup;
- Slack app setup;
- Google OAuth setup;
- deployment;
- screenshots;
- data model and architecture diagram.

### 16. Record and validate submission video

- under three minutes;
- readable Slack UI;
- problem, product, technology, trust, result;
- no hidden/manual step presented as automatic.

## P2 — After submission

- export integrations;
- semantic retrieval;
- team/shared notes;
- configurable retention;
- local model support;
- admin policy controls.
