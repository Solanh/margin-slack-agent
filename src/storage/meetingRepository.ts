import type {
  MeetingContext,
  OwnerScope,
} from "../domain/note.js";

export interface SaveMeetingInput extends OwnerScope {
  provider: MeetingContext["provider"];
  providerEventId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  participants: string[];
  confidence: MeetingContext["confidence"];
}

export interface MeetingRepository {
  save(input: SaveMeetingInput): Promise<MeetingContext>;
  getById(owner: OwnerScope, id: string): Promise<MeetingContext | null>;
  listOverlapping(
    owner: OwnerScope,
    startsBefore: Date,
    endsAfter: Date,
  ): Promise<MeetingContext[]>;
}
