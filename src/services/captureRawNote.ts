import { z } from "zod";
import type { RawNote } from "../domain/note.js";
import type { RawNoteRepository } from "../storage/noteRepository.js";

const CaptureRawNoteInputSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  sourceChannelId: z.string().min(1),
  sourceMessageTs: z.string().min(1),
  rawText: z.string().refine((value) => value.trim().length > 0, {
    message: "A raw note must contain non-whitespace text",
  }),
});

export type CaptureRawNoteInput = z.infer<typeof CaptureRawNoteInputSchema>;

export interface RawNoteCapturer {
  capture(input: CaptureRawNoteInput): Promise<RawNote>;
}

export class CaptureRawNoteService implements RawNoteCapturer {
  constructor(private readonly repository: RawNoteRepository) {}

  async capture(input: CaptureRawNoteInput): Promise<RawNote> {
    const validated = CaptureRawNoteInputSchema.parse(input);

    // This repository call is deliberately the only operation in the service.
    // Calendar and AI enrichment must happen only after it resolves.
    return this.repository.createRaw(validated);
  }
}
