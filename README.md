# Margin

> **Working title:** Margin — your private margin notes for meetings in Slack.

Margin is a private, calendar-aware memory agent for Slack. During a huddle or meeting, DM it the one sentence you do not want to lose. Margin immediately preserves the original, scores supported context signals, attaches context only when evidence is clear, produces a labeled organized version, and resurfaces it when useful.

## Why this exists

People already send rough notes to themselves in Slack because opening a separate notes app interrupts the meeting. Those self-messages are fast to capture but easy to lose, lack meeting context, and rarely become reminders or useful follow-up.

Margin preserves that low-friction behavior rather than replacing it with a recorder, transcript, or form.

## Core promise

1. **You choose what matters.** Margin never records the meeting.
2. **Your original is permanent.** AI output is a derived view, never a replacement.
3. **Context is attached, not invented.** Meeting metadata comes from supported Slack and Calendar signals.
4. **Uncertainty is visible.** Close or weak candidates produce one narrow question instead of a guess.
5. **Notes return at useful moments.** After the meeting, before the next verified related meeting, and when you privately search for them.

## Example

You DM Margin during a huddle:

> important ask if migration also affects customer-created workflows. remind me before planning

When context is clear, Margin attaches it automatically. When a huddle and Calendar event overlap, the same private card asks:

- `Workflow Migration Review`
- `Slack huddle (title unavailable)`
- `No meeting`

One tap updates that existing card; no second result message is posted.

Later, ask:

> What did I note about customer workflows?

Margin searches only your persisted Margin notes and returns private results with organized wording, meeting/date, status, and a control to reveal the immutable original.

An existing MCP-capable LLM can also query the same owner-scoped notes without Margin paying for or embedding another model API.

## Product scope

The hackathon MVP is intentionally narrow:

- Slack Agent View / DM capture
- durable raw-note write before any AI call
- meeting-context resolution from Google Calendar and Slack huddle state
- deterministic scoring and one-tap clarification
- structured note transformation with explicit uncertainty
- note card actions
- private post-meeting digest
- private retrieval across the user's own notes
- proactive pre-meeting resurfacing for verified recurring events
- read-only MCP access for an existing host LLM

Margin does **not** record audio, transcribe meetings, read unrelated channel or private-message history, or become a general project-management system.

## Repository status

The current stacked implementation covers issues #1 through #11:

- current Slack `agent_view` manifest;
- writable Messages tab and App Home;
- private `message.im` handling;
- Socket Mode startup;
- PostgreSQL migration runner;
- atomic, idempotent raw-note persistence;
- owner-scoped notes, meetings, reminders, revisions, and encrypted OAuth storage;
- database-enforced immutable original text;
- versioned structured note transformation;
- strict Zod output validation and inference labels;
- tool-free OpenAI Responses integration with `store: false`;
- one private processing message updated in place with the final note card;
- explicit user-provided, verified, inferred, user-edited, and unresolved labels;
- edit, priority, reminder, meeting, and reversible verbatim controls;
- least-privilege Google Calendar OAuth using `calendar.events.readonly`;
- encrypted access/refresh tokens, automatic refresh, revocation, and disconnect;
- minimized event lookup around capture and upcoming-event windows;
- `user_huddle_changed` and current-user profile refresh for active-huddle evidence;
- short-lived, owner-scoped active-view channel/message context;
- generic title-unavailable huddle records with no invented participants;
- normalized Calendar, huddle, explicit, and standalone context candidates;
- persisted source, score, confidence, signals, selection, and resolution status;
- automatic attachment only at score ≥85 with a lead greater than 15 points;
- text-only evidence capped below high confidence;
- ranked one-tap clarification buttons with `No meeting` always available;
- durable owner-only post-meeting digest delivery;
- verified-series pre-meeting resurfacing with global/per-series opt-out;
- deterministic owner-scoped private note retrieval by topic, meeting, mentioned name, type, priority, and status;
- immutable-original retrieval through a validated private modal;
- read-only MCP tools for date, meeting, topic, open-work, and note-detail queries;
- production Docker packaging, health/readiness checks, redacted logging, centralized retries, and owner data controls;
- explicit model-refusal fallback and accurate provider-retention documentation;
- PostgreSQL-backed integration tests in CI.

