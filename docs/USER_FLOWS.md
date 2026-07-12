# User Flows

## Flow A: Clear Calendar context

1. User DMs: “important ask if migration affects customer-created workflows.”
2. Raw note is stored exactly.
3. Margin finds one active Calendar event.
4. The event scores at least 85 and has no close competitor.
5. Margin attaches the event and organizes the note.
6. The processing message updates into the final private card.

Success condition: one user message and no confirmation.

## Flow B: Ambiguous meeting context

1. User sends a note while two overlapping events exist, or while both a huddle and a Calendar event are active.
2. Raw note is stored and every candidate is persisted.
3. The top candidates are within 15 points, so Margin does not attach either.
4. The same note card asks:
   - `Architecture sync`
   - `Customer escalation`
   - `No meeting`
5. User taps one option.
6. The note becomes user-selected/exact context and the same card updates.

Success condition: one narrow question, one tap, no guess, no duplicate message.

## Flow C: Clear active huddle

1. Margin has current `user_huddle_changed` or profile huddle evidence.
2. User DMs a note.
3. No competing meeting candidate scores closely.
4. Margin attaches `Slack huddle (title unavailable)` with no invented participants.
5. The card labels Slack huddle as the source and exact as the huddle-state confidence.

## Flow D: Stale or weak context

1. A Calendar event ended just before capture but falls inside the tolerance window.
2. It is retained as a low-confidence candidate but remains below the automatic threshold.
3. Margin asks the user to choose that event or `No meeting`.

Success condition: weak temporal evidence never silently becomes context.

## Flow E: No meeting

1. User sends a standalone private note.
2. Calendar and huddle providers produce no candidate.
3. Margin selects the standalone candidate.
4. Organization and card delivery continue normally.

Meeting awareness is an enhancement, not a capture requirement.

## Flow F: Provider or metadata failure

1. Raw note is stored.
2. Calendar, Slack metadata, or the candidate repository fails.
3. Margin logs an identifier/failure category and continues organization without hidden context.
4. The note remains usable and its original remains immutable.

## Flow G: AI failure

1. Raw note and context decision are stored.
2. Transformation fails or returns invalid structured output.
3. The existing card becomes a verbatim card.
4. The note remains searchable and can be reprocessed later.

## Flow H: User changes meeting later

1. User selects **Meeting** on the card.
2. Margin lists owner-scoped scored/overlapping meetings plus `No meeting`.
3. User chooses a meeting.
4. Margin records a 100-point explicit candidate and exact context.
5. The existing card updates.

## Flow I: Explicit reminder

User sends:

> Ask Maya about the rollout flags. Remind me tomorrow at 9.

Margin extracts the exact time only when wording and timezone are sufficient, labels the interpretation, and preserves the original.

## Flow J: Relative reminder

User sends:

> Ask about rollout flags before the next planning meeting.

Margin stores the relative wording without fabricating a clock time. Delivery scheduling is implemented by the reminder workflow.

## Flow K: Post-meeting digest

At meeting end:

> **Your notes from Workflow Migration Review**
>
> **Open questions**
> - Does migration affect customer-created workflows?
>
> **Actions**
> - Verify rollout flag ownership.

Only user-captured notes appear. The owner can review all, snooze, or disable digests.

## Flow L: Pre-meeting resurfacing

Before the next verified event in the same Google Calendar series:

> **From your last planning meeting**
>
> - Open question: Does migration affect customer-created workflows?
> - Action: Verify rollout flag ownership.

The owner can resolve items, snooze, open notes, mute the series, or disable resurfacing globally. Margin does not use title similarity as series identity.

## Flow M: Retrieval

User asks:

> What did I note about customer workflows?

1. Margin recognizes the message as an explicit retrieval request before capture.
2. It searches only the current workspace/user's persisted Margin notes and attached meeting titles.
3. It returns ranked private results with organized text, meeting/date, status, priority, reminder state, and unresolved indicators.
4. The user selects **View original** to open the immutable wording in a private modal.
5. The retrieval request itself is not stored as a new note.

Other supported examples:

- `Find notes from Workflow Migration Review`
- `What did I note about Maya?`
- `Show unresolved high priority actions`
- `List resolved questions about migration`

A non-retrieval note such as `Find out whether migration affects customers` continues through normal durable capture.
