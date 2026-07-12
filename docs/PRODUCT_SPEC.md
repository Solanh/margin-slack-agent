# Product Specification

## Product statement

Margin is a private meeting-memory agent inside Slack. It turns user-authored micronotes into organized, contextual, retrievable memory without recording the meeting or silently changing what the user wrote.

## Target user

A Slack-heavy knowledge worker who:

- spends much of the day in huddles and scheduled meetings;
- already sends messages to themselves as scratch notes;
- wants capture to take only a few seconds;
- does not want a bot recording every conversation;
- needs selected notes to return later with the correct context.

## Job to be done

> When someone says something I want to remember during a meeting, let me capture it without leaving Slack, preserve exactly what I meant, and bring it back when I need it.

## Product wedge

The wedge is **selective personal capture**, not meeting summarization.

Meeting transcription products decide what to preserve after ingesting everything. Margin lets the user identify the important signal at the moment it occurs. The AI performs organization, classification, and retrieval around that signal.

## Primary user story

1. The user is in a Slack huddle or calendar meeting.
2. The user DMs Margin a rough sentence.
3. Margin writes the exact original text durably before invoking AI.
4. Margin identifies the active meeting from available context.
5. Margin produces a structured derived note.
6. Margin replies privately with the result and lightweight controls.
7. Margin includes the note in a post-meeting digest.
8. Margin resurfaces unresolved notes before the next related meeting.

## Functional requirements

### FR-1: Fast capture

- A normal DM to the app is treated as a note unless it is clearly a retrieval or settings command.
- Capture must not require a modal or slash-command syntax.
- Slack acknowledgment should occur promptly.
- The raw note is stored before enrichment.

### FR-2: Original preservation

Each note contains:

- immutable `raw_text`;
- AI-generated `organized_text`;
- transformation version;
- timestamp;
- context and provenance;
- edit history for user changes.

The organized version may be regenerated. The raw version may not be overwritten.

### FR-3: Context resolution

Margin evaluates context in this order:

1. explicit meeting chosen by the user;
2. a current Google Calendar event;
3. active Slack huddle state;
4. Slack app context signal;
5. standalone note.

Context confidence is stored. If two events are plausible, Margin asks one compact clarification question.

### FR-4: Structured transformation

The model returns a strict schema:

- `organized_text`
- `note_type`: `decision`, `action`, `question`, `idea`, or `reference`
- `priority`: `low`, `normal`, `high`, or `critical`
- `reminder_intent`
- `explicit_due_at`
- `inferred_fields`
- `uncertainties`

The model must not silently invent speakers, owners, due dates, projects, or decision status.

### FR-5: Interactive note card

The Slack response shows:

- organized note;
- meeting title/date if resolved;
- type and priority;
- reminder state;
- visible indication that the original is preserved;
- actions for edit, priority, reminder, meeting context, and verbatim mode.

### FR-6: Digest

At meeting end, Margin privately sends a concise digest grouped by:

- decisions;
- actions;
- open questions;
- references.

The digest only includes notes the user captured.

### FR-7: Proactive resurfacing

Before the next related meeting, Margin can surface unresolved questions and pending actions from prior meetings.

This is opt-in and must be suppressible per meeting, project, or globally.

### FR-8: Retrieval

The user can ask natural-language questions such as:

- “What did I note about customer workflows?”
- “Show my unresolved questions from planning.”
- “What did I write down last time I met with Geva?”

Results show both the organized note and access to the original.

### FR-9: App Home

The Home surface shows:

- recent notes;
- unresolved actions/questions;
- upcoming resurfacing;
- filters by meeting, type, and priority;
- privacy/settings controls.

## Non-functional requirements

### Reliability

- Raw capture must succeed even when AI formatting fails.
- Duplicate Slack retries must not create duplicate notes.
- Event processing must be idempotent.
- Context and AI failures degrade to a standalone verbatim note.

### Privacy

- Notes are private by default.
- The app never joins, records, or transcribes a huddle.
- Calendar access is least-privilege.
- Workspace administrators can understand retention and deletion behavior.
- Users can delete/export their data.

### Trust

- Every inferred field is distinguishable from user-provided data.
- The original is always retrievable.
- AI output is not presented as a verbatim quote.
- No speaker attribution without explicit evidence.

### Latency targets

- capture acknowledgment: under 2 seconds;
- structured response: target under 8 seconds;
- retrieval: target under 5 seconds.

## MVP acceptance criteria

A successful MVP demonstrates:

1. a DM note captured during a meeting;
2. raw text stored before transformation;
3. correct meeting automatically selected;
4. organized note returned without meaning-changing additions;
5. priority/reminder changed from Slack controls;
6. notes shown in a post-meeting digest;
7. one note resurfaced before a later related meeting;
8. retrieval returns original plus organized versions.

## Explicit non-goals

- audio capture or transcription;
- full meeting summaries;
- shared notes by default;
- generic team task management;
- automatic action assignment to coworkers;
- broad company-knowledge search;
- dozens of export integrations;
- autonomous follow-up messages to other people.
