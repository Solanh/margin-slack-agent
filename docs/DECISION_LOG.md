# Decision Log

## D-001 — Use “Margin” as a working title

**Status:** Accepted for development, revisit before submission.

**Reason:** It communicates personal notes written alongside a larger conversation. Repository name: `margin-slack-agent`.

## D-002 — Do not record or transcribe meetings

**Status:** Accepted.

**Reason:** Full meeting capture is crowded, creates consent/privacy concerns, and weakens the user-selected-memory differentiation.

## D-003 — Preserve raw text immutably

**Status:** Accepted.

**Reason:** “Polish without losing meaning” cannot be guaranteed by an LLM. The safe product contract is reversible derived text plus a permanent original.

## D-004 — Calendar is context, not the primary product

**Status:** Accepted.

**Reason:** Calendar matching reduces user work. Margin should still function as a standalone note tool when Calendar is unavailable.

## D-005 — Ask rather than guess in ambiguous cases

**Status:** Accepted.

**Reason:** A wrong meeting association damages trust more than one lightweight clarification.

## D-006 — Use direct Google Calendar API for MVP

**Status:** Accepted.

**Reason:** It is a known, testable integration path. An MCP layer may be added later but is not necessary to prove the user workflow.

## D-007 — Optimize for one complete memory lifecycle

**Status:** Accepted.

**Reason:** Capture plus resurfacing is more differentiated than many shallow integrations.

## D-008 — No channel sharing in MVP

**Status:** Accepted.

**Reason:** Private-by-default is central. Sharing adds accidental-disclosure risk and is unnecessary for the primary demo.

## Open decisions

- Which deployed database and background-job mechanism minimize setup risk?
- Are native huddle call IDs resolvable to useful metadata in the official sandbox?
- Which model/provider gives reliable structured output at low latency?
- Should App Home be implemented before natural-language retrieval if time is limited?
- Does the final product name conflict with an existing Slack Marketplace listing or trademark?
