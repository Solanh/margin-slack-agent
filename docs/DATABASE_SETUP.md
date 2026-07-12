# PostgreSQL Setup

Margin stores the exact Slack message before sending a success acknowledgement. PostgreSQL is therefore required beginning with issue #2.

## Requirements

- PostgreSQL 14 or newer
- A database URL available as `DATABASE_URL`
- TLS parameters appropriate for the selected provider

Example local database URL:

```dotenv
DATABASE_URL=postgresql://margin:margin@localhost:5432/margin
```

Do not commit real credentials.

## Apply migrations

```bash
npm install
npm run migrate
```

The migration runner:

- acquires a PostgreSQL advisory lock;
- creates `schema_migrations` when necessary;
- applies unapplied `.sql` files in lexical order;
- runs each migration in its own transaction;
- records successfully applied migrations.

## Raw-note table

The first migration creates `notes` with:

- an application-generated UUID;
- Slack workspace, user, channel, and message provenance;
- immutable `raw_text`;
- capture timestamp;
- a unique constraint on `(workspace_id, user_id, source_message_ts)`.

The repository uses an atomic `INSERT ... ON CONFLICT` statement. A Slack retry returns the existing row and does not update `raw_text`.

## Verify durability

1. Apply migrations.
2. Start Margin.
3. Send a private message to Margin.
4. Confirm Slack replies with **Note saved**.
5. Query the row:

```sql
SELECT
  id,
  workspace_id,
  user_id,
  source_channel_id,
  source_message_ts,
  raw_text,
  created_at
FROM notes
ORDER BY created_at DESC
LIMIT 5;
```

6. Replay the same Slack event or invoke the repository twice with the same workspace, user, and source message timestamp.
7. Confirm only one row exists and its original text has not changed.

## Failure behavior

If PostgreSQL is unavailable:

- Margin does not claim the note was saved;
- it sends a visible **Note not saved** response when Slack remains reachable;
- the original user message remains visible in Slack;
- the error log contains an operation description but intentionally excludes the note body.

## Production notes

- Enforce TLS where the provider supports it.
- Encrypt backups and restrict database access.
- Do not enable SQL statement logging with parameter values in production.
- Run migrations before starting a new application release.
- Configure retention and deletion behavior before onboarding real users.
