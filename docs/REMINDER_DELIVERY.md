# Durable reminder delivery

Margin stores reminders in PostgreSQL and delivers fixed-time reminders through the installed Slack bot. Reminder creation and reminder delivery are intentionally separate:

1. A Slack interaction, MCP tool, or future client creates a reminder tied to an owner-scoped note.
2. The Margin application claims due reminders in small batches.
3. The worker opens only the reminder owner's private DM and posts the reminder.
4. Successful delivery records the Slack channel/message reference and marks the reminder sent.
5. Failed delivery remains pending and receives a durable retry time.

This design means the model or MCP client does not need Slack credentials and does not need to remain running until the reminder fires.

## Delivery guarantees

The worker uses PostgreSQL `FOR UPDATE SKIP LOCKED` claiming plus a five-minute stale-claim lease. Multiple Margin processes can sweep concurrently without normally claiming the same reminder. Slack posts include a stable `client_msg_id` derived from the reminder UUID to reduce duplicate posts if a process loses its database connection after Slack accepts the message.

Reminder delivery is at-least-once. A failure after Slack accepts the message but before PostgreSQL records success can still produce a duplicate in edge cases; the stable Slack client message ID is the available deduplication signal.

## Runtime

The worker starts with the main Margin application and checks every 30 seconds. Margin must be running when a reminder becomes due; if it was offline, the reminder is delivered during the next successful sweep.

The MCP server only writes reminder state. It does not load Slack credentials or send messages itself.
