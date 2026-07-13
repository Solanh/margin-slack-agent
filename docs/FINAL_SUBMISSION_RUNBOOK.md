# Final Slack Hackathon Submission Runbook

This is the operational checklist for the final sandbox rehearsal, video recording, and Devpost submission. It assumes the current `main` branch is deployed and the Slack app was created from `manifest.json`.

## 1. Freeze the revision

1. Pull the latest `main`.
2. Record the commit SHA used for the sandbox and video.
3. Do not add product features after the final successful rehearsal unless they fix a submission blocker.

```bash
git checkout main
git pull --ff-only
git rev-parse HEAD
npm install
npm run typecheck
npm test
npm run build
```

The repository URL, deployed revision, and video must describe the same implementation.

## 2. Update and reinstall the Slack app

1. Open the existing Margin app in the Slack developer dashboard.
2. Apply the current `manifest.json` to the official developer sandbox.
3. Confirm Agent View, writable Messages, App Home, Socket Mode, and interactivity are enabled.
4. Confirm the bot event subscriptions are:
   - `app_home_opened`;
   - `app_context_changed`;
   - `message.im`;
   - `user_huddle_changed`.
5. Confirm the bot scopes are:
   - `assistant:write`;
   - `chat:write`;
   - `files:write`;
   - `im:history`;
   - `im:write`;
   - `users:read`.
6. Reinstall the app after any scope, event, or manifest change.
7. Generate or confirm the `xapp-` Socket Mode token has `connections:write`.

`im:write` is required for `conversations.open`, which Margin uses for private digest, resurfacing, export, and deterministic demo delivery. Do not request `calls:read`. Margin does not read native huddle audio, transcripts, or participant history.

## 3. Configure the final environment

```bash
cp .env.example .env
```

Set all production/demo values in `.env`, including:

- `SLACK_BOT_TOKEN`;
- `SLACK_SIGNING_SECRET`;
- `SLACK_APP_TOKEN`;
- `DATABASE_URL`;
- `AI_API_KEY` and `AI_MODEL`;
- `TOKEN_ENCRYPTION_KEY` and its version;
- Google OAuth values when live Calendar matching will be demonstrated;
- `DEMO_WORKSPACE_ID` for the developer sandbox;
- `DEMO_USER_ID` for the human account used in the video.

To inspect the workspace associated with the bot token without printing the token:

```bash
node --input-type=module <<'NODE'
import "dotenv/config";
import { WebClient } from "@slack/web-api";
const result = await new WebClient(process.env.SLACK_BOT_TOKEN).auth.test();
console.log({ teamId: result.team_id, botUserId: result.user_id });
NODE
```

Get the human demo user's member ID from the Slack profile and use that as `DEMO_USER_ID`. Do not use the bot user ID.

## 4. Apply migrations and prepare deterministic data

The reset is destructive only for Margin data owned by the explicitly named demo workspace/user. Slack installation and Google OAuth records are preserved.

```bash
export DEMO_CONFIRM_RESET="${DEMO_WORKSPACE_ID}:${DEMO_USER_ID}"
```

When `NODE_ENV` is not explicitly `development` or `test`, also set:

```bash
export DEMO_ALLOW_NON_DEVELOPMENT_RESET=true
```

Then run:

```bash
npm run migrate
npm run demo:prepare
```

The seed creates relative-time examples for:

- a clear Calendar-attached note;
- an ambiguous Calendar/huddle note with two choices plus `No meeting`;
- a completed meeting with a due private digest;
- a verified recurring series with due pre-meeting resurfacing;
- retrieval examples across note types, statuses, priorities, people, and meetings.

## 5. Publish the prepared Slack fallback state

```bash
npm run demo:publish
```

This command:

- authenticates the bot to `DEMO_WORKSPACE_ID`;
- opens the private DM for `DEMO_USER_ID`;
- publishes or updates the clear-context and ambiguity note cards;
- delivers the seeded post-meeting digest;
- delivers the seeded recurring-meeting resurfacing;
- updates seeded note provenance to the actual Slack DM;
- visibly labels every prepared card as **Seeded demo state**.

