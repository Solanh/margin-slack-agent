# Google Calendar Integration

Google Calendar is optional. Margin can run as a private Slack note agent without any Google configuration; note capture, Slack huddle context, organization, retrieval, post-meeting digests, and other non-Calendar features remain available.

## Disabled mode

Set:

```dotenv
GOOGLE_CALENDAR_ENABLED=false
```

Then omit:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

When disabled:

- the Google OAuth client is not created;
- the OAuth callback server is not started;
- the pre-meeting Calendar resurfacing worker is not started;
- context resolution continues with Slack huddle and standalone candidates;
- App Home displays **Google Calendar unavailable** and does not show a connect button.

For backward compatibility, a complete set of Google credentials enables the integration even when `GOOGLE_CALENDAR_ENABLED` is omitted. Partial inferred or explicitly enabled configuration is rejected during startup.

## Enabled mode

Set:

```dotenv
GOOGLE_CALENDAR_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/calendar/callback
OAUTH_HTTP_HOST=0.0.0.0
OAUTH_HTTP_PORT=3000
TOKEN_ENCRYPTION_KEY=...
TOKEN_ENCRYPTION_KEY_VERSION=1
```

All three Google credential variables are required when Calendar is enabled.

Margin uses Google Calendar only to identify events overlapping the moment a user captures a note and to find verified upcoming instances for resurfacing.

## Scope

Margin requests exactly one Google OAuth scope:

```text
https://www.googleapis.com/auth/calendar.events.readonly
```

This permits read-only access to event resources. Margin does not request permission to create, edit, delete, or share Calendar data.

Official references:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- https://developers.google.com/workspace/calendar/api/auth

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable the **Google Calendar API**.
3. Configure the OAuth consent screen.
4. During development, add the test Google accounts that will connect Calendar.
5. Create an OAuth client of type **Web application**.
6. Add an authorized redirect URI matching `GOOGLE_REDIRECT_URI` exactly.

Local example:

```text
http://localhost:3000/oauth/google/calendar/callback
```

Deployed example:

```text
https://margin.example/oauth/google/calendar/callback
```

Generate a development encryption key with:

```bash
openssl rand -base64 32
```

## Connection flow

1. The user opens Margin's App Home.
2. Margin creates a cryptographically random state value that expires after ten minutes.
3. PostgreSQL stores only the SHA-256 hash of that state.
4. Slack opens a modal explaining the requested data and links to Google.
5. Google redirects to the configured callback with an authorization code and state.
6. Margin atomically consumes the state. A state cannot be reused.
7. Margin exchanges the code for access and refresh tokens.
8. Tokens are encrypted with AES-256-GCM before persistence.

Authorization requests use:

- `access_type=offline` for refresh tokens;
- `include_granted_scopes=true`;
- `prompt=consent` so a fresh connection can receive offline credentials;
- the single read-only event scope above.

## Event lookup

For each captured note, Margin queries the primary calendar with:

- `timeMin`: capture time minus five minutes;
- `timeMax`: capture time plus five minutes;
- `singleEvents=true` to expand recurring instances;
- `orderBy=startTime`;
- `showDeleted=false`;
- `maxResults=20`.

The partial-response `fields` parameter requests only:

- event ID and recurring-series identity;
- summary/title;
- status and event type;
- start/end date-time;
- attendee email, self flag, and response status;
- organizer email and self flag.

Margin does not request descriptions, locations, conference links, attachments, or reminders.

## Candidate rules

Margin ignores:

- cancelled events;
- all-day entries;
- non-default event types such as focus time or out-of-office;
- events the authenticated user declined;
- malformed or non-overlapping intervals.

Every plausible event is normalized and stored as an owner-scoped meeting candidate. Multiple plausible events remain unresolved for user clarification rather than being selected arbitrarily. Missing, disabled, disconnected, or failed Calendar access leaves the note standalone unless another verified source such as Slack huddle state is available.

## Model boundary

The transformation model receives only the selected meeting's title, start time, end time, and confidence. Attendee identifiers are not sent to the model. Calendar descriptions are never fetched.

## Refresh and disconnect

Before an API request, Margin refreshes an access token when it is within 60 seconds of expiration. The replacement access token is encrypted and persisted.

Disconnecting Calendar:

1. attempts to revoke the refresh token, falling back to the access token;
2. deletes the local encrypted connection even when remote revocation cannot be confirmed;
3. updates App Home to show Calendar as disconnected.

Existing notes and already-attached meeting records remain intact. New notes degrade to Slack or standalone context.

## Callback server

When Calendar is enabled, Margin starts a small HTTP server for the configured OAuth callback path and `/healthz`. Callback responses use `no-store`, a restrictive Content Security Policy, `nosniff`, and `no-referrer`. Authorization codes and state values are not logged.

For production, place the server behind HTTPS and configure the public HTTPS callback URL in Google Cloud.

## Verification

### Disabled deployment

1. Set `GOOGLE_CALENDAR_ENABLED=false` and remove Google credentials.
2. Start Margin.
3. Confirm App Home says Calendar is unavailable.
4. Capture, edit, and retrieve a note.
5. Confirm the note is stored and organized without Calendar errors.

### Enabled deployment

1. Set the complete enabled configuration.
2. Start Margin and select **Connect Calendar** in App Home.
3. Confirm the consent page requests read-only Calendar event access.
4. Capture a note during a calendar event and confirm verified context.
5. Create two overlapping events and confirm Margin asks for clarification.
6. Disconnect Calendar and confirm encrypted credentials are deleted.
7. Capture another note and confirm standalone operation still works.
