# Deployment

Margin is a long-running Node.js process because Slack Socket Mode maintains a persistent WebSocket connection and the digest/resurfacing workers poll durable PostgreSQL queues.

## Docker Compose

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Fill in Slack, OpenAI, encryption, and optional Google Calendar values.
3. Start the database, run migrations, and start Margin:

   ```bash
   docker compose up --build -d
   ```

Compose creates:

- `postgres`: PostgreSQL 16 with a persistent named volume;
- `migrate`: a one-shot container that applies migrations and exits;
- `app`: the non-root Margin runtime, started only after PostgreSQL is healthy and migrations succeed.

Inspect status with:

```bash
docker compose ps
docker compose logs -f app
```

Stop cleanly with:

```bash
docker compose down
```

To remove the development database as well:

```bash
docker compose down -v
```

Do not use `-v` when the data must be retained.

## Image layout

The multi-stage `Dockerfile`:

- builds TypeScript in a build stage;
- prunes development dependencies;
- copies only production dependencies, compiled output, package metadata, and migrations into the runtime stage;
- runs as the image's unprivileged `node` user;
- exposes port 3000 by default;
- includes a liveness health check.

Build directly with:

```bash
docker build --target runtime -t margin-slack-agent .
```

Run migrations from the image before starting the application:

```bash
docker run --rm \
  --env-file .env \
  -e DATABASE_URL='postgresql://...' \
  margin-slack-agent npm run migrate:runtime
```

Then run the persistent service:

```bash
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  margin-slack-agent
```

## Health endpoints

The application HTTP server starts independently of Google Calendar.

### `GET /healthz`

Returns `200 ok` when the process and HTTP event loop are alive. It does not prove Slack or PostgreSQL readiness.

### `GET /readyz`

Returns `200` only when:

- PostgreSQL answers a query;
- every migration file is recorded in `schema_migrations` and no unexpected migration is present;
- the Slack Bolt application has started;
- the post-meeting digest worker has started;
- the pre-meeting resurfacing worker has started when Google Calendar is enabled.

Otherwise it returns `503` with a JSON object naming the failed checks.

Temporary OpenAI or Google API outages do not make readiness fail. Calendar-disabled deployments do not require the resurfacing worker.

## HTTP configuration

```dotenv
HTTP_HOST=0.0.0.0
HTTP_PORT=3000
```

`OAUTH_HTTP_HOST` and `OAUTH_HTTP_PORT` are accepted as legacy aliases when the new variables are absent, but new deployments should use `HTTP_HOST` and `HTTP_PORT`.

The same HTTP server handles the Google OAuth callback only when Calendar is enabled.

## Startup order

1. Start PostgreSQL.
2. Apply migrations with `npm run migrate:runtime`.
3. Start the application.
4. The application starts the HTTP server.
5. It verifies PostgreSQL and migration state.
6. It starts Slack Socket Mode.
7. It starts the digest worker and, when configured, the resurfacing worker.
8. `/readyz` becomes healthy.

The application refuses to complete startup when migration files are pending or unexpected applied migrations are present.

## Shutdown

On `SIGINT` or `SIGTERM`, Margin:

1. stops the resurfacing worker;
2. stops the digest worker;
3. stops Slack Bolt;
4. marks readiness false;
5. closes the HTTP server;
6. closes the PostgreSQL pool.

Container platforms should send `SIGTERM` and allow a normal grace period before force-killing the process.

## Persistent data

PostgreSQL is the system of record. The Compose file stores it in the `margin-postgres` named volume. Back up the database before destructive migration or volume operations.

Environment values and encryption keys are not baked into the image. Supply them through the deployment platform's secret manager or an uncommitted `.env` file.
