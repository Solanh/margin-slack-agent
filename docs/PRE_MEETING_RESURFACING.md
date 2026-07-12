# Pre-Meeting Resurfacing

Margin privately resurfaces unresolved actions and questions before the next verified instance of the same Google Calendar meeting series.

## Matching contract

Margin does not infer a future meeting from note wording or title similarity.

A resurfacing can be prepared only when:

1. Google Calendar is connected with `calendar.events.readonly`;
2. the upcoming event is returned by the Calendar API;
3. the event has a verified `iCalUID`, normalized as a `google:<iCalUID>` series key;
4. an earlier owner-scoped meeting has the same series key;
5. the latest eligible prior meeting contains at least one open action or question captured by that owner;
6. global and per-series resurfacing preferences are enabled.

Recurring instances have distinct Google event IDs but share the same `iCalUID`. One-off events may have a unique series key but will not match a prior instance unless the same verified key already exists.

## Scheduling

The worker checks connected Calendar owners and looks ahead 24 hours. Eligible notifications are scheduled ten minutes before the upcoming meeting. Database uniqueness permits only one resurfacing row per owner and upcoming event.

If Calendar access is missing or fails, or if an event lacks a verified series key, Margin creates no reminder. It does not substitute a guessed title or note-text match.

## Content

Only open `action` and `question` notes from the latest eligible prior meeting are included. Each item shows:

- organized wording when available;
- current open status;
- non-default priority;
- reminder wording when present;
- prior meeting title and date.

The immutable original remains stored. No transcript, Slack channel history, Calendar description, or other user's notes are included.

## Controls

- **Mark resolved** resolves the included open actions and questions.
- **Snooze** reschedules the same private message, bounded to before the upcoming meeting when possible.
- **Open notes** opens an owner-scoped review modal.
- **Mute series** disables future resurfacing for the verified series key.
- **Disable all** disables pre-meeting resurfacing for the owner.

All interactions require the owner's Slack DM and every database query includes workspace and user ownership.

## Deterministic demo

After applying migrations through 009:

```bash
DEMO_WORKSPACE_ID=T_REAL_WORKSPACE \
DEMO_USER_ID=U_REAL_USER \
npm run demo:seed:resurfacing
```

The command creates:

- a prior Planning meeting;
- an upcoming Planning instance twelve minutes in the future;
- the same fixed verified series key on both meetings;
- one open action and one open question on the prior meeting;
- a due resurfacing row.

Run the Margin app with the same installed workspace/user identifiers. The worker delivers the seeded private pre-meeting message without depending on live Calendar timing.

## Migration

Issue #10 requires:

```text
009_pre_meeting_resurfacing.sql
```

Development rollback:

```bash
psql "$DATABASE_URL" -f migrations/rollback/009_pre_meeting_resurfacing.sql
```
