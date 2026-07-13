# Slack Developer Sandbox Setup

This guide installs Margin in a Slack developer sandbox using Socket Mode. A successful note card means the exact original was persisted before organization began.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL configured according to [DATABASE_SETUP.md](DATABASE_SETUP.md)
- an OpenAI API key and structured-output-capable model
- optional Google OAuth configuration for live Calendar matching
- a Slack workspace with Agent features available
- a fully featured developer sandbox if the normal workspace plan does not include the required Agent surfaces

Margin subscribes to:

- `app_home_opened`;
- `app_context_changed`;
- `message.im`;
- `user_huddle_changed`.

Official references:

- https://docs.slack.dev/ai/developing-agents/
- https://docs.slack.dev/ai/agent-context-management/
- https://docs.slack.dev/reference/events/user_huddle_changed/
- https://docs.slack.dev/reference/app-manifest/
- https://docs.slack.dev/tools/bolt-js/concepts/actions/
- https://docs.slack.dev/reference/methods/chat.update/
- https://docs.slack.dev/reference/methods/conversations.open/

## 1. Create or update the Slack app

1. Open https://api.slack.com/apps.
2. Select **Create New App** or the existing Margin app.
3. For a new app, choose **From an app manifest**.
4. Select the developer sandbox workspace.
5. Apply `manifest.json`.
6. Confirm that Agent View, writable Messages, App Home, Socket Mode, interactivity, and all four event subscriptions are enabled.

## 2. Create an app-level Socket Mode token

1. In **Basic Information**, find **App-Level Tokens**.
2. Generate a token named `socket-mode`.
3. Add `connections:write`.
4. Copy the token beginning with `xapp-`.

## 3. Install or reinstall the app

The bot scopes are:

- `assistant:write`
- `chat:write`
- `files:write`
- `im:history`
- `im:write`
- `users:read`

`im:write` is required by Slack's `conversations.open` method, which Margin uses to deliver owner-only digests, resurfacing, exports, and prepared demo cards. `files:write` is used only for private user-requested data exports. `users:read` supports timezone lookup, current-user huddle profile refresh, and the `user_huddle_changed` event. The manifest intentionally does not request `calls:read`.

Reinstall the app after applying the latest event subscriptions or scopes.

Copy:

- the bot token beginning with `xoxb-`;
- the Signing Secret from **Basic Information**.

## 4. Configure and run

```bash
cp .env.example .env
```

Set the Slack, database, AI, and encryption variables described in `.env.example`. Google OAuth is optional; set `GOOGLE_CALENDAR_ENABLED=false` and omit the Google values when running without live Calendar matching.

Then run:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run migrate
npm start
```

A successful connection prints that Slack, PostgreSQL, note organization, and expiring Slack context signals are active. When Calendar is enabled, Google OAuth and the resurfacing worker are also active.

## 5. Verify the private note card

1. Open Margin's **Messages** tab.
2. Send a private note.
3. Confirm Margin posts one processing card and updates that same message.
4. Confirm the original is labeled **User-provided · immutable**.
5. Verify edit, priority, reminder, meeting, and verbatim controls.
6. Confirm all card actions remain in the DM.

## 6. Verify Calendar context

Follow [GOOGLE_CALENDAR.md](GOOGLE_CALENDAR.md). Confirm one unambiguous event attaches, overlapping events remain choices, and disconnected or unavailable Calendar leaves a standalone note.

When Calendar is disabled, confirm the App Home state says it is unavailable and that note capture, huddle context, private retrieval, and post-meeting digests still work.

## 7. Verify Slack huddle context

1. Reinstall the latest manifest so `user_huddle_changed` is active.
2. Start a Slack huddle as the test user.
3. Send Margin a private note during the huddle.
4. Confirm the note card attaches:

   ```text
   Slack huddle (title unavailable)
   ```

5. Confirm no participant names, channel title, audio, or transcript appear.
6. End the huddle and capture another note; confirm no huddle attaches.
7. Start a scheduled Calendar event and a huddle simultaneously. Confirm the candidates produce the documented deterministic selection or clarification behavior rather than provider-order guessing.
8. Interrupt `users.info` or omit huddle metadata and confirm note capture still completes.

## 8. Verify Agent active-view context

1. Open Margin's Agent View while viewing a Slack channel or message.
2. Trigger navigation among supported views.
3. Inspect `slack_active_contexts` and confirm only:
   - owner IDs;
   - entity type;
   - channel ID;
   - optional message timestamp;
   - observation and expiration times.
4. Confirm no message body, channel name, canvas/list content, or history is stored.
5. Confirm active-view context alone does not create a huddle meeting.

## 9. Verify privacy and durability

- `notes.raw_text` exactly matches the private message.
- Card channel IDs begin with `D`.
- Huddle rows exist only for users who already own Margin data.
- Leaving a huddle deletes its active row.
- Expired context rows are ignored and removed by cleanup.
- `manifest.json` does not contain `calls:read`.
- Logs do not contain note text, huddle payloads, tokens, authorization codes, or active-view content.

## 10. Run submission preflight

Set real Slack IDs for the sandbox and human demo user:

```bash
export DEMO_WORKSPACE_ID='T_REAL_WORKSPACE'
export DEMO_USER_ID='U_REAL_USER'
```

After preparing and optionally publishing the deterministic demo data:

```bash
npm run preflight
```

While the final Margin process is running:

```bash
npm run preflight:live
```

The live preflight verifies environment configuration, PostgreSQL, migrations, seeded demo state, Slack workspace/user/DM access, Calendar connection when enabled, and `/healthz` plus `/readyz`.

See [FINAL_SUBMISSION_RUNBOOK.md](FINAL_SUBMISSION_RUNBOOK.md) for the complete recording and Devpost procedure.

## Troubleshooting

### Huddle context never appears

Apply and reinstall the latest manifest. Confirm `users:read` and `user_huddle_changed`. The event does not provide a verified title or participants; Margin deliberately uses a title-unavailable label.

### Active view is absent

Confirm Agent View is enabled and `app_context_changed` is subscribed. Unsupported canvas/list context is intentionally discarded.

### A native huddle call ID is not resolved

Expected. Margin does not call `calls.info`; Slack documents that API for Calls records created through `calls.add`, not native `huddle_state_call_id` values.

### Messages are not received

Confirm `message.im`, `im:history`, and a connected Socket Mode process.

### Private digest or resurfacing cannot open a DM

Reinstall the current manifest and confirm `im:write` is present. Also confirm the bot token belongs to the same workspace as `DEMO_WORKSPACE_ID`. Run `npm run preflight` to verify `conversations.open` can resolve the human demo user's private DM.

### Note card stays on “Organizing”

Check AI configuration and logs. Raw capture remains durable even when context or organization fails.

### Time displays in UTC

Confirm `users:read` and reinstall the app. UTC is the safe fallback.

### Database migration fails

Confirm PostgreSQL is reachable and the database user can create tables, constraints, indexes, functions, and triggers.

## Known limitation

Actual sandbox installation, live huddle behavior, and visual verification require workspace credentials. The repository contains the manifest, implementation, migrations, automated tests, deterministic fallback publisher, preflight command, and exact verification procedure.
