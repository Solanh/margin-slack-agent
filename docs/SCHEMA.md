# Database Schema and Ownership Model

## Design rules

1. `notes.raw_text` is immutable after insertion.
2. Every user-owned row includes both `workspace_id` and `user_id`.
3. Relationships between user-owned records use composite foreign keys so data from one user cannot be attached to another user's note.
4. OAuth and Slack installation tokens are stored only in ciphertext columns.
5. OAuth authorization state is short-lived, one-time, and stored only as a hash.
6. Slack context signals are minimal, owner-scoped, and expire automatically.
7. Revisions record derived/user-edited state; they never replace the original note.

## Tables

### `notes`

Stores the immutable Slack message, current derived state, optional meeting association, private card reference, provenance, and reversible organized/verbatim display mode.

### `note_revisions`

Append-only snapshots of user, AI, or system changes to derived note state. Revisions include inference provenance, uncertainty, reminder interpretation, and display mode.

### `meetings`

Normalized Google Calendar, Slack huddle, or explicit meeting context. Provider-event uniqueness is scoped to the owning workspace user.

Google Calendar records contain normalized title, start/end timestamps, and limited participant identifiers. Slack huddle records contain only the opaque call ID when supplied, observed active interval, the explicit placeholder title `Slack huddle (title unavailable)`, and no invented participants.

### `reminders`

Supports either a fixed `scheduled_for` timestamp or an event-relative JSON rule. A database check prevents both or neither scheduling form.

### `oauth_connections`

Stores AES-256-GCM encrypted user-level provider credentials, unique per workspace, user, and provider.

### `oauth_authorization_states`

Stores one-time OAuth CSRF state metadata: SHA-256 hash, owner, provider, expiration, and consumption timestamp. The browser-visible state is never persisted.

### `slack_huddle_states`

Short-lived current-user huddle evidence:

- workspace/user owner;
- optional opaque call ID;
- first observation time;
- latest valid expiration;
- source event timestamp.

Repeated observations of the same call preserve the earliest observation and latest expiration. A leave event deletes the row. Expired rows are ignored and can be removed by cleanup.

### `slack_active_contexts`

Short-lived Agent active-view context:

- owner;
- `channel` or `message` entity type;
- channel ID;
- optional message timestamp;
- observation and expiration timestamps.

The shape constraint requires a message timestamp only for message context. No channel name, message body, thread, canvas, list, or history is stored.

### `workspace_installations`

Reserves encrypted storage for multi-workspace Slack installation credentials. The current hackathon shell still reads one Slack token from environment variables.

## Ownership enforcement

Application repository methods require:

```ts
{
  workspaceId: string;
  userId: string;
}
```

Reads and updates include both values. Composite foreign keys prevent cross-user meeting, reminder, and revision links.

Workspace-wide huddle events are retained only when the workspace/user already owns a Margin note or OAuth connection. First-use capture persists the raw note before refreshing the current user's profile, establishing ownership before any huddle state is saved.

## Original-text immutability

The `notes_prevent_raw_text_update` trigger rejects changes to `raw_text`. Duplicate Slack delivery performs a no-op upsert, preserving original text and capture time.

## Token encryption

`AesGcmTokenCipher` uses AES-256-GCM, random 96-bit IVs, authentication tags, authenticated key-version metadata, and a versioned envelope.

Generate a development key:

```bash
openssl rand -base64 32
```

Store it in `TOKEN_ENCRYPTION_KEY`. Key rotation requires retaining the previous key until rows are re-encrypted.

## Applying migrations

```bash
npm run build
npm run migrate
```

Issue #7 requires migrations through:

```text
006_slack_context_signals.sql
```

## Rollback

Development rollbacks run in reverse order:

```bash
psql "$DATABASE_URL" -f migrations/rollback/006_slack_context_signals.sql
psql "$DATABASE_URL" -f migrations/rollback/005_google_calendar_oauth.sql
psql "$DATABASE_URL" -f migrations/rollback/004_add_interactive_note_cards.sql
psql "$DATABASE_URL" -f migrations/rollback/003_store_transformation_provenance.sql
psql "$DATABASE_URL" -f migrations/rollback/002_expand_margin_schema.sql
psql "$DATABASE_URL" -f migrations/rollback/001_create_raw_notes.sql
```

Production rollback should normally use a forward corrective migration. Back up required data and credentials before destructive development rollback.
