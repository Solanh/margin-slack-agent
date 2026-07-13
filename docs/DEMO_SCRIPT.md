# Three-Minute Demo Script

## Deterministic preparation

Use an isolated Slack sandbox user. The reset command deletes only owner-scoped Margin notes, meetings, Slack context caches, series preferences, and notification preferences. It preserves the Slack installation and Google OAuth connection.

```bash
export DATABASE_URL='postgresql://...'
export DEMO_WORKSPACE_ID='T_REAL_WORKSPACE'
export DEMO_USER_ID='U_REAL_DEMO_USER'
export DEMO_CONFIRM_RESET="${DEMO_WORKSPACE_ID}:${DEMO_USER_ID}"
```

Outside `development` or `test`, the reset additionally requires:

```bash
export DEMO_ALLOW_NON_DEVELOPMENT_RESET=true
```

Prepare, publish, and validate the fallback state:

```bash
npm run migrate
npm run demo:prepare
npm run demo:publish
npm run preflight
```

Then start Margin in one terminal:

```bash
npm start
```

And require live readiness in another:

```bash
npm run preflight:live
```

The seed fails clearly when the selected owner already has notes or meetings. Run the reset before reseeding. Seeded dates are relative to execution time. `demo:publish` resolves the real private Slack DM, publishes the two prepared note cards, delivers digest and resurfacing examples, and visibly labels every prepared card as **Seeded demo state**.

Before recording:

1. Confirm the app is connected in the official Slack developer sandbox.
2. Confirm `npm run preflight:live` has zero failures.
3. Confirm the demo user can DM Margin and open App Home.
4. Confirm the seeded private digest and resurfacing notification were delivered.
5. Open the retrieval examples printed by `npm run demo:seed`.
6. Prepare one real overlapping Calendar/huddle case when possible. Otherwise use the visibly labeled prepared ambiguity card.
7. Reset, reseed, republish, and rerun preflight immediately before the final take if rehearsal interactions changed state.

See [FINAL_SUBMISSION_RUNBOOK.md](FINAL_SUBMISSION_RUNBOOK.md) for the complete operational checklist.

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

If live Calendar context is unavailable, use the prepared card and state that the displayed example was seeded for a deterministic walkthrough.

## 1:08–1:32 — Ambiguity and trust

Capture:

> check whether legal approved the rollout

Do this while `Launch Readiness` and a Slack huddle overlap, or use the visibly labeled prepared case. Show the two meeting choices plus `No meeting`.

> Instead of silently attaching the wrong context, Margin asks one small question. One tap updates the existing private card.

## 1:32–1:55 — Post-meeting digest

Show the visibly labeled seeded private `Launch Review` digest grouped into decision, action, and question sections.

> This prepared example contains only notes I deliberately seeded for this walkthrough. In normal use, every digest item is something the owner personally captured; Margin never summarizes a transcript.

## 1:55–2:20 — Pre-meeting resurfacing

Show the visibly labeled seeded notification for the upcoming `Planning` meeting. Highlight the unresolved rollout ownership action and customer-workflows question from the prior verified instance.

> Margin only connects these meetings because they share verified recurring-series identity. It does not guess from similar titles.

Briefly show `Mark resolved`, `Snooze`, and opt-out controls.

## 2:20–2:40 — Private retrieval

Ask:

> What did I note about customer workflows?

Show the result with organized wording, meeting/date, status, and the private control to reveal the original.

Optional second query if timing permits:

> Show unresolved high priority actions

## 2:40–3:00 — Architecture and close

Show `architecture-overview.svg`.

> Margin uses Slack Agent View, supported huddle context, optional Google Calendar, durable PostgreSQL storage, and strict structured AI output. The original is saved before any external call, and failures fall back to that preserved note.

Final screen: tagline, public repository, and privacy boundary.

## Recording rules

- Keep the final video at or below the competition limit.
- Do not spend time on login, installation, or environment setup.
- Use large text and a clean Slack workspace.
- Keep the customer-workflows narrative through capture, resurfacing, and retrieval.
- Show one trust behavior, not only happy-path AI.
- Keep every prepared card's **Seeded demo state** disclosure visible or disclose it verbally.
- Never imply seeded or simulated data is live.
- Never imply Margin records meetings, searches unrelated Slack history, or guarantees account-level Zero Data Retention.
