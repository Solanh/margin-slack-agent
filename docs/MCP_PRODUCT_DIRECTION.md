# MCP product direction: private notes plus Slack reminders

## Decision

Margin should use MCP as its primary model integration boundary. Margin owns private Slack note capture, durable storage, retrieval, and reminder delivery. The user supplies the reasoning model through Codex, Claude, ChatGPT, Slackbot, or another MCP-capable host.

The first write workflow is intentionally narrow:

> Turn an existing Margin note, or exact new text, into a fixed-time reminder delivered privately by Margin in Slack.

Margin should not expand into a general task-management suite at this stage.

## Market assessment

The broad market is crowded:

- Todoist supports ChatGPT and MCP task management, including creating and updating tasks.
- Notion MCP exposes workspace read/write operations and can be used for task and page workflows.
- Meeting-note products such as Granola and Notion already extract or surface follow-up work from meeting notes.
- General AI assistants already offer reminders and scheduled tasks in their own interfaces.

Margin's differentiated wedge is narrower:

- capture only the sentence the user deliberately chooses;
- remain private to the owner;
- do not record or transcribe the meeting;
- preserve the immutable original;
- associate Slack/meeting context conservatively;
- let the user's existing LLM query the memory through MCP;
- deliver reminders back in the same private Slack workflow where the note originated.

This is not a claim that Margin has no competitors. It is a product-boundary choice that avoids competing directly with mature task databases and transcript-first meeting assistants.

## Why reminder writes make sense

Reminder creation closes a useful loop:

1. The user captures a private note in Slack.
2. An existing LLM retrieves and reasons over it through MCP.
3. At the user's request, the LLM creates a durable Margin reminder.
4. Margin later sends the reminder privately in Slack.

The host model handles language interpretation. Margin handles identity, persistence, scheduling, retries, and delivery.

## Safety and interaction rules

- Reminder tools are owner-scoped at server startup.
- Creation requires an exact timezone-aware timestamp.
- The model must clarify ambiguous dates or times rather than guessing.
- Creation is idempotent for the same owner, source note/text, and scheduled time.
- Cancellation is limited to pending or snoozed reminders.
- Tool annotations identify creation and cancellation as write actions so compatible hosts can request confirmation.
- The MCP process never receives Slack credentials; the main Margin application performs delivery.

## Current limitations

- The local server uses stdio and a fixed owner configuration.
- ChatGPT and Slackbot require a remote authenticated MCP transport.
- Only fixed-time reminders are exposed through MCP. Event-relative reminders remain an internal schema capability.
- Delivery requires the main Margin Slack application to be running.
- Delivery is at-least-once; a narrow crash window after Slack accepts a message and before the database records success can produce a duplicate.

## Primary sources

- MCP tools and annotations: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP transport and lifecycle: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- Slackbot MCP client: https://docs.slack.dev/ai/slackbot-mcp-client/
- Todoist ChatGPT integration: https://www.todoist.com/help/articles/use-todoist-with-chatgpt-Wu0cR2nM6
- Todoist MCP server: https://www.todoist.com/integrations/apps/mcp
- Notion MCP: https://developers.notion.com/docs/mcp
- Granola integrations and meeting notes: https://www.granola.ai/
