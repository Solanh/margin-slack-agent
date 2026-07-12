import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AesGcmTokenCipher } from "../src/security/tokenCipher.js";
import { PostgresOAuthConnectionRepository } from "../src/storage/postgresOAuthConnectionRepository.js";

describe("PostgresOAuthConnectionRepository", () => {
  it("stores ciphertext rather than plaintext credentials", async () => {
    const cipher = new AesGcmTokenCipher(randomBytes(32), 2);
    const query = vi.fn(async (_sql: string, values: unknown[]) => ({
      rows: [
        {
          id: values[0],
          workspace_id: values[1],
          user_id: values[2],
          provider: values[3],
          access_token_ciphertext: values[4],
          refresh_token_ciphertext: values[5],
          scopes: values[6],
          expires_at: values[7],
          encryption_key_version: values[8],
          created_at: "2026-07-12T18:00:00.000Z",
          updated_at: "2026-07-12T18:00:00.000Z",
        },
      ],
      rowCount: 1,
    }));
    const repository = new PostgresOAuthConnectionRepository(
      { query } as never,
      cipher,
    );

    const connection = await repository.save({
      workspaceId: "T123",
      userId: "U123",
      provider: "google_calendar",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      scopes: ["calendar.readonly"],
      expiresAt: new Date("2026-07-12T19:00:00.000Z"),
    });

    const [, values] = query.mock.calls[0] ?? [];
    expect(values).not.toContain("access-secret");
    expect(values).not.toContain("refresh-secret");
    expect(String(values?.[4])).toMatch(/^v2\./);
    expect(String(values?.[5])).toMatch(/^v2\./);
    expect(connection.accessToken).toBe("access-secret");
    expect(connection.refreshToken).toBe("refresh-secret");
  });

  it("scopes reads and deletes by workspace and user", async () => {
    const cipher = new AesGcmTokenCipher(randomBytes(32));
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresOAuthConnectionRepository(
      { query } as never,
      cipher,
    );

    await repository.get(
      { workspaceId: "T123", userId: "U123" },
      "google_calendar",
    );
    await repository.delete(
      { workspaceId: "T123", userId: "U123" },
      "google_calendar",
    );

    expect(query.mock.calls[0]?.[1]).toEqual([
      "T123",
      "U123",
      "google_calendar",
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual([
      "T123",
      "U123",
      "google_calendar",
    ]);
  });
});
