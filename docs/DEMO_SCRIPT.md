# Three-Minute Demo Script

## Deterministic preparation

Use an isolated Slack sandbox user. The reset command deletes only owner-scoped Margin notes, meetings, Slack context caches, series preferences, and notification preferences. It preserves the Slack installation and Google OAuth connection.

```bash
export DATABASE_URL='postgresql://...'
export DEMO_WORKSPACE_ID='T_REAL_WORKSPACE'
export DEMO_USER_ID='U_REAL_DEMO_USER'
export DEMO_SOURCE_CHANNEL_ID='D_REAL_MARGIN_DM'
export DEMO_CONFIRM_RESET="${DEMO_WORKSPACE_ID}:${DEMO_USER_ID}"

npm run migrate
npm run demo:prepare
npm start
```

Outside `development` or `test`, the reset additionally requires:

```bash
export DEMO_ALLOW_NON_DEVELOPMENT_RESET=true
```

The seed fails clearly when the selected owner already has notes or meetings. Run the reset before reseeding. Seeded dates are relative to execution time, so the private digest and recurring-meeting resurfacing jobs are immediately due.

Before recording:

1. Confirm the app is connected in the official Slack developer sandbox.
2. Confirm the demo user can DM Margin and open App Home.
3. Confirm the seeded private digest and resurfacing notification were delivered.
4. Open the retrieval examples printed by `npm run demo:seed`.
5. Prepare one real overlapping Calendar/huddle case for the clarification buttons. The database seed creates the ambiguous candidate state, but the video should show a real Slack card or clearly label any prepared representation.
6. Reset and reseed once more immediately before the final take.

## 0:00–0:18 — Problem

Show a Slack self-DM containing several rough notes.

Narration:

> During meetings, I already send quick notes to myself in Slack because opening another app breaks my attention. But those notes get buried, have no reliable meeting context, and rarely come back when I need them.

## 0:18–0:36 — Positioning

Open Margin's Agent View.

> Margin is not a meeting recorder. It captures only the points I decide matter, keeps them private, and permanently preserves my original words.

## 0:36–1:08 — Live capture

Show `Workflow Migration Review` in progress. DM:

> important ask if migration also affects customer-created workflows

Show the same private processing message update into the final card:

- organized open question;
- high priority;
- verified current meeting;
- original-preserved label;
- visible provenance and uncertainty.

Open the immutable original briefly.

Key line:

> The organized version is useful, but Margin never replaces the original or pretends an inference is a fact.

## 1:08–1:32 — Ambiguity and trust

Capture:

> check whether legal approved the rollout

Do this while `Launch Readiness` and a Slack huddle overlap, or use an explicitly labeled prepared case. Show the two meeting choices plus `No meeting`.

> Instead of silently attaching the wrong context, Margin asks one small question. One tap updates the existing private card.

## 1:32–1:55 — Post-meeting digest

Show the seeded private `Launch Review` digest grouped into decision, action, and question sections.

> This is not a transcript summary. Every item here is something I personally captured, and the exact originals remain available.

## 1:55–2:20 — Pre-meeting resurfacing

Show the seeded notification for the upcoming `Planning` meeting. Highlight the unresolved rollout ownership action and customer-workflows question from the prior verified instance.

> Margin only connects these meetings because Google provides the same recurring-series identity. It does not guess from similar titles.

Briefly show `Mark resolved`, `Snooze`, and opt-out controls.

## 2:20–2:40 — Private retrieval

Ask:

> What did I note about customer workflows?

Show the result with organized wording, meeting/date, status, and the private control to reveal the original.

Optional second query if timing permits:

> Show unresolved high priority actions

## 2:40–3:00 — Architecture and close

Show one architecture slide.

> Margin uses Slack Agent View, supported huddle context, optional Google Calendar, durable PostgreSQL storage, and strict structured AI output. The original is saved before any external call, and failures fall back to that preserved note.

Final screen: tagline, public repository, and privacy boundary.

## Recording rules

- Keep the final video at or below the competition limit.
- Do not spend time on login, installation, or environment setup.
- Use large text and a clean Slack workspace.
- Keep the customer-workflows narrative through capture, resurfacing, and retrieval.
- Show one trust behavior, not only happy-path AI.
- Never imply seeded or simulated data is live.
- Never imply Margin records meetings, searches unrelated Slack history, or guarantees account-level Zero Data Retention.
