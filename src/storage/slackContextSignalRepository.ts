import type { OwnerScope } from "../domain/note.js";

export interface SlackHuddleState extends OwnerScope {
  callId: string | null;
  observedAt: Date;
  expiresAt: Date;
  sourceEventTs: string | null;
}

export interface SlackActiveContext extends OwnerScope {
  entityType: "channel" | "message";
  channelId: string;
  messageTs: string | null;
  observedAt: Date;
  expiresAt: Date;
  sourceEventTs: string | null;
}

export interface SaveSlackHuddleStateInput extends OwnerScope {
  callId: string | null;
  observedAt: Date;
  expiresAt: Date;
  sourceEventTs?: string | null;
}

export interface SaveSlackActiveContextInput extends OwnerScope {
  entityType: SlackActiveContext["entityType"];
  channelId: string;
  messageTs: string | null;
  observedAt: Date;
  expiresAt: Date;
  sourceEventTs?: string | null;
}

export interface SlackContextSignalRepository {
  isKnownOwner(owner: OwnerScope): Promise<boolean>;

  saveHuddleState(input: SaveSlackHuddleStateInput): Promise<SlackHuddleState>;
  deleteHuddleState(owner: OwnerScope): Promise<boolean>;
  getActiveHuddle(
    owner: OwnerScope,
    at?: Date,
  ): Promise<SlackHuddleState | null>;

  saveActiveContext(
    input: SaveSlackActiveContextInput,
  ): Promise<SlackActiveContext>;
  deleteActiveContext(owner: OwnerScope): Promise<boolean>;
  getActiveContext(
    owner: OwnerScope,
    at?: Date,
  ): Promise<SlackActiveContext | null>;

  deleteExpired(now?: Date): Promise<number>;
}
