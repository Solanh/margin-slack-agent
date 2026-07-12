import type { WebClient } from "@slack/web-api";
import type { OwnerScope } from "../domain/note.js";
import { describeError } from "../observability/safeLogger.js";
import type { MeetingRepository } from "../storage/meetingRepository.js";
import type {
  PreMeetingResurfacing,
  PreMeetingResurfacingRepository,
} from "../storage/preMeetingResurfacingRepository.js";
import type { SlackMessageReference } from "../storage/postMeetingDigestRepository.js";
import {
  buildPreMeetingResurfacingBlocks,
  buildPreMeetingResurfacingFallback,
} from "../slack/views/preMeetingResurfacing.js";
import type { GoogleCalendarApiService } from "./googleCalendarApi.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_HORIZON_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEAD_MS = 10 * 60 * 1000;

export interface PreMeetingResurfacingRunResult {
  owners: number;
  prepared: number;
  claimed: number;
  delivered: number;
  failed: number;
}

export class PreMeetingResurfacingService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly repository: PreMeetingResurfacingRepository,
    private readonly meetings: MeetingRepository,
    private readonly calendar: GoogleCalendarApiService,
    private readonly client: WebClient,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly horizonMs = DEFAULT_HORIZON_MS,
    private readonly leadMs = DEFAULT_LEAD_MS,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.runOnce().catch((error: unknown) => {
      console.error("Pre-meeting resurfacing sweep failed", describeError(error));
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        console.error("Pre-meeting resurfacing sweep failed", describeError(error));
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

  async runOnce(now = new Date()): Promise<PreMeetingResurfacingRunResult> {
    if (this.running) {
      return { owners: 0, prepared: 0, claimed: 0, delivered: 0, failed: 0 };
    }
    this.running = true;
    try {
      const owners = await this.repository.listEligibleOwners(100);
      let prepared = 0;
      for (const owner of owners) {
        prepared += await this.prepareOwner(owner, now);
      }

      const claimed = await this.repository.claimDue(now, 20);
      let delivered = 0;
      let failed = 0;
      for (const resurfacing of claimed) {
        try {
          await this.deliver(resurfacing, now);
          delivered += 1;
        } catch (error) {
          failed += 1;
          await this.repository.markFailed(
            ownerOf(resurfacing),
            resurfacing.id,
            safeErrorCode(error),
            new Date(now.getTime() + retryDelayMs(resurfacing.attempts)),
          );
        }
      }

      return {
        owners: owners.length,
        prepared,
        claimed: claimed.length,
        delivered,
        failed,
      };
    } finally {
      this.running = false;
    }
  }

  private async prepareOwner(owner: OwnerScope, now: Date): Promise<number> {
    let events;
    try {
      events = await this.calendar.listUpcomingEvents(
        owner,
        now,
        this.horizonMs,
      );
    } catch {
      // Missing or failed Calendar access never creates a guessed reminder.
      return 0;
    }

    let prepared = 0;
    for (const event of events) {
      if (!event.seriesKey || event.startsAt.getTime() <= now.getTime()) {
        continue;
      }
      const meeting = await this.meetings.save({
        ...owner,
        provider: "google_calendar",
        providerEventId: event.providerEventId,
        seriesKey: event.seriesKey,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        participants: event.participants,
        confidence: "high",
      });
      const scheduledFor = new Date(
        Math.max(now.getTime(), event.startsAt.getTime() - this.leadMs),
      );
      if (
        await this.repository.prepareForUpcoming({
          ...owner,
          upcomingMeetingId: meeting.id,
          seriesKey: event.seriesKey,
          scheduledFor,
        })
      ) {
        prepared += 1;
      }
    }
    return prepared;
  }

  private async deliver(
    resurfacing: PreMeetingResurfacing,
    deliveredAt: Date,
  ): Promise<void> {
    const owner = ownerOf(resurfacing);
    const content = await this.repository.getContent(owner, resurfacing.id);
    if (!content || content.notes.length === 0) {
      throw new Error("resurfacing_content_unavailable");
    }

    const text = buildPreMeetingResurfacingFallback(content);
    const blocks = buildPreMeetingResurfacingBlocks(content) as never;
    let reference: SlackMessageReference;

    if (resurfacing.slackChannelId && resurfacing.slackMessageTs) {
      await this.client.chat.update({
        channel: resurfacing.slackChannelId,
        ts: resurfacing.slackMessageTs,
        text,
        blocks,
      });
      reference = {
        channelId: resurfacing.slackChannelId,
        messageTs: resurfacing.slackMessageTs,
      };
    } else {
      const opened = await this.client.conversations.open({
        users: resurfacing.userId,
      });
      const channelId = opened.channel?.id;
      if (!channelId || !channelId.startsWith("D")) {
        throw new Error("private_resurfacing_channel_unavailable");
      }
      const posted = await this.client.chat.postMessage({
        channel: channelId,
        text,
        blocks,
      });
      if (!posted.ts) {
        throw new Error("resurfacing_message_timestamp_unavailable");
      }
      reference = { channelId, messageTs: posted.ts };
    }

    await this.repository.markDelivered(
      owner,
      resurfacing.id,
      reference,
      deliveredAt,
    );
  }
}

function ownerOf(resurfacing: PreMeetingResurfacing): OwnerScope {
  return {
    workspaceId: resurfacing.workspaceId,
    userId: resurfacing.userId,
  };
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(6, attempts - 1));
  return Math.min(60 * 60 * 1000, 60_000 * 2 ** exponent);
}

function safeErrorCode(error: unknown): string {
  const descriptor = describeError(error);
  return descriptor.code ?? `${descriptor.category}_${descriptor.name}`;
}