## Demo and submission

The repository includes a safe deterministic fallback workflow and an end-to-end submission preflight:

```bash
export DEMO_WORKSPACE_ID='T_REAL_WORKSPACE'
export DEMO_USER_ID='U_REAL_DEMO_USER'
export DEMO_CONFIRM_RESET="${DEMO_WORKSPACE_ID}:${DEMO_USER_ID}"

npm run migrate
npm run demo:prepare
npm run demo:publish
npm run preflight
```

`demo:reset` removes only Margin data owned by the explicitly named workspace/user and preserves the Slack installation and Google OAuth connection. Outside explicit development/test environments, it also requires `DEMO_ALLOW_NON_DEVELOPMENT_RESET=true`.

`demo:publish` opens the real owner DM, publishes or updates the prepared note cards, delivers the seeded digest and resurfacing examples, and visibly labels every prepared message as **Seeded demo state**. It never presents prepared data as live capture.

With Margin running, require the final process to be ready:

```bash
npm run preflight:live
```

Submission assets:

- [Final submission runbook](docs/FINAL_SUBMISSION_RUNBOOK.md)
- [Three-minute demo script](docs/DEMO_SCRIPT.md)
- [Devpost submission copy](docs/DEVPOST_SUBMISSION.md)
- [Upload-ready architecture graphic](docs/architecture-overview.svg)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)

## Run the application

See [Slack developer sandbox setup](docs/SLACK_SETUP.md), [PostgreSQL setup](docs/DATABASE_SETUP.md), [Google Calendar setup](docs/GOOGLE_CALENDAR.md), [Slack context signals](docs/SLACK_CONTEXT_SIGNALS.md), [context resolution](docs/CONTEXT_RESOLUTION.md), [structured transformation](docs/TRANSFORMATION.md), [interactive note cards](docs/NOTE_CARD.md), [private note retrieval](docs/NOTE_RETRIEVAL.md), and [read-only MCP access](docs/MCP.md).

```bash
cp .env.example .env
npm install
npm run typecheck
npm test
npm run build
npm run migrate
npm start
```

Run the MCP server after building:

```bash
npm run build
npm run --silent mcp
```

## Documentation

- [Slack developer sandbox setup](docs/SLACK_SETUP.md)
- [PostgreSQL setup](docs/DATABASE_SETUP.md)
- [Google Calendar integration](docs/GOOGLE_CALENDAR.md)
- [Slack huddle and Agent-context signals](docs/SLACK_CONTEXT_SIGNALS.md)
- [Context scoring and clarification](docs/CONTEXT_RESOLUTION.md)
- [Database schema and ownership](docs/SCHEMA.md)
- [Structured note transformation](docs/TRANSFORMATION.md)
- [Interactive private note card](docs/NOTE_CARD.md)
- [Private note retrieval](docs/NOTE_RETRIEVAL.md)
- [Read-only notes MCP server](docs/MCP.md)
- [Product specification](docs/PRODUCT_SPEC.md)
- [Market and competitive research](docs/MARKET_VALIDATION.md)
- [User flows](docs/USER_FLOWS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Trust and privacy model](docs/TRUST_AND_PRIVACY.md)
- [Roadmap](docs/ROADMAP.md)
- [Issue backlog](docs/ISSUE_BACKLOG.md)
- [Final submission runbook](docs/FINAL_SUBMISSION_RUNBOOK.md)
- [Hackathon demo script](docs/DEMO_SCRIPT.md)
- [Devpost submission copy](docs/DEVPOST_SUBMISSION.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Decision log](docs/DECISION_LOG.md)
- [Research sources](docs/RESEARCH_SOURCES.md)

## Stack

- TypeScript
- Slack Bolt for JavaScript
- Slack Agent View and App Home
- PostgreSQL for durable notes, context, retrieval, and notifications
- Google Calendar API for meeting matching and recurring-series identity
- OpenAI structured outputs for conservative formatting/classification
- dependency-free MCP JSON-RPC stdio server for host-model note access
- database-backed workers for digests and resurfacing

See [Architecture](docs/ARCHITECTURE.md) for the production and hackathon variants.

## License

MIT
