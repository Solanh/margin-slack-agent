# Database Schema and Ownership Model

## Design rules

1. `notes.raw_text` is immutable after insertion.
2. Every user-owned row includes both `workspace_id` and `user_id`.
3. Relationships between user-owned records use composite foreign keys so data from one user cannot be attached to another user's note.
4. OAuth and Slack installation tokens are stored only in ciphertext columns.
5. OAuth authorization state is short-lived, one-time, and stored only as a hash.
6. Revisions record derived/user-edited state; they never replace the original note.

## Tables

### `notes`

Stores the original Slack message and current derived state.

- immutable raw text and Slack provenance;
- organized text, type, priority, and status;
- optional meeting association;
- context confidence and transformation version;
- private Slack card channel/timestamp;
- reversible organized/verbatim display mode;
- unique Slack delivery identity.

### `note_revisions`

Append-only snapshots of user, AI, or system changes to the derived note state. The table stores inference provenance, uncertainty, reminder interpretation, and display mode alongside the revision.

### `meetings`

Normalized Calendar, Slack huddle, or explicit meeting context. Provider-event uniqueness is scoped to the owning workspace user. Google Calendar candidates store only normalized title, start/end timestamps, and limited participant identifiers needed for future matching.

### `reminders`

Supports either:

- a fixed `scheduled_for` timestamp; or
- an event-relative JSON rule.

A database check prevents a reminder from having both or neither scheduling form.

### `oauth_connections`

Stores encrypted user-level provider credentials. Repository code encrypts access and refresh tokens with AES-256-GCM before executing SQL. Connections are unique per workspace, user, and provider.

### `oauth_authorization_states`

Stores one-time OAuth CSRF state metadata:

- SHA-256 state hash, never the browser-visible state value;
- workspace and user ownership;
- provider;
- expiration and consumption timestamps.

The consume query requires the correct hash/provider, an unconsumed row, and a future expiration, then marks it consumed atomically.

### `workspace_installations`

Reserves encrypted storage for multi-workspace Slack installation credentials. The current hackathon shell still reads one Slack token from environment variables.

## Ownership enforcement

Application repository methods require an `OwnerScope` containing:

```ts
{
  workspaceId: string;
  userId: string;
}
```

Reads and updates include both values in their predicates. Composite foreign keys additionally prevent:

- linking another user's meeting to a note;
- creating a reminder for another user's note;
- creating a revision for another user's note.

Google OAuth connection and state queries are also scoped to workspace/user ownership. OAuth callback state resolves the owner server-side; the callback does not accept workspace or user IDs from browser query parameters.

## Original-text immutability

The `notes_prevent_raw_text_update` trigger raises an exception whenever an update attempts to change `raw_text`.

The duplicate-delivery upsert performs a no-op assignment to the existing Slack message timestamp. The `updated_at` trigger changes timestamps only when the row is actually distinct, so duplicate deliveries do not alter the record.

## Token encryption

`AesGcmTokenCipher` uses:

- AES-256-GCM;
- a random 96-bit IV per encryption;
- an authentication tag;
- authenticated key-version metadata;
- a versioned ciphertext envelope.

Generate a development key with:

```bash
openssl rand -base64 32
```

Store it in `TOKEN_ENCRYPTION_KEY`. Do not commit the value.

Key rotation requires retaining the previous key until existing rows have been re-encrypted. The repository rejects rows encrypted under a different version rather than silently returning unusable data.

## Applying migrations

```bash
npm run build
npm run migrate
```

The migration runner applies files in lexical order and records them in `schema_migrations`.

Issue #6 requires migrations through:

```text
005_google_calendar_oauth.sql
```

## Rollback

Rollback scripts are intentionally manual and intended for development environments. Run them in reverse migration order:

```bash
psql "$DATABASE_URL" -f migrations/rollback/005_google_calendar_oauth.sql
psql "$DATABASE_URL" -f migrations/rollback/004_add_interactive_note_cards.sql
psql "$DATABASE_URL" -f migrations/rollback/003_store_transformation_provenance.sql
psql "$DATABASE_URL" -f migrations/rollback/002_expand_margin_schema.sql
psql "$DATABASE_URL" -f migrations/rollback/001_create_raw_notes.sql
```

Production rollback should normally use a forward corrective migration instead of destructive scripts. Back up any required derived data and credentials before running development rollbacks.
