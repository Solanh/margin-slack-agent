# Slack Developer Sandbox Setup

This guide installs Margin in a Slack developer sandbox using Socket Mode. A successful note card means the exact original was persisted before organization began.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL configured according to [DATABASE_SETUP.md](DATABASE_SETUP.md)
- an OpenAI API key and structured-output-capable model
- a Slack workspace with Agent features available
- a fully featured developer sandbox if the normal workspace plan does not include the required Agent surfaces

Slack's Agent messaging experience uses the app's Messages tab. Margin subscribes to `app_home_opened`, `app_context_changed`, and `message.im`.

Official references:

- https://docs.slack.dev/ai/developing-agents/
- https://docs.slack.dev/reference/app-manifest/
- https://docs.slack.dev/tools/bolt-js/concepts/actions/
- https://docs.slack.dev/reference/methods/chat.update/

## 1. Create the Slack app from the manifest

1. Open https://api.slack.com/apps.
2. Select **Create New App**.
3. Choose **From an app manifest**.
4. Select the developer sandbox workspace.
5. Paste `manifest.json`.
6. Review and create the app.
7. Confirm that the Agent experience is enabled.

The manifest enables Agent View, writable Messages, App Home, Socket Mode, and interactivity.

## 2. Create an app-level Socket Mode token

1. In **Basic Information**, find **App-Level Tokens**.
2. Generate a token named `socket-mode`.
3. Add `connections:write`.
4. Copy the token beginning with `xapp-`.

## 3. Install or reinstall the app

The bot scopes are:

- `assistant:write`
- `chat:write`
- `im:history`
- `users:read`

`users:read` is used only to retrieve the current user's timezone. Reinstall the app after adding or changing scopes.

Copy:

- the bot token beginning with `xoxb-`;
- the Signing Secret from **Basic Information**.

## 4. Configure and run

```bash
cp .env.example .env
```

Set:

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
LOG_LEVEL=info
DATABASE_URL=postgresql://...
AI_API_KEY=...
AI_MODEL=...
```

Then run:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run migrate
npm start
```

A successful connection prints:

```text
Margin is connected to Slack, PostgreSQL, and note organization.
```

## 5. Verify the private note card

1. Open Margin's **Messages** tab.
2. Send:

   ```text
   Important: ask whether migration affects customer-created workflows. Remind me before planning.
   ```

3. Confirm Margin posts one processing card in the same private thread.
4. Confirm that message updates in place rather than producing a second final message.
5. Confirm the final card shows:
   - organized wording;
   - original wording labeled **User-provided · immutable**;
   - type and priority provenance;
   - reminder state;
   - unresolved meeting context when no meeting record exists;
   - edit, priority, reminder, meeting, and verbatim controls.
6. Select **Keep verbatim**, then **Use organized**, and confirm the same message updates both times.
7. Edit the organized wording and confirm the original does not change.
8. Change priority and confirm its provenance changes to **User-edited**.
9. Open the reminder modal, save wording, then clear it.
10. Open the meeting modal. Before Calendar integration, **No meeting** may be the only available choice.

## 6. Verify privacy and durability

- Query `notes` and confirm `raw_text` exactly matches the Slack message.
- Confirm `card_channel_id` begins with `D`.
- Confirm `note_revisions` includes `ai` and `user` revisions after edits.
- Try a repository-level non-DM card reference and confirm it is rejected.
- Replay the same Slack event and confirm only one note row exists.
- Stop PostgreSQL and confirm Margin never claims an unsaved note succeeded.
- Confirm logs do not contain note text.

## Troubleshooting

### Agent View or actions are missing

Apply the latest manifest and reinstall the app. Confirm `assistant:write` and interactivity are enabled.

### Messages are not received

Confirm `message.im`, `im:history`, and a connected Socket Mode process.

### Note card stays on “Organizing”

Check `AI_API_KEY`, `AI_MODEL`, model access, and application logs. The raw note remains stored even when organization fails.

### Buttons work but the message does not update

Confirm the bot has `chat:write`, the card is in a DM channel beginning with `D`, and the stored card timestamp matches the interacted message.

### Time displays in UTC

Confirm `users:read` was added and the app was reinstalled. Margin falls back to UTC when Slack timezone lookup fails.

### Database migration fails

Confirm PostgreSQL is reachable and the database user can create tables, constraints, indexes, functions, and triggers.

## Known limitation

Actual sandbox installation and visual verification require workspace credentials. The repository contains the manifest, implementation, migrations, automated tests, and verification steps.
