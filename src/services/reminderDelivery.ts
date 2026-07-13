import type { WebClient } from "@slack/web-api";
import type { OwnerScope } from "../domain/note.js";
import { describeError } from "../observability/safeLogger.js";
import {
  buildReminderDeliveryBlocks,
  buildReminderDeliveryFallback,
} from "../slack/views/reminderDelivery.js";
import { nextDurableSlackRetryAt } from "../slack/slackApiExecutor.js";
import type {
  DueReminder,
  ReminderDeliveryRepository,
} from "../storage/reminderRepository.js";

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 20;

export interface ReminderDeliveryRunResult {
  claimed: number;
  delivered: number;
  failed: number;
}

export class ReminderDeliveryService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly repository: ReminderDeliveryRepository,
    private readonly client: WebClient,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly batchSize = DEFAULT_BATCH_SIZE,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.runOnce().catch((error: unknown) => {
      console.error("Reminder delivery sweep failed", describeError(error));
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        console.error("Reminder delivery sweep failed", describeError(error));
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

  async runOnce(now = new Date()): Promise<ReminderDeliveryRunResult> {
    if (this.running) {
      return { claimed: 0, delivered: 0, failed: 0 };
    }
    this.running = true;
    try {
      const reminders = await this.repository.claimDue(now, this.batchSize);
      let delivered = 0;
      let failed = 0;

      for (const reminder of reminders) {
        try {
          await this.deliver(reminder, now);
          delivered += 1;
        } catch (error) {
          failed += 1;
          await this.repository.markFailed(
            ownerOf(reminder),
            reminder.id,
            safeErrorCode(error),
            nextDurableSlackRetryAt(error, now, reminder.attempts),
          );
        }
      }

      return { claimed: reminders.length, delivered, failed };
    } finally {
      this.running = false;
    }
  }

  private async deliver(reminder: DueReminder, deliveredAt: Date): Promise<void> {
    const opened = await this.client.conversations.open({ users: reminder.userId });
    const channelId = opened.channel?.id;
    if (!channelId || !channelId.startsWith("D")) {
      throw new Error("private_reminder_channel_unavailable");
    }

    const posted = await this.client.chat.postMessage({
      channel: channelId,
      text: buildReminderDeliveryFallback(reminder),
      blocks: buildReminderDeliveryBlocks(reminder) as never,
      client_msg_id: reminder.id,
    });
    if (!posted.ts) {
      throw new Error("reminder_message_timestamp_unavailable");
    }

    await this.repository.markDelivered(
      ownerOf(reminder),
      reminder.id,
      { channelId, messageTs: posted.ts },
      deliveredAt,
    );
  }
}

function ownerOf(reminder: DueReminder): OwnerScope {
  return { workspaceId: reminder.workspaceId, userId: reminder.userId };
}

function safeErrorCode(error: unknown): string {
  const descriptor = describeError(error);
  return descriptor.code ?? `${descriptor.category}_${descriptor.name}`;
}