The command is idempotent for existing seeded note cards. It updates their stored Slack message references instead of posting duplicate cards.

Use live note capture in the final video whenever possible. Prepared cards are the deterministic fallback and must remain visibly or verbally identified as seeded.

## 6. Run static preflight

```bash
npm run preflight
```

The preflight validates:

- environment parsing and encryption-key length;
- real Slack workspace and human user IDs;
- PostgreSQL connectivity and current migrations;
- the full deterministic seed dataset;
- private Slack card delivery references;
- Slack bot authentication, workspace match, human demo user, and private DM access;
- Google Calendar connection and least-privilege scope when Calendar is enabled;
- the local health/readiness endpoints when reachable.

Warnings do not fail static preflight. Failures must be corrected before recording.

## 7. Start the final application and require live readiness

Run Margin in a durable terminal/process:

```bash
npm start
```

In another terminal:

```bash
npm run preflight:live
```

For a remote deployment, set the externally reachable application base URL first:

```bash
export PREFLIGHT_BASE_URL="https://your-margin-host.example"
npm run preflight:live
```

The live preflight must report that `/healthz` and `/readyz` pass. Readiness includes PostgreSQL, migrations, Slack startup, the digest worker, and the resurfacing worker when Calendar is enabled.

## 8. Conduct one full rehearsal

Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md) from beginning to end with a timer.

Verify during rehearsal:

1. a live DM produces one processing card that updates in place;
2. the original is marked user-provided and immutable;
3. a real clear meeting attaches automatically, or the seeded fallback is explicitly disclosed;
4. the ambiguity card has the expected meeting buttons and `No meeting`;
5. selecting a meeting updates the same private card;
6. the digest contains only deliberately captured/seeded owner notes;
7. resurfacing shows the prior verified recurring meeting and unresolved notes;
8. retrieval returns only the demo user's Margin notes;
9. App Home and all controls stay private;
10. no shared-channel post occurs.

Reset, reseed, republish, and rerun preflight before the final take if rehearsal interactions changed the prepared state.

## 9. Record the video

The final recording should:

- remain within the competition's stated duration;
- show real Slack interaction rather than slides alone;
- explain that Margin is not a transcript or recording bot;
- show immutable original preservation;
- show evidence-based context and one narrow clarification;
- show digest, verified-series resurfacing, and retrieval;
- show `docs/architecture-overview.svg` briefly;
- use one customer-workflows narrative throughout;
- identify prepared data as seeded;
- end with the public repository and project name.

Do not show environment files, tokens, OAuth codes, raw database credentials, or private unrelated Slack content.

## 10. Complete Devpost

Use [DEVPOST_SUBMISSION.md](DEVPOST_SUBMISSION.md) as the source text.

Required final fields/assets:

- project name and New Slack Agent track;
- complete description of the implemented revision;
- public GitHub repository;
- public demonstration video;
- uploaded `docs/architecture-overview.svg` or a lossless export of it;
- official Slack developer sandbox URL;
- required judge/test accounts invited to the sandbox;
- Slack technologies clearly named;
- third-party services and licenses credited.

Replace every bracketed placeholder in the submission copy.

## 11. Final external verification

Before submitting:

1. open the repository from a logged-out/private browser;
2. open the video from a logged-out/private browser;
3. confirm the architecture image renders independently;
4. confirm the sandbox URL is the correct workspace;
5. confirm the judge accounts can access the sandbox;
6. compare every Devpost claim with the deployed revision;
7. submit and verify that Devpost shows the project as submitted rather than draft.

## Stop conditions

Do not submit until all of these are true:

- `npm run preflight:live` has zero failures;
- the final video is publicly viewable;
- the repository is publicly viewable;
- the sandbox is accessible to judges;
- all placeholders are removed;
- seeded behavior is disclosed;
- the final project is no longer only a Devpost draft.
