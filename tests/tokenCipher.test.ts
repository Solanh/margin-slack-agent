import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AesGcmTokenCipher } from "../src/security/tokenCipher.js";

describe("AesGcmTokenCipher", () => {
  it("round-trips a token without exposing plaintext", () => {
    const cipher = new AesGcmTokenCipher(randomBytes(32), 3);
    const plaintext = "ya29.secret-access-token";

    const encrypted = cipher.encrypt(plaintext);

    expect(encrypted).toMatch(/^v3\./);
    expect(encrypted).not.toContain(plaintext);
    expect(cipher.decrypt(encrypted)).toBe(plaintext);
  });

  it("rejects tampered ciphertext", () => {
    const cipher = new AesGcmTokenCipher(randomBytes(32));
    const parts = cipher.encrypt("secret-token").split(".");
    const authTag = parts[2];
    if (!authTag) {
      throw new Error("Encrypted token did not include an auth tag");
    }
    parts[2] = `${authTag.startsWith("A") ? "B" : "A"}${authTag.slice(1)}`;

    expect(() => cipher.decrypt(parts.join("."))).toThrow(
      "Encrypted token authentication failed",
    );
  });

  it("requires a 256-bit key", () => {
    expect(() => new AesGcmTokenCipher(randomBytes(16))).toThrow(
      "exactly 32 bytes",
    );
  });
});
