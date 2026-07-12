# Interactive Private Note Card

Issue #5 turns a durable raw capture into one updateable Slack message.

## Message lifecycle

1. Margin stores the exact user message in PostgreSQL.
2. Margin posts one private processing card in the same DM thread.
3. Margin stores that bot message's DM channel ID and timestamp.
4. Margin organizes the note.
5. Margin calls `chat.update` on the same bot message with the final card.
6. Later actions and modal submissions update that same message again.

Margin does not post a second “final” result message.

## Provenance in the card

The card distinguishes:

- **User-provided:** immutable original text.
- **AI-derived:** organized wording, type, priority, or reminder interpretation still produced by the model.
- **User-edited:** derived fields that the user changed directly.
- **Verified:** meeting context loaded from an owner-scoped meeting record.
- **Unresolved:** missing meeting context or model-identified ambiguity.

User-authored content is escaped before insertion into Slack markdown so note text cannot create mentions or links through Block Kit rendering.

## Controls

### Edit

Opens a modal for the organized wording. Saving:

- leaves `raw_text` unchanged;
- switches the display to organized mode;
- removes `organizedText` from the inferred-field set;
- appends a user revision;
- updates the existing card.

### Priority

A static select updates low, normal, high, or critical priority. A user choice removes priority from the inferred-field set.

### Reminder

A modal records or clears the user's reminder wording. Issue #5 stores the intent and provenance; actual scheduled delivery is implemented by the reminder workflow.

### Meeting

A modal lists owner-scoped meetings that overlap the note capture time, plus **No meeting**. Calendar and huddle integrations populate these meeting records in later issues.

### Keep verbatim / Use organized

This toggles `display_mode` without deleting the organized transformation or revision history. The operation is reversible.

## Privacy enforcement

- incoming note messages must have a Slack DM channel ID beginning with `D`;
- stored card references must point to a DM;
- action payloads and modal metadata must point to a DM;
- every read and update is scoped by workspace and user;
- a card update must match the stored channel and message timestamp when a stored reference exists;
- no interaction handler posts into a shared channel.

## Failure behavior

- raw capture failure posts a visible failure response;
- card-post failure does not retry or duplicate raw capture;
- model failure produces a verbatim final card when the processing card exists;
- card-reference persistence failure is logged but does not lose the note;
- action failures are logged and do not replace the card with a misleading success state.

## Slack scopes

Issue #5 adds `users:read` to retrieve the user's Slack timezone for date rendering and transformation context. If timezone lookup fails, Margin uses UTC.

## Current limitations

- reminder wording is stored but not yet delivered;
- meeting choices depend on records created by future Calendar/huddle work;
- the live Slack sandbox still requires installation and manual visual verification;
- the card currently uses English labels and `en-US` date formatting.
