# Safe Logging

Margin treats logs as a privacy boundary. Operational logs must help diagnose failures without becoming a second copy of private notes, Calendar content, Slack payloads, or credentials.

## Required logger

Slack Bolt uses `SafeStructuredLogger` from `src/observability/safeLogger.ts`. It also powers the global `app.error(...)` boundary for errors that escape individual listeners.

The logger emits structured JSON with:

- timestamp and level;
- logger/component/event type;
- correlation ID;
- optional hashed workspace/user references;
- retryability and low-cardinality metadata;
- a safe error descriptor.

A safe error descriptor contains only:

- normalized error name;
- category;
- provider/error code;
- HTTP status;
- retry-after duration;
- a short fingerprint hash of the message.

The original error message and stack are not emitted.

## Never log

Do not log:

- raw or organized note text;
- full Slack event, action, view, or Web API payloads;
- OAuth authorization codes or state values;
- Slack, Google, OpenAI, or database credentials;
- access or refresh tokens;
- Calendar titles, descriptions, attendee emails, or participant identifiers;
- model prompts, responses, refusals, or structured output;
- database query parameters containing user content;
- exported user data.

## Event naming

Use stable, low-cardinality event types such as:

```text
raw_note_persistence_failed
calendar_refresh_failed
slack_rate_limited
digest_delivery_failed
unhandled_bolt_error
```

Do not place IDs, note types, meeting titles, or exception messages in the event type.

## Correlation IDs

Generate one correlation ID at the boundary of a user request, background job attempt, or provider callback and reuse it through related logs. Correlation IDs must be random and must not encode a workspace, user, note, meeting, or Slack timestamp.

## Owner references

When owner correlation is operationally necessary, pass `workspaceId` and `userId` to the safe logger. It emits irreversible short hashes rather than raw identifiers. Do not use those hashes as durable product identifiers.

## Metadata

Metadata must be bounded and low cardinality. Appropriate values include:

- attempt number;
- batch size;
- status category;
- provider name;
- operation name;
- boolean feature state;
- retry delay bucket.

Keys that imply sensitive content, such as `text`, `note`, `body`, `payload`, `token`, `code`, `state`, `description`, `calendar`, or `content`, are automatically redacted. This is a defense in depth measure, not permission to pass sensitive values.

## Error categories

- `authentication`: invalid or expired credentials, 401/403.
- `validation`: malformed input or schema failures.
- `rate_limit`: Slack/provider 429 behavior.
- `provider`: remote 5xx failures.
- `infrastructure`: network, DNS, timeout, or database connectivity failures.
- `programming`: unexpected named application errors.
- `unknown`: uncategorized failures.

The classification is intended for operations and retry policy. It is not shown to users as a diagnosis.

## Process-level errors

Database pool errors, migration failures, worker sweep failures, demo seed failures, and startup failures must pass through `describeError()` before reaching `console.error`. This prevents process-level paths from bypassing the Bolt logger's protections.

## Tests

`tests/safeLogger.test.ts` verifies:

- arbitrary framework strings are not serialized;
- Error messages are represented only by fingerprints;
- owner IDs are hashed;
- Slack, Google, OpenAI, OAuth, and database examples are redacted;
- error categories remain stable.

Any new logging utility or sink must preserve these tests and add coverage for its own output format.
