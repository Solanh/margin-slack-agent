import { describe, expect, it, vi } from "vitest";
import { CaptureRawNoteService } from "../src/services/captureRawNote.js";
import type {
  CreateRawNoteInput,
  RawNoteRepository,
} from "../src/storage/noteRepository.js";

function createRepository(): RawNoteRepository {
  return {
    createRaw: vi.fn(async (input: CreateRawNoteInput) => ({
      id: "note-1",
      ...input,
      createdAt: new Date("2026-07-12T18:00:00.000Z"),
    })),
  };
}

describe("CaptureRawNoteService", () => {
  it("passes the exact raw text to the first durable boundary", async () => {
    const repository = createRepository();
    const service = new CaptureRawNoteService(repository);
    const rawText = "  important: keep my exact spacing  ";

    const note = await service.capture({
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText,
    });

    expect(repository.createRaw).toHaveBeenCalledWith({
      workspaceId: "T123",
      userId: "U123",
      sourceChannelId: "D123",
      sourceMessageTs: "123.456",
      rawText,
    });
    expect(note.rawText).toBe(rawText);
  });

  it("rejects whitespace-only notes before calling storage", async () => {
    const repository = createRepository();
    const service = new CaptureRawNoteService(repository);

    await expect(
      service.capture({
        workspaceId: "T123",
        userId: "U123",
        sourceChannelId: "D123",
        sourceMessageTs: "123.456",
        rawText: "   ",
      }),
    ).rejects.toThrow("non-whitespace");

    expect(repository.createRaw).not.toHaveBeenCalled();
  });
});
