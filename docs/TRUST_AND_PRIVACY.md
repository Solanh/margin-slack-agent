# Trust and Privacy Model

Trust is a product feature, not a policy appendix.

## Trust contract

Margin promises:

1. It never records or transcribes a meeting.
2. It stores only what the user deliberately sends.
3. It preserves the original exactly.
4. It labels AI-generated text as organized/derived.
5. It does not invent speakers, owners, dates, or decisions.
6. It asks when context is ambiguous.
7. It keeps notes private unless the user explicitly shares them.

## Provenance labels

Every value has a source classification:

- **User-provided:** appears directly in the note or a user action.
- **Verified context:** supplied by Slack or Calendar.
- **Inferred:** produced by the model or heuristic.
- **Unresolved:** insufficient evidence.

The interface should not visually merge these categories.

## Meaning-preservation strategy

An LLM cannot guarantee zero semantic drift. Margin therefore does not claim that the organized note is perfect.

Instead:

- raw text is immutable;
- the organized version is reversible and editable;
- transformations are conservative;
- quotes are never created unless present in the raw text;
- uncertain interpretation is flagged;
- users can select “Keep verbatim.”

## Data minimization

Default inputs to the model:

- the note;
- verified meeting title/date;
- optional user preference settings.

Do not send:

- full huddle audio or transcript;
- unrelated channel history;
- participant messages;
- calendar descriptions unless necessary and authorized.

## Privacy defaults

- private app DM only;
- no shared exports by default;
- reminders delivered privately;
- App Home scoped to the current user;
- configurable retention;
- deletion removes derived content, embeddings, and reminders associated with the note.

## Abuse and failure cases

### Hallucinated attribution

Risk: model interprets “Maya said…” incorrectly.

Control: only extract a speaker when the raw note explicitly contains the attribution. Label it user-provided, not verified.

### Accidental shared posting

Risk: a private note is posted to a channel.

Control: channel sharing is not in the MVP. Future sharing requires a preview and explicit confirmation.

### Calendar mismatch

Risk: overlapping events cause the wrong context.

Control: confidence threshold and one-tap clarification.

### Prompt injection in note text

Risk: note contains instructions aimed at the model.

Control: treat note text as data, enforce schema, ignore tool-use directives, and do not grant the transformation model external tools.

### Sensitive content leakage in logs

Risk: raw note is written to observability systems.

Control: redact message bodies from logs and error reports.

## User controls

Minimum settings:

- connect/disconnect calendar;
- enable/disable post-meeting digests;
- enable/disable proactive resurfacing;
- default retention;
- export all data;
- delete all data;
- display original by default.
