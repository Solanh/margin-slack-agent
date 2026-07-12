# Interactive Private Note Card

Margin represents each capture as one updateable private Slack message.

## Message lifecycle

1. Margin stores the exact user message in PostgreSQL.
2. Margin posts one private processing card in the same DM thread.
3. Margin stores that bot message's DM channel ID and timestamp.
4. Margin refreshes supported context signals and persists scored candidates.
5. Margin organizes the note, using only automatically selected verified context.
6. Margin calls `chat.update` on the same bot message.
7. Clarification buttons, card actions, and modal submissions update that message again.

Margin does not post a second final-result message.

## Provenance in the card

The card distinguishes:

- **User-provided:** immutable original text.
- **AI-derived:** organized wording, type, priority, or reminder interpretation produced by the model.
- **User-edited:** derived fields changed directly by the user.
- **Google Calendar / Slack huddle:** source of automatically attached context.
- **User-selected:** context explicitly confirmed by the user.
- **Unresolved:** close candidates or missing evidence.
- **Standalone:** user chose No meeting or no candidate existed.

User-authored content is escaped before insertion into Slack markdown so note text cannot create mentions or links.

## Context clarification

When the resolution status is `needs_clarification`, the card asks:

> Which meeting was this from?

It renders up to the three highest-ranked meeting candidates and always includes **No meeting**.

Each button carries only a note ID and owner-scoped candidate ID. The handler:

1. acknowledges immediately;
2. verifies workspace, user, DM channel, note, candidate, and stored card location;
3. selects the candidate in a transaction;
4. marks meeting context user-selected/exact, or standalone;
5. updates the existing card.

The card does not show a candidate as verified before selection.

## Standard controls

### Edit

Opens a modal for the organized wording. Saving:

- leaves `raw_text` unchanged;
- switches to organized mode;
- removes `organizedText` from inferred provenance;
- appends a user revision;
- updates the existing card.

### Priority

A static select updates low, normal, high, or critical priority. A user choice removes priority from inferred provenance.

### Reminder

A modal records or clears the user's reminder wording. Actual scheduled delivery is implemented by later reminder work.

### Meeting

A modal lists owner-scoped scored candidates first and falls back to overlapping stored meetings. It always includes **No meeting**. A modal choice creates an explicit 100-point candidate or standalone selection.

### Keep verbatim / Use organized

Toggles `display_mode` without deleting the organized transformation or revision history.

## Privacy enforcement

- incoming note messages must use a Slack DM channel ID beginning with `D`;
- stored card references must point to a DM;
- action payloads and modal metadata must point to a DM;
- every note, meeting, and candidate read/update is scoped by workspace and user;
- card updates must match the stored channel and timestamp;
- no interaction posts into a shared channel.

## Failure behavior

- raw capture failure posts a visible failure response;
- card-post failure does not retry or duplicate raw capture;
- metadata or candidate failure does not block raw capture;
- model failure produces a verbatim final card when the processing card exists;
- card-reference persistence failure is logged but does not lose the note;
- action failures are logged and do not replace the card with a misleading success state.

## Slack scopes

`users:read` supports timezone lookup and current-user huddle profile refresh. If timezone lookup fails, Margin uses UTC.

## Current limitations

- reminder wording is stored but not yet delivered;
- the live Slack sandbox still requires manual visual verification;
- buttons show up to three candidates; the Meeting modal handles additional stored candidates;
- labels and date formatting are currently English / `en-US`.
