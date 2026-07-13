# Demo memory workflows

Margin's MCP server now supports a focused private-memory demo without recording or transcribing a meeting.

## 1. Remember an exact Slack decision

Call `margin.capture_note` with the exact user-selected text. When the MCP host has authenticated Slack context, it may also include the current channel or message identifiers and permalink.

```json
{
  "text": "Keep customer workflows backward compatible",
  "noteType": "decision",
  "priority": "high",
  "source": {
    "channelId": "C123",
    "messageTs": "1720900000.000100",
    "permalink": "https://workspace.slack.com/archives/C123/p1720900000000100"
  }
}
```

Margin preserves `text` as the immutable original. Source metadata is optional and must come from trusted host context; the tool does not read channel history or invent a source.

Equivalent retries return the same note instead of creating duplicates.

## 2. Review uncertain memory

Call `margin.list_needs_review` to return unconfirmed notes with one or more explicit reasons:

- `verbatim_only`: no organized view was persisted;
- `meeting_context`: meeting selection needs clarification;
- `uncertainties`: the note contains explicit transformation uncertainties.

After the user verifies the current state, call `margin.confirm_note_review` with the note ID. Confirmation does not alter the immutable original, publish to Slack, or hide the note from normal search.

## Suggested demo

1. Select a Slack message containing a product decision.
2. Ask the MCP host to remember it as a high-priority decision.
3. Show the returned note with its exact original and Slack source.
4. Ask, "What memories need my review?"
5. Confirm the captured note.
6. Run the review query again to show an empty queue.
7. Create a durable Slack reminder from the note with `margin.create_reminder`.

This demonstrates deliberate capture, provenance, uncertainty visibility, explicit confirmation, retrieval, and follow-through without a meeting recorder or a Margin-owned model API key.
