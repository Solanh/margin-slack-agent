# Roadmap

The deadline requires ruthless sequencing. A complete narrow flow is more valuable than many partially implemented integrations.

## Phase 0 — Product proof and workspace setup

**Goal:** Verify the differentiating interaction in the official developer sandbox.

- create Slack app with Agent View and App Home;
- receive private app messages;
- render an interactive note card;
- verify `user_huddle_changed` behavior in the sandbox;
- verify whether native huddle call IDs can be resolved to useful metadata;
- create Google OAuth credentials and query current events;
- decide the deployed persistence provider;
- record limitations in the decision log.

**Exit criterion:** A message to Margin produces a private interactive response in the official sandbox.

## Phase 1 — Trustworthy capture

**Goal:** Make note loss impossible under normal application failures.

- implement idempotent Slack event ingestion;
- persist immutable raw note before enrichment;
- create note/revision schema;
- handle Slack retries;
- add verbatim fallback;
- add tests for duplicate events and transformation failure.

**Exit criterion:** Killing the AI provider or Calendar integration does not lose or duplicate a captured note.

## Phase 2 — Structured organization

**Goal:** Convert a rough note into a conservative structured representation.

- define strict output schema;
- implement prompt and model adapter;
- validate output;
- store transformation version and inferred fields;
- render original/organized distinction;
- add edit and keep-verbatim actions.

**Exit criterion:** Test notes retain all explicit facts and expose the original.

## Phase 3 — Meeting context

**Goal:** Attach the correct current meeting with visible confidence.

- implement Calendar current-event query;
- cache Slack huddle state;
- implement scoring and ambiguity threshold;
- add meeting-choice buttons;
- display source/confidence;
- test overlapping events.

**Exit criterion:** Clear cases auto-attach; ambiguous cases prompt rather than guess.

## Phase 4 — Memory lifecycle

**Goal:** Show that Margin is more than a formatter.

- generate private post-meeting digest;
- implement explicit reminders;
- implement one relative reminder: “before next [meeting]”;
- create App Home recent/open views;
- implement basic private retrieval;
- surface unresolved notes before a related meeting.

**Exit criterion:** The demo can capture a note, digest it, retrieve it, and resurface it later.

## Phase 5 — Submission polish

**Goal:** Optimize for judging.

- create architecture diagram;
- add realistic seeded demo data;
- rehearse a sub-three-minute video;
- measure capture latency;
- verify all flows in a fresh sandbox session;
- publish public repository;
- document setup;
- add screenshots/GIF;
- confirm developer sandbox access;
- complete Devpost text and credits.

## Cut order if time runs short

Cut in this order:

1. semantic/vector search;
2. multiple export destinations;
3. advanced project/person inference;
4. complex recurrence;
5. workspace-admin analytics;
6. huddle metadata beyond active-state detection.

Do not cut:

- raw-note durability;
- original/derived distinction;
- meeting-context confidence;
- one complete resurfacing flow;
- a polished Slack-native UI.

## Post-hackathon roadmap

- Notion, Obsidian, and Google Docs export;
- shared-note handoff with explicit preview;
- team memory spaces with per-note consent;
- local/on-device transformation option;
- richer Calendar and Slack context;
- mobile capture optimizations;
- user-controlled semantic indexing;
- enterprise retention and audit controls.
