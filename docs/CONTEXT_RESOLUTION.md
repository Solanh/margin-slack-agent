# Context Scoring and Clarification

Margin resolves meeting context from multiple evidence sources in one deterministic pass. It does not let whichever provider returns first decide the result.

## Normalized candidate sources

Every resolution includes exactly one **standalone** candidate and zero or more meeting candidates:

- `explicit`: a meeting supplied or selected directly by the user;
- `slack_huddle`: an active supported Slack huddle-state signal;
- `google_calendar`: an event returned from the narrow Calendar overlap query;
- `standalone`: no meeting.

Each persisted candidate records:

- source;
- owner-scoped meeting ID, when applicable;
- integer score from 0–100;
- confidence label;
- structured evidence signals;
- whether it is selected.

The note separately records:

- `context_source`;
- `context_confidence`;
- `context_resolution_status`: pending, attached, needs clarification, or standalone.

## Automatic attachment rule

A candidate is attached automatically only when:

1. its score is at least **85**; and
2. it leads the next meeting candidate by **more than 15 points**.

Otherwise Margin asks one narrow question.

This prevents a strong signal from silently defeating another nearly equivalent signal. For example, an active Slack huddle and one concurrent Calendar event remain ambiguous because Slack does not document that the huddle call ID maps to that Calendar event.

## Current scoring

### Explicit user context

| Evidence | Score | Confidence |
|---|---:|---|
| User supplies/selects a meeting | 100 | exact |

### Slack huddle

| Evidence | Score | Confidence |
|---|---:|---|
| Active huddle with call ID | 95 | exact |
| Active huddle without call ID | 92 | exact |

The score proves that the user is in a huddle, not its title or participant list. Missing metadata remains labeled unavailable.

### Google Calendar

Calendar scoring combines:

- active at the exact capture timestamp: 72 points;
- within the five-minute tolerance only: 42 points;
- returned from the connected primary calendar and not declined: 10 points;
- only Calendar candidate: 8 points when active, 5 when tolerance-only;
- title/token overlap with the note: at most 8 points.

Calendar candidates are capped at 92. Exact confidence is reserved for direct user selection or direct active-huddle state.

### Text-only evidence

A text-only helper is capped at **60** and can never produce high or exact confidence. The production resolver currently creates meeting candidates only from explicit, Calendar, or huddle evidence; token overlap is merely a bounded bonus.

## Confidence labels

| Score/evidence | Confidence |
|---|---|
| Direct exact evidence and score ≥95 | exact |
| Score ≥85 | high |
| Score ≥65 | medium |
| Score ≥40 | low |
| Lower | unresolved |

## Clarification behavior

When context is ambiguous or below the automatic threshold, the private note card asks:

> Which meeting was this from?

It displays up to the three highest-scored meeting candidates plus **No meeting**. The existing Meeting modal remains available for additional owner-scoped candidates.

A button click:

1. validates the workspace, user, note, candidate, DM channel, and card timestamp;
2. locks the note and candidate rows;
3. marks exactly one candidate selected;
4. updates the note to user-selected (`explicit`, exact) context, or standalone;
5. updates the existing Slack card with `chat.update`.

No new result message is posted.

## Persistence invariants

- Candidate replacement and note resolution commit in one transaction.
- Exactly one standalone candidate is required.
- Attached status requires a selected non-standalone meeting candidate.
- Pending or ambiguous status cannot have a selected candidate.
- At most one candidate per note may be selected.
- Candidate and meeting foreign keys include workspace and user ownership.
- A user cannot select another user's candidate or meeting.

## Edge cases

### Clear

One active Calendar event scores above 85 with no close competitor and attaches automatically.

### Ambiguous

Two overlapping events or a huddle plus concurrent Calendar event produce clarification buttons.

### Stale

An event found only through the tolerance window remains below the automatic threshold. The user can choose it or choose No meeting.

### No context

The standalone candidate is selected and note capture proceeds normally.

### Provider failure

Unavailable Calendar or Slack metadata contributes no candidate. Raw capture and note organization continue.

## Security and privacy

Candidate evidence stores booleans, bounded scores, temporal classifications, and numeric similarity—not raw Slack history or Calendar descriptions. Text overlap is calculated locally from the user-authored note and event title; raw note text is not copied into candidate evidence.
