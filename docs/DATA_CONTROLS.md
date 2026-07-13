# User Data Controls

Margin exposes owner-scoped privacy controls in App Home.

## Export my data

**Export my data** creates a JSON file and uploads it only to the current user's private Margin DM.

The export contains:

- immutable original notes;
- organized note state and provenance;
- revision history;
- meeting context;
- reminders;
- context candidates and selection evidence;
- digest and resurfacing delivery metadata;
- notification and series preferences;
- integration provider, scopes, expiration, and encryption-key version;
- short-lived Slack huddle and active-view signals that still exist.

The export does not contain:

- access or refresh token ciphertext;
- OAuth authorization-state hashes;
- Slack bot tokens or signing secrets;
- OpenAI credentials;
- database credentials.

The Slack app requires `files:write` for this private export. Reinstall the app after applying the updated manifest.

## Delete all data

**Delete all data** uses a Slack confirmation dialog and then:

1. attempts to revoke Google Calendar access when configured;
2. removes local OAuth credentials even if remote revocation cannot be confirmed;
3. deletes owner-scoped OAuth authorization state and Slack context caches;
4. deletes notes, revisions, reminders, and context candidates;
5. deletes meetings and their digest/resurfacing jobs;
6. deletes notification, retention, and series preferences.

The operation is owner-scoped and transactional for local PostgreSQL data. Repeating the action after completion is safe and returns an empty deletion result.

The shared Slack app installation is not removed because it belongs to the workspace, not an individual user.

## Retention

Supported retention settings:

- Keep until I delete;
- 30 days;
- 90 days;
- 1 year.

Selecting a finite period creates or reschedules a durable `retention_cleanup_jobs` row. The worker:

- claims due jobs with row locks;
- resets stale processing locks;
- calculates the cutoff from the execution timestamp;
- deletes only notes strictly older than the cutoff;
- deletes old meetings only after no retained note references them;
- schedules the next sweep 24 hours later;
- stores bounded retry state after failures.

Changing retention to **Keep until I delete** removes the cleanup job. The worker rechecks the current preference inside the deletion transaction so a stale claimed job cannot apply an old policy.

## Proactive notifications

**Disable notifications** sets both post-meeting digests and pre-meeting resurfacing off for the owner. Existing sent Slack messages and saved notes remain available. **Enable notifications** restores both global preferences; per-series mute preferences remain intact.

## Isolation

Every export, preference update, deletion, and retention query includes both `workspace_id` and `user_id`. Integration tests create two owners in the same workspace and verify one owner cannot export or delete the other's records.

## Operational verification

1. Reinstall the Slack app with `files:write`.
2. Capture and edit several notes.
3. Open App Home and export data.
4. Confirm the file appears only in the user's Margin DM.
5. Inspect the JSON and confirm originals, revisions, and meetings are present but token ciphertext is absent.
6. Disable notifications and verify digest/resurfacing preparation skips the owner.
7. Set a finite retention period in a test database and run the cleanup worker.
8. Confirm newer notes remain.
9. Use **Delete all data** and verify retrieval returns no results while another test owner's data remains.
