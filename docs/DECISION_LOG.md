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

## D-009 — Use `user_huddle_changed` as the supported native huddle signal

**Status:** Accepted with constraints.

**Evidence:** Slack documents `user_huddle_changed` as an Events API event requiring `users:read`. The user profile includes `huddle_state`, `huddle_state_expiration_ts`, and optional `huddle_state_call_id`.

**Decision:** Cache only active state, call ID, observation time, and expiration. Retain workspace-wide events only for users who already have Margin data; refresh the current user through `users.info` after raw capture so a first-use note can still detect an active huddle.

**Limitations:** The event does not document a huddle title, channel, participant list, actual start time, audio, or transcript. Margin must not invent those values. The attached meeting uses the explicit label `Slack huddle (title unavailable)`, an empty participant list, and the observed active interval.

Official reference: https://docs.slack.dev/reference/events/user_huddle_changed/

## D-010 — Treat Agent active-view context as a weak, separate signal

**Status:** Accepted.

**Evidence:** Slack's Agent documentation says `app_context_changed` emits ordered entities for the user's active channel, DM, message, canvas, or list. The same context is included in `message.im` as `app_context` when the app subscribes to the event.

**Decision:** Cache only the first supported channel or message entity for 15 minutes. Ignore canvas/list entities for meeting resolution. Do not retrieve channel history or channel names.

**Limitations:** What the user is viewing is not proof of where a huddle is occurring. Active-view context therefore never creates a huddle, supplies a title, or supplies participants. It remains available for future user-facing disambiguation only.

Official references:

- https://docs.slack.dev/ai/developing-agents/
- https://docs.slack.dev/ai/agent-context-management/

## D-011 — Do not call `calls.info` for native Slack huddles

**Status:** Accepted pending optional manual sandbox confirmation.

**Evidence:** Slack documents `calls.info` as part of the Calls API, requiring `calls:read`, and defines its input as the ID of a Call returned by `calls.add`. Slack does not document native `huddle_state_call_id` values as valid `calls.info` IDs.

**Decision:** Do not add `calls:read`, do not call `calls.info` at runtime, and do not depend on undocumented native-huddle metadata. The huddle call ID is retained only as a stable provider identifier when Slack supplies it.

**Sandbox spike:** A workspace owner may temporarily test a native huddle call ID against `calls.info` in a developer sandbox, but the production manifest should remain unchanged unless Slack documents support and the returned fields materially improve context without weakening privacy. The current implementation and demo do not require this experiment to succeed.

Official reference: https://docs.slack.dev/reference/methods/calls.info/

## D-012 — Prefer direct huddle evidence over a scheduled Calendar candidate

**Status:** Accepted.

**Reason:** Calendar resolution still stores all plausible scheduled events first. If Slack then verifies that the user is actively in a huddle, the huddle becomes the selected context because it is direct current-state evidence. Calendar candidates remain stored and available through the meeting picker.

## Open decisions

- Which deployed database and background-job mechanism minimize setup risk?
- Which model/provider gives reliable structured output at low latency?
- Should App Home be implemented before natural-language retrieval if time is limited?
- Does the final product name conflict with an existing Slack Marketplace listing or trademark?
