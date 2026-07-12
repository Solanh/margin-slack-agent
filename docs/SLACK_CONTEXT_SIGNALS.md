# Slack Huddle and Agent-Context Signals

Margin uses two official Slack signals to improve meeting context without recording a meeting or reading unrelated conversation history.

## Supported signals

### `user_huddle_changed`

Slack emits this event when a user's huddle state changes. The user profile currently exposes:

- `huddle_state`;
- `huddle_state_expiration_ts`;
- optional `huddle_state_call_id`.

Margin stores only:

- workspace and user ownership;
- whether the user was observed in a huddle;
- the opaque call ID when supplied;
- observation time;
- expiration time;
- source event timestamp.

Margin does not receive or infer a native huddle title, channel, participant list, audio, transcript, or true start time from this event.

Because the event is workspace-wide, Margin discards events for users who have no existing Margin note or connected integration. During a private note capture, Margin also refreshes the current user's profile through `users.info`; this allows first-use capture to detect the user's current huddle state after the raw note has established ownership.

### `app_context_changed` and `app_context`

Agent View emits ordered entities representing what the user is currently viewing. Supported entity types include channels, messages, canvases, and lists. Margin stores only the first supported channel or message entity:

- channel ID;
- optional message timestamp;
- observation and expiration times.

Canvas and list entities are ignored for the meeting-context MVP. Margin does not retrieve the channel name, message body, thread, channel history, or participant activity.

The cached active view expires after 15 minutes. It is a weak disambiguation signal only; it does not prove that a huddle belongs to that channel.

## Huddle attachment rules

When a note is captured:

1. Preserve the exact raw note.
2. Refresh the current user's Slack profile and cache supported `app_context` data.
3. Resolve and retain Calendar candidates.
4. Check whether the user was actively in a huddle at capture time.
5. When active huddle evidence exists, attach a Slack-huddle meeting record using:
   - provider: `slack_huddle`;
   - opaque call ID when available;
   - title: `Slack huddle (title unavailable)`;
   - empty participants list;
   - observed start and expiration bounds;
   - exact confidence for the active-state observation.
6. Keep active-view context separate from the huddle record.

A verified current huddle becomes the selected context instead of a scheduled Calendar event because it is direct current-state evidence. Calendar candidates remain stored and available through the meeting picker.

## Expiration and stale-state controls

- Slack-reported expiration is used when valid.
- Missing or stale expiration receives a 30-minute fallback.
- A reported state is capped at eight hours.
- Repeated observations of the same call preserve the earliest observation and latest valid expiration.
- A leave event deletes the cached huddle immediately.
- Expired huddle and view rows are deleted at startup and through the repository cleanup operation.

## Calls API decision

Margin does not call `calls.info` for native huddles and does not request `calls:read`.

Slack documents `calls.info` for Calls API records identified by IDs returned from `calls.add`. Slack does not document `huddle_state_call_id` as compatible with that API. The call ID is therefore treated only as an opaque provider identifier.

A developer may manually probe this in a sandbox, but the production implementation does not rely on undocumented behavior. A failed or unsupported probe would not change the note workflow.

## Failure behavior

All Slack metadata is optional:

- event not delivered;
- `users.info` unavailable;
- huddle fields absent;
- call ID absent;
- active-view context absent or unsupported;
- cache unavailable;
- stale/expired data.

In every case, raw capture and organization continue using Calendar context when available or a standalone note otherwise.

## Privacy properties

- no audio or transcript access;
- no channel-history request;
- no message-body retrieval from active-view context;
- no participant invention;
- no title invention;
- no workspace-wide retention for unknown Margin users;
- short-lived owner-scoped caches;
- no additional Calls API scope.

## Sandbox verification

1. Apply migrations through `006_slack_context_signals.sql`.
2. Apply the latest Slack manifest and reinstall the app.
3. Confirm `user_huddle_changed` is subscribed and `users:read` remains present.
4. Start a huddle, then send Margin a private note.
5. Confirm the card shows `Slack huddle (title unavailable)` and no participant names.
6. End the huddle and capture another note; confirm no huddle is attached.
7. Open Margin while viewing a channel or message and confirm only the ID/timestamp cache changes.
8. Disable or interrupt Slack metadata access and confirm note capture still succeeds.
9. Confirm the manifest does not include `calls:read`.
