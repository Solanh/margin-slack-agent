# Post-Meeting Digests

Margin sends a private review after a verified meeting ends, using only notes that the same Slack user deliberately captured and attached to that meeting.

## Eligibility

A digest is prepared only when:

- the meeting end time has passed;
- at least one owner-scoped note references the meeting;
- post-meeting digests are enabled for that workspace/user;
- no digest row already exists for the same owner and meeting.

Meetings without captured notes do not create queue rows.

## Content

Digest text is deterministic and does not require an LLM. Notes are grouped into:

- decisions;
- actions;
- open questions;
- ideas;
- references.

Each item displays current status, non-default priority, and reminder wording or timestamp when present. The organized note is shown when available; the immutable original remains stored as the authoritative source.

Margin does not add transcript content, channel history, Calendar descriptions, attendee messages, or notes captured by another user.

## Delivery

The database-backed worker:

1. prepares eligible rows;
2. atomically claims due rows with `FOR UPDATE SKIP LOCKED`;
3. opens the note owner's Slack DM;
4. posts the digest, or updates its previously stored message after snooze;
5. stores the private channel and message timestamp;
6. retries failures with bounded exponential backoff.

Processing locks older than ten minutes return to pending state. The unique owner/meeting constraint prevents duplicate digests.

## Controls

- **Review all** opens an owner-scoped modal containing the grouped notes.
- **Snooze digest** reschedules the same digest for one hour and later updates the same Slack message.
- **Disable digests** changes the owner's global preference. The resulting private message provides a one-tap re-enable control.

All action payloads must originate from a Slack DM and all repository operations require both workspace and user identifiers.

## Migration

Issue #9 requires:

```text
008_post_meeting_digests.sql
```

Development rollback:

```bash
psql "$DATABASE_URL" -f migrations/rollback/008_post_meeting_digests.sql
```
