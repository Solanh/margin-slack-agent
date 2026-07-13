# Devpost Submission Copy

Use this document as the source of truth when completing the Slack hackathon submission. Replace every bracketed placeholder before submitting.

## Project name

Margin

## Tagline

Private margin notes for meetings in Slack: capture what matters, preserve the original, and resurface it when it becomes useful.

## Track

New Slack Agent

## One-sentence description

Margin is a private, calendar-aware Slack agent that turns deliberate meeting micronotes into durable, organized memory without recording or transcribing the meeting.

## Inspiration

People already send rough notes to themselves in Slack during meetings because opening a separate notes application interrupts their attention. Those notes are fast to capture, but they are easy to lose, rarely retain reliable meeting context, and almost never return at the moment they are needed.

Most meeting assistants solve a different problem by recording or transcribing everyone. Margin starts from a stricter premise: the user chooses what matters. It preserves only the note the user deliberately sends, keeps the exact original immutable, and treats AI output as a derived view rather than the source of truth.

## What it does

During a meeting or huddle, the user sends Margin a quick private message such as:

> important ask if migration also affects customer-created workflows

Margin first writes the exact note to PostgreSQL before making any Calendar or AI request. It then:

- conservatively organizes the wording and classifies the note;
- uses supported Google Calendar, Slack huddle, explicit, and standalone signals to resolve meeting context;
- attaches context automatically only when deterministic evidence clears a documented confidence threshold;
- asks one narrow, private clarification question when plausible meetings are too close to call;
- displays organized and original wording separately, with visible provenance and uncertainty;
- lets the user edit type, priority, reminder, meeting, status, and organized/verbatim display state;
- sends a private post-meeting digest containing only notes that user deliberately captured;
- resurfaces unresolved actions and questions before the next verified event in the same recurring Calendar series; and
- privately retrieves the user's own Margin notes by topic, meeting, mentioned name, type, priority, and status.

Margin does not record audio, transcribe meetings, summarize other people's messages, or search unrelated Slack history.

## How we built it

Margin is a TypeScript application built with Slack Bolt for JavaScript. It uses Slack Agent View and private DMs for capture, Block Kit for interactive note cards and clarification controls, Socket Mode for event delivery, and App Home for setup and private data controls.

PostgreSQL stores immutable originals, organized note state, revisions, meeting candidates, reminders, digest jobs, resurfacing jobs, preferences, and encrypted OAuth credentials. Database constraints enforce owner scoping, raw-text immutability, idempotent Slack event ingestion, and valid context-resolution states.

Google Calendar is optional and uses the least-privilege `calendar.events.readonly` scope. Event lookup is restricted to bounded windows around capture and upcoming meetings. Recurring-event resurfacing requires a verified Calendar series identifier; Margin never guesses a relationship from title similarity alone.

OpenAI Structured Outputs provide conservative organization and classification through a strict Zod schema. The model receives no tools, responses use `store: false`, invalid output or model refusal falls back to the already-saved verbatim note, and the repository does not claim account-level Zero Data Retention unless separately enabled by the operator.

Durable PostgreSQL-backed workers handle post-meeting digests, recurring-meeting resurfacing, retries, stale-lock recovery, and retention cleanup. Slack API calls use centralized rate-limit and retry classification. The production package includes a non-root Docker image, Docker Compose setup, migrations, health/readiness endpoints, graceful shutdown, redacted structured logging, and user export/deletion/retention controls.

## Slack platform features used

- Slack Agent View and private app DMs
- Slack Bolt for JavaScript
- Events API: `message.im`, `app_home_opened`, `app_context_changed`, and supported huddle-state signals
- Block Kit messages, buttons, and modals
- App Home
- Socket Mode
- Slack Web API for private delivery, message updates, views, and export upload
- `im:write`-authorized private DM opening for owner-only proactive delivery

## Challenges

The hardest problem was not generating polished text. It was deciding when Margin had enough evidence to attach meeting context without silently inventing certainty. A Calendar event, an active huddle, and text overlap can disagree, so Margin normalizes each source into deterministic candidates, records the evidence, caps weak text-only signals, and requires both a high score and a meaningful lead before automatic attachment.

The second challenge was preserving trust across failures. Slack retries, Calendar outages, malformed model output, refusals, process restarts, and duplicate worker delivery cannot be allowed to lose or duplicate a note. The implementation therefore persists the immutable original first, uses database-level idempotency, validates every derived result, and keeps delivery work in durable queues.

## Accomplishments

- The user's exact note is durable before any external call.
- Original wording is immutable at the database level.
- Meeting context is evidence-based and uncertainty remains visible.
- A huddle and overlapping Calendar event produce clarification instead of a guess.
- Digests and resurfacing contain only the owner's deliberately captured notes.
- Recurring-meeting matching requires verified Calendar series identity.
- Retrieval is owner- and workspace-scoped and never searches unrelated Slack history.
- Calendar is optional, so core capture remains usable when Calendar is unavailable.
- Users can export or delete their data, configure retention, disconnect Calendar, and disable proactive notifications.
- The application includes deployment packaging, readiness checks, privacy-safe logs, and bounded provider retries.

## What we learned

A trustworthy workplace agent needs explicit boundaries more than broad access. The most useful design decisions were to separate the original from every derived representation, expose uncertainty instead of hiding it, minimize provider data, and make proactive behavior reversible and owner-controlled.

We also learned that recurrence identity matters. Meeting-title similarity feels convenient, but it can quietly surface unrelated private notes. Verified Calendar series identity produces a narrower product, but a substantially safer one.

## What's next

- Add a richer private App Home dashboard for recent notes, open actions, unresolved questions, and upcoming resurfacing.
- Add explicit date-range retrieval.
- Add structured private feedback for incorrect organization or meeting attachment.
- Add a fake-Slack end-to-end harness and privacy-safe operational metrics.
- Add automated dependency review, CodeQL, migration upgrade tests, and backup/restore checks.

## Built with

TypeScript, Node.js, Slack Bolt, Slack Agent View, Block Kit, Socket Mode, PostgreSQL, Google Calendar API, OpenAI Responses API Structured Outputs, Zod, Docker, Docker Compose, and Vitest.

## Required links and access

- Public repository: https://github.com/Solanh/margin-slack-agent
- Public demo video under three minutes: [ADD YOUTUBE, VIMEO, FACEBOOK VIDEO, OR YOUKU URL]
- Slack developer sandbox URL: [ADD SANDBOX URL]
- Architecture diagram: upload `docs/architecture-overview.svg` or a lossless export
- Judge access: invite `slackhack@salesforce.com` and `testing@devpost.com` to the submitted sandbox
- Submission deadline: July 13, 2026 at 5:00 p.m. PDT / 8:00 p.m. EDT

## Final accuracy check

Before submission, confirm that:

- the public video is shorter than three minutes and shows the project functioning in Slack;
- the repository, video, and sandbox are accessible from a logged-out/private browser where applicable;
- both required judging accounts have sandbox access;
- the architecture diagram is uploaded;
- all bracketed placeholders are removed;
- the video shows the exact revision deployed in the sandbox;
- every demonstrated behavior is either live or explicitly identified as seeded demo data; and
- Margin is not described as having access to transcripts, unrelated Slack history, or account-level Zero Data Retention.
