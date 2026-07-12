# Slack Developer Sandbox Setup

This guide installs the issue #1 application shell in a Slack developer sandbox using Socket Mode. The shell verifies Agent View messages and App Home rendering; it does not persist notes yet.

## Prerequisites

- Node.js 20 or newer
- A Slack workspace with Agent features available
- A fully featured developer sandbox if your normal workspace plan does not include the required AI surfaces

Slack's current Agent messaging experience uses the app's Messages tab. New agent apps use `features.agent_view` and subscribe to `app_home_opened`, `app_context_changed`, and `message.im`.

Official references:

- https://docs.slack.dev/ai/developing-agents/
- https://docs.slack.dev/reference/app-manifest/
- https://docs.slack.dev/tools/bolt-js/concepts/publishing-views/

## 1. Create the Slack app from the manifest

1. Open https://api.slack.com/apps.
2. Select **Create New App**.
3. Choose **From an app manifest**.
4. Select the developer sandbox workspace.
5. Paste the contents of `manifest.json`.
6. Review and create the app.
7. Open the app's **Agents** configuration and confirm that the Agent experience is enabled.

The manifest enables:

- Agent View
- writable Messages tab
- Home tab
- Socket Mode
- interactive components
- `app_home_opened`, `app_context_changed`, and `message.im`

## 2. Create an app-level Socket Mode token

1. In **Basic Information**, find **App-Level Tokens**.
2. Generate a token named `socket-mode`.
3. Add the `connections:write` scope.
4. Copy the token beginning with `xapp-`.

## 3. Install the app

1. Open **OAuth & Permissions**.
2. Select **Install to Workspace** or **Reinstall to Workspace**.
3. Copy the bot token beginning with `xoxb-`.
4. In **Basic Information**, copy the **Signing Secret**.

The bot scopes from `manifest.json` are:

- `assistant:write`
- `chat:write`
- `im:history`

## 4. Configure and run locally

```bash
cp .env.example .env
```

Set:

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
LOG_LEVEL=info
```

Then run:

```bash
npm install
npm run typecheck
npm test
npm run build
npm start
```

A successful connection prints:

```text
Margin is connected to Slack through Socket Mode.
```

## 5. Verify issue #1

### Agent View message

1. Open Margin in Slack.
2. Select the **Messages** tab.
3. Send: `Important: ask whether this affects customer-created workflows.`
4. Confirm Margin replies in the message thread with a Block Kit acknowledgement.
5. Confirm the acknowledgement states that durable storage is not enabled yet.

### App Home

1. Select Margin's **Home** tab.
2. Confirm the placeholder view displays the privacy promise and prototype status.

### Context event

1. Keep Margin's Agent View open.
2. Navigate among Slack channels or DMs.
3. With `LOG_LEVEL=debug`, confirm an `app_context_changed` event is received without logging context contents.

## Troubleshooting

### `not_allowed_token_type` or missing Agent View

Reinstall the app after applying the manifest and confirm the `assistant:write` scope is present.

### Socket Mode does not connect

Confirm `SLACK_APP_TOKEN` begins with `xapp-`, has `connections:write`, and Socket Mode is enabled.

### Messages are not received

Confirm the app is subscribed to `message.im`, has `im:history`, and has been reinstalled after scope or event changes.

### Home tab remains empty

Confirm `app_home_opened` is subscribed and the local process is connected before reopening the Home tab.

## Known limitation

This issue can provide the complete application shell and verification procedure, but actual sandbox installation requires workspace credentials and must be performed by a workspace member.
