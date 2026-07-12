import type { WebClient } from "@slack/web-api";
import type { OwnerScope } from "../domain/note.js";
import { describeError } from "../observability/safeLogger.js";
import type {
  PostMeetingDigest,
  PostMeetingDigestRepository,
  SlackMessageReference,
} from "../storage/postMeetingDigestRepository.js";
import {
  buildPostMeetingDigestBlocks,
  buildPostMeetingDigestFallback,
} from "../slack/views/postMeetingDigest.js";
import { nextDurableSlackRetryAt } from "../slack/slackApiExecutor.js";

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
      console.error("Post-meeting digest sweep failed", describeError(error));
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        console.error("Post-meeting digest sweep failed", describeError(error));
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
          if (await this.deliver(digest, now)) {
            delivered += 1;
          }
        } catch (error) {
          failed += 1;
          await this.repository.markFailed(
            ownerOf(digest),
            digest.id,
            safeErrorCode(error),
            nextDurableSlackRetryAt(error, now, digest.attempts),
          );
        }
      }

      return { prepared, claimed: claimed.length, delivered, failed };
    } finally {
      this.running = false;
    }
  }

  private async deliver(
    digest: PostMeetingDigest,
    deliveredAt: Date,
  ): Promise<boolean> {
    const owner = ownerOf(digest);
    if (!(await this.repository.areDigestsEnabled(owner))) {
      await this.repository.markFailed(
        owner,
        digest.id,
        "digests_disabled",
        new Date(deliveredAt.getTime() + 24 * 60 * 60 * 1000),
      );
      return false;
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
    return true;
  }
}

function ownerOf(digest: PostMeetingDigest): OwnerScope {
  return { workspaceId: digest.workspaceId, userId: digest.userId };
}

function safeErrorCode(error: unknown): string {
  const descriptor = describeError(error);
  return descriptor.code ?? `${descriptor.category}_${descriptor.name}`;
}
