# Slack API Retry Policy

Margin applies one retry and idempotency policy to the Bolt application's WebClient.

## Principles

1. Respect Slack's `retryAfter` duration for rate limits.
2. Retry only operations that are safe to repeat.
3. Never blindly retry message creation or modal opening.
4. Keep retries bounded with jitter.
5. Persist retry timing for durable digest and resurfacing jobs.
6. Do not log Slack payloads or user content when a call fails.

## Operation classes

### Idempotent

The following operations may be retried after rate limits, transient 5xx responses, timeouts, or connection failures:

- `chat.update`
- `conversations.open`
- `users.info`
- `views.publish`
- `views.update`

The executor makes at most three attempts by default. A Slack-provided retry duration takes precedence over exponential backoff.

### Non-idempotent or time-sensitive

The following operations are attempted once:

- `chat.postMessage`
- `views.open`

A repeated message creation can produce a duplicate private notification. A repeated modal open may reuse an expired or single-use trigger ID. These operations therefore fail into their existing durable or user-visible error paths instead of being retried in memory.

## Durable background jobs

Post-meeting digests and pre-meeting resurfacing notifications already use PostgreSQL queues. When Slack returns a retry duration, the worker stores the next attempt at that time. Otherwise it uses bounded queue backoff.

The process does not sleep for long rate-limit windows while holding a claimed queue row.

## Interactive calls

Safe reads and updates use bounded in-memory retries. Non-idempotent actions fail once and are logged through the privacy-safe structured logger. Existing note or notification state remains unchanged unless Slack confirms the operation.

## Error classification

`classifySlackApiFailure()` recognizes:

- rate limits and retry durations;
- HTTP 5xx provider failures;
- request timeouts;
- connection/DNS failures;
- permanent 4xx and application errors.

`SlackApiOperationError` exposes only normalized operation, attempt count, status, code, retryability, and retry duration. The original provider message is retained only as an in-memory cause and is not emitted by the safe logger.

## Adding a Slack method

When adding a new Web API method:

1. Decide whether repeating it is provably safe.
2. Add it to `installSlackApiPolicy()` with `idempotent` or `non_idempotent` safety.
3. Add tests for rate limit, transient failure, and permanent failure behavior.
4. For durable jobs, use `nextDurableSlackRetryAt()` when persisting failure state.
5. Do not add ad hoc `setTimeout` retry loops around individual Slack calls.
