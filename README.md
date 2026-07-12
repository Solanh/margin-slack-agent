# Margin

> **Working title:** Margin — your private margin notes for meetings in Slack.

Margin is a private, calendar-aware memory agent for Slack. During a huddle or meeting, DM it the one sentence you do not want to lose. Margin immediately preserves the original, attaches the most likely meeting context, produces a clearly labeled organized version, and resurfaces it when it becomes useful.

## Why this exists

People already send rough notes to themselves in Slack because opening a separate notes app interrupts the meeting. Those self-messages are fast to capture but easy to lose, lack meeting context, and rarely become reminders or useful follow-up.

Margin preserves that low-friction behavior rather than replacing it with a recorder, transcript, or form.

## Core promise

1. **You choose what matters.** Margin never records the meeting.
2. **Your original is permanent.** AI output is a derived view, never a replacement.
3. **Context is attached, not invented.** Meeting, participants, and dates come from Slack and Calendar signals.
4. **Uncertainty is visible.** Inferred fields are labeled and ambiguous context is confirmed.
5. **Notes return at useful moments.** After the meeting and before the next related meeting.

## Example

You DM Margin during a huddle:

> important ask if migration also affects customer-created workflows. remind me before planning

Margin responds:

**Open question · High priority**  
Confirm whether the migration also affects workflows created directly by customers.

**Context:** Workflow Migration Review · July 12, 2026  
**Reminder:** Before the next planning meeting  
**Original preserved:** Yes

Actions: `Edit` · `Change priority` · `Change meeting` · `Keep verbatim`

## Product scope

The hackathon MVP is intentionally narrow:

- Slack Agent View / DM capture
- durable raw-note write before any AI call
- meeting-context resolution from Google Calendar and Slack huddle state
- structured note transformation with explicit uncertainty
- note card actions
- private post-meeting digest
- basic retrieval across the user's own notes
- one proactive pre-meeting resurfacing flow

Margin does **not** record audio, transcribe meetings, summarize entire channels, or become a general project-management system.

## Repository status

This repository begins with the validated product definition, architecture, trust model, demo plan, and implementation backlog. The code under `src/` is a deliberately small domain scaffold, not a finished Slack app.

## Documentation

- [Product specification](docs/PRODUCT_SPEC.md)
- [Market and competitive research](docs/MARKET_VALIDATION.md)
- [User flows](docs/USER_FLOWS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Trust and privacy model](docs/TRUST_AND_PRIVACY.md)
- [Roadmap](docs/ROADMAP.md)
- [Issue backlog](docs/ISSUE_BACKLOG.md)
- [Hackathon demo script](docs/DEMO_SCRIPT.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Decision log](docs/DECISION_LOG.md)
- [Research sources](docs/RESEARCH_SOURCES.md)

## Proposed stack

- TypeScript
- Slack Bolt for JavaScript
- Slack Agent View and App Home
- PostgreSQL for durable notes, context, and reminders
- Google Calendar API for meeting matching
- a structured-output LLM for formatting/classification
- a background job mechanism for digests and resurfacing

See [Architecture](docs/ARCHITECTURE.md) for the production and hackathon variants.

## Local domain scaffold

```bash
npm install
npm test
npm run typecheck
```

The scaffold currently validates the note data contract and the invariant that raw content is preserved independently from derived AI output.

## License

MIT
