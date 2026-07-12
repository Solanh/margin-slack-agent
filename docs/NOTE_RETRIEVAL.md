# Private Note Retrieval

Margin interprets a narrow set of explicit retrieval-shaped DMs and searches only the current user's persisted Margin notes.

## Supported requests

Examples:

```text
What did I note about customer workflows?
Find notes from Workflow Migration Review
What did I note about Maya?
Show unresolved high priority actions
List resolved questions about migration
```

The parser supports:

- topic or phrase terms;
- attached meeting-title terms;
- names or email-like identifiers explicitly present in note text;
- note type: decision, action, question, idea, or reference;
- priority: low, normal, high, or critical;
- state: open, resolved, archived, or broader unresolved.

`Unresolved` includes notes that are still open, have unresolved context, or retain model-identified uncertainty.

## Conservative intent boundary

Retrieval is recognized only when the message begins with an explicit retrieval form such as:

- `Find notes ...`
- `Show unresolved actions ...`
- `What did I note ...`
- `Do I have any questions ...`

A message such as:

```text
Find out whether migration affects customer workflows
```

is not interpreted as retrieval. It continues through ordinary durable note capture.

## Search boundary

The retrieval path queries only:

- `notes` owned by the current `(workspace_id, user_id)`;
- the owner-scoped meeting attached to each result.

It does not call:

- Slack search;
- channel history methods;
- direct-message history methods beyond the incoming app DM event;
- Real-Time Search;
- an LLM or embedding provider;
- Calendar APIs.

Topic, person, and meeting matching use PostgreSQL full-text search over the user's stored raw/organized note text and attached meeting title.

## Result card

Each result shows:

- current organized wording, when available;
- note type;
- priority;
- status;
- unresolved-context or uncertainty state;
- reminder wording/time;
- attached meeting title/date or capture date.

The raw original is not repeated in the result list. The owner can select **View original** to open a private modal containing:

- immutable original wording;
- current organized wording;
- meeting/capture context.

The action validates workspace, user, note ID, and DM channel before reading the original.

## No-results behavior

A no-results response states that only the user's saved notes were searched and provides example queries. The retrieval request is not stored as a new note.

## Database indexes

Migration `010_private_note_retrieval.sql` adds:

- a GIN full-text index over organized and raw note text;
- an owner/filter/date index;
- a GIN full-text index over meeting titles.

Every query still includes explicit workspace and user predicates, including the meeting join and original lookup.

## Verification

After migrations through 010:

1. Capture notes containing a topic and a mentioned name.
2. Attach one note to a meeting.
3. Send the example queries above in Margin's private Messages tab.
4. Confirm results contain only the current user's notes.
5. Select **View original** and confirm the immutable text appears in a private modal.
6. Send `Find out whether migration affects customers` and confirm it is captured as a note rather than interpreted as search.
7. Search a nonexistent topic and confirm the useful no-results response.
