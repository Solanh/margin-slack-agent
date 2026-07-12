import { describe, expect, it, vi } from "vitest";
import { PostgresRawNoteRepository } from "../src/storage/postgresRawNoteRepository.js";

describe("PostgresRawNoteRepository", () => {
  it("uses a parameterized idempotent insert that never overwrites raw text", async () => {
    const query = vi.fn(async (_sql: string, values: unknown[]) => ({
      rows: [
        {
          id: "note-1",
          workspace_id: values[1],
          user_id: values[2],
          source_channel_id: values[3],
          source_message_ts: values[4],
          raw_text: values[5],
          created_at: "2026-07-12T18:00:00.000Z",
        },
      ],
    }));
    const repository = new PostgresRawNoteRepository({ query } as never);

    const note = await repository.createRaw({
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText: "exact original",
    });

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain(
      "DO UPDATE SET source_message_ts = notes.source_message_ts",
    );
    expect(sql).not.toMatch(/DO UPDATE SET[^;]*raw_text\s*=/s);
    expect(values).toEqual([
      expect.any(String),
      "T123",
      "U123",
      "D123",
      "123.456",
      "exact original",
    ]);
    expect(note.rawText).toBe("exact original");
  });
});
