import type { WebClient } from "@slack/web-api";
import type { OwnerScope } from "../domain/note.js";
import type {
  PostMeetingDigest,
  PostMeetingDigestRepository,
  SlackMessageReference,
} from "../storage/postMeetingDigestRepository.js";
import {
  buildPostMeetingDigestBlocks,
  buildPostMeetingDigestFallback,
} from "../slack/views/postMeetingDigest.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 20;

export interface PostMeetingDigestRunResult {
  prepared: number;
  claimed: number;
  delivered: number;
  failed: number;
}

export class PostMeetingDigestService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly repository: PostMeetingDigestRepository,
    private readonly client: WebClient,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly batchSize = DEFAULT_BATCH_SIZE,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.runOnce().catch((error: unknown) => {
      console.error("Post-meeting digest sweep failed", error);
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        console.error("Post-meeting digest sweep failed", error);
      });
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(now = new Date()): Promise<PostMeetingDigestRunResult> {
    if (this.running) {
      return { prepared: 0, claimed: 0, delivered: 0, failed: 0 };
    }
    this.running = true;
    try {
      const prepared = await this.repository.prepareDue(now, 100);
      const claimed = await this.repository.claimDue(now, this.batchSize);
      let delivered = 0;
      let failed = 0;

      for (const digest of claimed) {
        try {
          await this.deliver(digest, now);
          delivered += 1;
        } catch (error) {
          failed += 1;
          const retryAt = new Date(now.getTime() + retryDelayMs(digest.attempts));
          await this.repository.markFailed(
            ownerOf(digest),
            digest.id,
            safeErrorCode(error),
            retryAt,
          );
        }
      }

      return { prepared, claimed: claimed.length, delivered, failed };
    } finally {
      this.running = false;
    }
  }

  private async deliver(digest: PostMeetingDigest, deliveredAt: Date): Promise<void> {
    const owner = ownerOf(digest);
    if (!(await this.repository.areDigestsEnabled(owner))) {
      await this.repository.markFailed(
        owner,
        digest.id,
        "digests_disabled",
        new Date(deliveredAt.getTime() + 24 * 60 * 60 * 1000),
      );
      return;
    }

    const content = await this.repository.getContent(owner, digest.id);
    if (!content || content.notes.length === 0) {
      throw new Error("digest_content_unavailable");
    }

    const text = buildPostMeetingDigestFallback(content);
    const blocks = buildPostMeetingDigestBlocks(content) as never;
    let reference: SlackMessageReference;

    if (digest.slackChannelId && digest.slackMessageTs) {
      await this.client.chat.update({
        channel: digest.slackChannelId,
        ts: digest.slackMessageTs,
        text,
        blocks,
      });
      reference = {
        channelId: digest.slackChannelId,
        messageTs: digest.slackMessageTs,
      };
    } else {
      const opened = await this.client.conversations.open({ users: digest.userId });
      const channelId = opened.channel?.id;
      if (!channelId || !channelId.startsWith("D")) {
        throw new Error("private_digest_channel_unavailable");
      }
      const posted = await this.client.chat.postMessage({
        channel: channelId,
        text,
        blocks,
      });
      if (!posted.ts) {
        throw new Error("digest_message_timestamp_unavailable");
      }
      reference = { channelId, messageTs: posted.ts };
    }

    await this.repository.markDelivered(owner, digest.id, reference, deliveredAt);
  }
}

function ownerOf(digest: PostMeetingDigest): OwnerScope {
  return { workspaceId: digest.workspaceId, userId: digest.userId };
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(6, attempts - 1));
  return Math.min(60 * 60 * 1000, 60_000 * 2 ** exponent);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 120).replace(/[^a-zA-Z0-9_.:-]/gu, "_");
  }
  return "unknown_digest_delivery_error";
}
