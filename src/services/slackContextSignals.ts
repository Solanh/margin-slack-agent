import type { OwnerScope } from "../domain/note.js";
import type {
  SlackActiveContext,
  SlackContextSignalRepository,
  SlackHuddleState,
} from "../storage/slackContextSignalRepository.js";

const APP_CONTEXT_TTL_MS = 15 * 60 * 1000;
const HUDDLE_FALLBACK_TTL_MS = 30 * 60 * 1000;
const HUDDLE_MAX_TTL_MS = 8 * 60 * 60 * 1000;

export interface ParsedSlackContextEntity {
  entityType: "channel" | "message";
  channelId: string;
  messageTs: string | null;
}

export interface SlackUserHuddleSnapshot {
  userId: string;
  state: string | null;
  callId: string | null;
  expirationSeconds: number | null;
}

export class SlackContextSignalService {
  constructor(private readonly repository: SlackContextSignalRepository) {}

  async recordHuddleEvent(
    workspaceId: string,
    event: unknown,
  ): Promise<SlackHuddleState | null> {
    const parsed = parseHuddleEvent(event);
    if (!parsed) {
      return null;
    }

    const owner = { workspaceId, userId: parsed.snapshot.userId };
    if (!(await this.repository.isKnownOwner(owner))) {
      // user_huddle_changed is workspace-wide. Avoid retaining state for users
      // who have not interacted with Margin or connected a Margin integration.
      return null;
    }

    return this.applyHuddleSnapshot(
      owner,
      parsed.snapshot,
      parsed.observedAt,
      parsed.sourceEventTs,
    );
  }

  async recordHuddleUserProfile(
    owner: OwnerScope,
    user: unknown,
    observedAt = new Date(),
  ): Promise<SlackHuddleState | null> {
    const snapshot = parseHuddleUser(user);
    if (!snapshot || snapshot.userId !== owner.userId) {
      return null;
    }

    return this.applyHuddleSnapshot(owner, snapshot, observedAt, null);
  }

  async recordAppContext(
    owner: OwnerScope,
    context: unknown,
    observedAt = new Date(),
    sourceEventTs: string | null = null,
    requireKnownOwner = true,
  ): Promise<SlackActiveContext | null> {
    if (
      requireKnownOwner &&
      !(await this.repository.isKnownOwner(owner))
    ) {
      return null;
    }

    const entity = parseSlackAppContext(context, owner.workspaceId);
    if (!entity) {
      await this.repository.deleteActiveContext(owner);
      return null;
    }

    return this.repository.saveActiveContext({
      ...owner,
      ...entity,
      observedAt,
      expiresAt: new Date(observedAt.getTime() + APP_CONTEXT_TTL_MS),
      sourceEventTs,
    });
  }

  getActiveHuddle(owner: OwnerScope, at?: Date) {
    return this.repository.getActiveHuddle(owner, at);
  }

  getActiveContext(owner: OwnerScope, at?: Date) {
    return this.repository.getActiveContext(owner, at);
  }

  deleteExpired(now?: Date) {
    return this.repository.deleteExpired(now);
  }

  private async applyHuddleSnapshot(
    owner: OwnerScope,
    snapshot: SlackUserHuddleSnapshot,
    observedAt: Date,
    sourceEventTs: string | null,
  ): Promise<SlackHuddleState | null> {
    if (snapshot.state !== "in_a_huddle") {
      await this.repository.deleteHuddleState(owner);
      return null;
    }

    const expiresAt = resolveHuddleExpiration(
      observedAt,
      snapshot.expirationSeconds,
    );

    return this.repository.saveHuddleState({
      ...owner,
      callId: snapshot.callId,
      observedAt,
      expiresAt,
      sourceEventTs,
    });
  }
}

export function parseHuddleEvent(event: unknown): {
  snapshot: SlackUserHuddleSnapshot;
  observedAt: Date;
  sourceEventTs: string | null;
} | null {
  const record = asRecord(event);
  if (!record || record.type !== "user_huddle_changed") {
    return null;
  }

  const snapshot = parseHuddleUser(record.user);
  if (!snapshot) {
    return null;
  }

  const sourceEventTs =
    typeof record.event_ts === "string" ? record.event_ts : null;
  const observedAt = slackTimestampToDate(sourceEventTs) ?? new Date();

  return { snapshot, observedAt, sourceEventTs };
}

export function parseHuddleUser(user: unknown): SlackUserHuddleSnapshot | null {
  const record = asRecord(user);
  if (!record || typeof record.id !== "string" || !record.id) {
    return null;
  }

  const profile = asRecord(record.profile);
  if (!profile) {
    return null;
  }

  return {
    userId: record.id,
    state:
      typeof profile.huddle_state === "string"
        ? profile.huddle_state
        : null,
    callId:
      typeof profile.huddle_state_call_id === "string" &&
      profile.huddle_state_call_id
        ? profile.huddle_state_call_id
        : null,
    expirationSeconds:
      typeof profile.huddle_state_expiration_ts === "number" &&
      Number.isFinite(profile.huddle_state_expiration_ts)
        ? profile.huddle_state_expiration_ts
        : null,
  };
}

export function parseSlackAppContext(
  context: unknown,
  workspaceId: string,
): ParsedSlackContextEntity | null {
  const record = asRecord(context);
  if (!record || !Array.isArray(record.entities)) {
    return null;
  }

  for (const candidate of record.entities) {
    const entity = asRecord(candidate);
    if (!entity) {
      continue;
    }
    if (
      typeof entity.team_id === "string" &&
      entity.team_id !== workspaceId
    ) {
      continue;
    }

    if (entity.type === "slack#/types/message_context") {
      const value = asRecord(entity.value);
      if (
        value &&
        isSlackConversationId(value.channel_id) &&
        typeof value.message_ts === "string" &&
        value.message_ts
      ) {
        return {
          entityType: "message",
          channelId: value.channel_id,
          messageTs: value.message_ts,
        };
      }
    }

    if (
      entity.type === "slack#/types/channel_id" &&
      isSlackConversationId(entity.value)
    ) {
      return {
        entityType: "channel",
        channelId: entity.value,
        messageTs: null,
      };
    }
  }

  return null;
}

function resolveHuddleExpiration(
  observedAt: Date,
  expirationSeconds: number | null,
): Date {
  const fallback = observedAt.getTime() + HUDDLE_FALLBACK_TTL_MS;
  if (expirationSeconds === null) {
    return new Date(fallback);
  }

  const reported = expirationSeconds * 1000;
  if (reported <= observedAt.getTime()) {
    return new Date(fallback);
  }

  return new Date(
    Math.min(reported, observedAt.getTime() + HUDDLE_MAX_TTL_MS),
  );
}

function slackTimestampToDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const seconds = Number.parseFloat(value);
  if (!Number.isFinite(seconds)) {
    return null;
  }
  return new Date(seconds * 1000);
}

function isSlackConversationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[CDG][A-Z0-9]+$/u.test(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
