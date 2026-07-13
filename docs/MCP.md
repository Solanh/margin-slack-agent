# Margin read-only MCP server

Margin includes a small Model Context Protocol server that exposes one user's private notes to an existing MCP-capable LLM. The MCP process does not call OpenAI, Anthropic, Slack AI, or any other model API. The host application supplies the model and uses Margin only as a read-only data source.

This makes prompts such as these possible:

- "What notes did I take today?"
- "What were my notes from the planning meeting?"
- "What do I still need to do?"
- "Show the original text for this note."

## Why tools instead of another embedded LLM

MCP tools are discovered and invoked by the model already running in the host application. Margin performs deterministic, owner-scoped PostgreSQL queries and returns structured note data. The host model is responsible for summarization, action extraction, and follow-up reasoning.

The implementation follows the MCP JSON-RPC lifecycle and tool messages for protocol revisions `2025-11-25`, `2025-06-18`, and `2025-03-26` over stdio.

Official references:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://docs.slack.dev/ai/slackbot-mcp-client/

## Tools

### `margin.search_notes`

Searches private notes by any combination of:

- local calendar date and timezone;
- ISO timestamp range;
- meeting-title substring;
- raw or organized note text;
- note type;
- priority;
- status.

Results include the immutable original text, organized text when available, classification, priority, status, reminders, uncertainty, context state, and attached meeting metadata.

### `margin.list_open_notes`

Returns all open notes, including verbatim fallback notes that were never AI-classified. This is intentionally broader than an `action`-only query so the host LLM can identify obligations from notes captured while the embedded transformation provider was unavailable.

### `margin.get_note`

Returns one note by UUID with its immutable original and complete metadata.

All three tools declare read-only, non-destructive, idempotent, closed-world annotations.

## Owner isolation

The process is permanently scoped at startup to one Slack workspace/user pair:

```dotenv
DATABASE_URL=postgresql://margin:margin@localhost:5432/margin
MARGIN_MCP_WORKSPACE_ID=T_REAL_WORKSPACE
MARGIN_MCP_USER_ID=U_REAL_USER
MARGIN_MCP_TIME_ZONE=America/New_York
```

For the deterministic sandbox, `MARGIN_MCP_WORKSPACE_ID` and `MARGIN_MCP_USER_ID` may be omitted; the process falls back to `DEMO_WORKSPACE_ID` and `DEMO_USER_ID`.

Every SQL query includes both owner fields. Tool callers cannot supply or override a workspace or user ID.

The MCP process loads only:

- `DATABASE_URL`;
- the configured workspace/user owner;
- the default timezone.

It does not require `AI_API_KEY`, `AI_MODEL`, Slack tokens, Google credentials, or the token-encryption key.

## Build and run

```bash
npm run build
npm run --silent mcp
```

`--silent` matters when launching through npm because MCP stdio reserves stdout for JSON-RPC. The server writes diagnostics only to stderr.

For an MCP client, invoking Node directly is simpler:

```text
node /absolute/path/to/margin-slack-agent/dist/mcp/server.js
```

The working directory should be the repository directory so `dotenv` can load `.env`.

## Example local client configuration

A generic stdio MCP configuration looks like:

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

The exact configuration file location depends on the host. Claude Desktop, Claude Code, Codex, compatible IDEs, and other stdio MCP clients use equivalent command/argument settings.

## ChatGPT and Slackbot

This first version is local stdio only. ChatGPT custom apps connect to remote MCP servers, and Slackbot's MCP client expects an HTTPS MCP URL plus an authentication mode. Connecting either product requires a separate Streamable HTTP deployment and authentication layer; it should not expose the fixed-owner database endpoint publicly without those controls.

Slackbot can discover and invoke an app's remote MCP tools, which is a strong future path for Margin: Slackbot would provide the existing LLM while Margin supplies private note retrieval. The remote version should use Slack identity or OAuth and derive the owner from the authenticated caller instead of fixed environment variables.

## Security boundaries

- Read-only SQL only; there are no update, delete, or export tools.
- Owner identity is server configuration, not model input.
- Results include private note text, so only connect the server to an LLM host you trust.
- Do not expose the stdio process through an unauthenticated network wrapper.
- Prepared demo notes remain labeled in Slack, but MCP returns the database records themselves; the host should distinguish demo data when presenting it.
