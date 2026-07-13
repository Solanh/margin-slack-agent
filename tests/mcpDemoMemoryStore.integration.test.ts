import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresMarginMcpNoteStore } from "../src/mcp/noteStore.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL MCP demo memory store", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid",
  });
  const store = new PostgresMarginMcpNoteStore(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("captures an idempotent note with Slack provenance and review state", async () => {
    const workspaceId = `T-${randomUUID()}`;
    const owner = { workspaceId, userId: "U-owner" };
    const input = {
      text: "Keep customer workflows backward compatible",
      noteType: "decision",
      priority: "high",
      requestKey: randomUUID(),
      source: {
        sourceType: "slack_message" as const,
        channelId: "C123",
        messageTs: "123.456",
        permalink: "https://example.slack.com/archives/C123/p123456",
      },
    };

    const first = await store.create(owner, input);
    const duplicate = await store.create(owner, input);

    expect(duplicate.id).toBe(first.id);
    expect(first).toMatchObject({
      rawText: input.text,
      noteType: "decision",
      priority: "high",
      sources: [
        {
          sourceType: "slack_message",
          channelId: "C123",
          messageTs: "123.456",
          permalink: input.source.permalink,
        },
      ],
      review: {
        reasons: ["verbatim_only"],
        confirmedAt: null,
      },
    });

    const needsReview = await store.listNeedsReview(owner, 10);
    expect(needsReview.map((item) => item.id)).toContain(first.id);
    expect(
      await store.listNeedsReview(
        { workspaceId, userId: "U-other" },
        10,
      ),
    ).toEqual([]);

    const confirmed = await store.confirmReview(owner, first.id);
    expect(confirmed?.review?.confirmedAt).toBeTruthy();
    expect(await store.listNeedsReview(owner, 10)).toEqual([]);
    expect(
      await store.confirmReview(
        { workspaceId, userId: "U-other" },
        first.id,
      ),
    ).toBeNull();

    await pool.query("DELETE FROM notes WHERE workspace_id = $1", [workspaceId]);
  });
});
