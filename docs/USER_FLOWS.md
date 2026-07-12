# User Flows

## Flow A: Capture during a clear calendar meeting

1. User DMs: “important ask if migration affects customer-created workflows”
2. Slack event is acknowledged.
3. Raw note is durably stored.
4. Calendar resolver finds one event currently in progress.
5. AI returns structured output.
6. Margin sends a private note card.
7. User takes no further action.

Success condition: capture requires one message and no confirmation.

## Flow B: Ambiguous meeting context

1. User sends a note while two overlapping calendar events exist.
2. Raw note is stored as standalone/pending.
3. Margin replies:
   - `Architecture sync`
   - `Customer escalation`
   - `No meeting`
4. User taps one option.
5. Context is attached and the card updates.

Success condition: Margin asks one narrow question instead of guessing.

## Flow C: Active huddle without calendar event

1. User is in a Slack huddle.
2. Margin receives/caches huddle-state information.
3. User DMs a note.
4. Margin attaches huddle context when supported.
5. If title or participant details are unavailable, it labels context as “Slack huddle” rather than inventing metadata.

## Flow D: AI failure

1. User sends a note.
2. Raw note is stored.
3. Transformation request fails.
4. Margin replies: “Saved verbatim. I could not organize it yet.”
5. The note remains searchable and can be reprocessed later.

Success condition: no note is lost because a model or provider failed.

## Flow E: Explicit reminder

User sends:

> Ask Maya about the rollout flags. Remind me tomorrow at 9.

Margin extracts the explicit time, displays it, and requires no extra interaction unless the timezone is unclear.

## Flow F: Implicit reminder

User sends:

> Ask about rollout flags before the next planning meeting.

Margin stores a relative reminder rule tied to the next matching calendar event. It does not fabricate a clock time.

## Flow G: Post-meeting digest

At meeting end:

> **Your notes from Workflow Migration Review**
>
> **Open questions**
> - Does migration affect customer-created workflows?
>
> **Actions**
> - Verify rollout flag ownership.
>
> `Review all` · `Snooze digest`

Only user-captured notes appear.

## Flow H: Pre-meeting resurfacing

Before the next planning meeting:

> **From your last planning meeting**
>
> - Open question: Does migration affect customer-created workflows?
> - Action: Verify rollout flag ownership.
>
> `Mark resolved` · `Snooze` · `Open notes`

## Flow I: Retrieval

User asks:

> What did I note about customer workflows?

Margin returns ranked private results with:

- organized note;
- meeting and date;
- status;
- a control to reveal the original.

## Flow J: Standalone note

If the user is not in a meeting, a DM still creates a normal private note. Meeting-aware behavior is an enhancement, not a capture requirement.
