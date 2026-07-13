# Margin MCP server

Margin includes a small Model Context Protocol server that exposes one user's private notes and reminder state to an existing MCP-capable LLM. The MCP process does not call OpenAI, Anthropic, Slack AI, or another model API. The host application supplies the model.

This makes prompts such as these possible:

- "What notes did I take today?"
- "What were my notes from the planning meeting?"
- "What do I still need to do?"
- "Remind me tomorrow at 9:00 AM Eastern to check ngrok."
- "Cancel my pending ngrok reminder."

## Why tools instead of another embedded LLM

MCP tools are discovered and invoked by the model already running in the host application. Margin performs deterministic, owner-scoped PostgreSQL operations and returns structured data. The host model handles natural-language interpretation, summarization, and reasoning.

Reminder creation is intentionally split from delivery. The MCP process persists a reminder; the main Margin application later delivers it through the installed Slack bot. The MCP client does not need Slack credentials and does not need to remain connected until the reminder fires.

The implementation follows the MCP JSON-RPC lifecycle and tool messages for protocol revisions `2025-11-25`, `2025-06-18`, and `2025-03-26` over stdio.

Official references:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://docs.slack.dev/ai/slackbot-mcp-client/

## Note tools

### `margin.search_notes`

Searches private notes by date, meeting-title substring, raw or organized text, note type, priority, and status.

### `margin.list_open_notes`

Returns all open notes, including verbatim fallback notes that were never AI-classified. The host LLM can identify obligations from those notes.

### `margin.get_note`

Returns one note by UUID with its immutable original and complete metadata.

These tools are read-only, non-destructive, idempotent, and closed-world.

## Reminder tools

### `margin.list_reminders`

Lists fixed-time reminders and their current delivery status. Models should use this before selecting a reminder to cancel.

### `margin.create_reminder`

Creates a fixed-time reminder from either:

- an existing owner-scoped Margin note ID; or
- new exact reminder text, which is preserved as a new immutable Margin note.

The input must contain an exact ISO 8601 timestamp with an explicit timezone or UTC offset, such as:

```text
2026-07-14T09:00:00-04:00
```

The tool rejects timezone-free timestamps and times more than five minutes in the past. A model should ask a clarification question rather than guessing when the date, time, or timezone is ambiguous.

Equivalent repeated calls are idempotent: owner, note/text, and normalized scheduled time produce the same persisted reminder.

This tool is annotated as a non-destructive write action with an external future effect. MCP hosts may ask the user to confirm it.

### `margin.cancel_reminder`

Cancels one pending or snoozed reminder by UUID. Sent reminders cannot be cancelled. This tool is annotated as a destructive, idempotent write action because it removes a future notification.

## Owner isolation

The process is permanently scoped at startup to one Slack workspace/user pair:

```dotenv
DATABASE_URL=postgresql://margin:margin@localhost:5432/margin
MARGIN_MCP_WORKSPACE_ID=T_REAL_WORKSPACE
MARGIN_MCP_USER_ID=U_REAL_USER
MARGIN_MCP_TIME_ZONE=America/New_York
```

For the deterministic sandbox, `MARGIN_MCP_WORKSPACE_ID` and `MARGIN_MCP_USER_ID` may be omitted; the process falls back to `DEMO_WORKSPACE_ID` and `DEMO_USER_ID`.

Every SQL operation includes both owner fields. Tool callers cannot supply or override a workspace or user ID.

The MCP process loads only:

- `DATABASE_URL`;
- the configured workspace/user owner;
- the default timezone.

It does not require `AI_API_KEY`, `AI_MODEL`, Slack tokens, Google credentials, or the token-encryption key.

The separately running main Margin application requires its normal Slack credentials to deliver due reminders.

## Build and run

Apply migrations and build:

```bash
npm run migrate
npm run build
```

Run the main Slack application so due reminders can be delivered:

```bash
npm start
```

In a separate process, run the MCP server:

```bash
npm run --silent mcp
```

`--silent` matters when launching through npm because MCP stdio reserves stdout for JSON-RPC. The server writes diagnostics only to stderr.

For an MCP client, invoking Node directly is simpler:

```text
node /absolute/path/to/margin-slack-agent/dist/mcp/server.js
```

The working directory should be the repository directory so `dotenv` can load `.env`.

## Example local client configuration

```json
{
  "mcpServers": {
    "margin": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /absolute/path/to/margin-slack-agent && exec node dist/mcp/server.js"
      ]
    }
  }
}
```

Claude Desktop, Claude Code, Codex, compatible IDEs, and other stdio MCP clients use equivalent command/argument settings.

## ChatGPT and Slackbot

This version is local stdio only. ChatGPT custom apps and Slackbot expect a remote HTTPS MCP endpoint with an authentication model. A remote version must derive the owner from the authenticated caller rather than exposing the fixed-owner local server.

Slackbot and other MCP hosts can use the existing LLM while Margin supplies private note and reminder tools. Write-tool confirmation and authorization should remain enabled.

## Security boundaries

- Note retrieval is read-only.
- Reminder writes are limited to create and cancel; there is no arbitrary SQL, Slack-send, delete-note, or data-export tool.
- Owner identity is server configuration, not model input.
- New reminder text is preserved as an immutable Margin note.
- Exact timezone-aware timestamps are required.
- Results contain private note text, so connect the server only to an LLM host you trust.
- Do not expose the stdio process through an unauthenticated network wrapper.
- Margin reminder delivery is at-least-once; see `docs/REMINDER_DELIVERY.md` for retry semantics.
