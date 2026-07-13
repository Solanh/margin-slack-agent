import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface SlackManifest {
  oauth_config?: {
    scopes?: {
      bot?: string[];
    };
  };
  settings?: {
    event_subscriptions?: {
      bot_events?: string[];
    };
  };
}

async function loadManifest(): Promise<SlackManifest> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), "manifest.json"), "utf8"),
  ) as SlackManifest;
}

describe("Slack manifest", () => {
  it("includes every scope required by implemented private delivery paths", async () => {
    const manifest = await loadManifest();
    const scopes = manifest.oauth_config?.scopes?.bot ?? [];

    expect(scopes).toEqual(
      expect.arrayContaining([
        "assistant:write",
        "chat:write",
        "files:write",
        "im:history",
        "im:write",
        "users:read",
      ]),
    );
    expect(scopes).not.toContain("calls:read");
  });

  it("subscribes to the implemented private Agent and huddle events", async () => {
    const manifest = await loadManifest();
    const events = manifest.settings?.event_subscriptions?.bot_events ?? [];

    expect(events).toEqual(
      expect.arrayContaining([
        "app_home_opened",
        "app_context_changed",
        "message.im",
        "user_huddle_changed",
      ]),
    );
  });
});
