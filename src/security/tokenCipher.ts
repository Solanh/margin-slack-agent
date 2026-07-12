import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface TokenCipher {
  readonly keyVersion: number;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export class AesGcmTokenCipher implements TokenCipher {
  readonly keyVersion: number;

  constructor(
    private readonly key: Buffer,
    keyVersion = 1,
  ) {
    if (key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
    if (!Number.isInteger(keyVersion) || keyVersion < 1) {
      throw new Error("Token encryption key version must be a positive integer");
    }

    this.keyVersion = keyVersion;
  }

  static fromBase64(encodedKey: string, keyVersion = 1): AesGcmTokenCipher {
    return new AesGcmTokenCipher(Buffer.from(encodedKey, "base64"), keyVersion);
  }

  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error("Cannot encrypt an empty token");
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(this.additionalAuthenticatedData());

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      `v${this.keyVersion}`,
      iv.toString("base64url"),
      authTag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(ciphertext: string): string {
    const [versionPart, ivPart, authTagPart, encryptedPart, extra] =
      ciphertext.split(".");

    if (
      extra !== undefined ||
      versionPart !== `v${this.keyVersion}` ||
      !ivPart ||
      !authTagPart ||
      !encryptedPart
    ) {
      throw new Error("Unsupported or malformed encrypted token");
    }

    const iv = Buffer.from(ivPart, "base64url");
    const authTag = Buffer.from(authTagPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("Malformed encrypted token");
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(this.additionalAuthenticatedData());
    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Encrypted token authentication failed");
    }
  }

  private additionalAuthenticatedData(): Buffer {
    return Buffer.from(`margin-token:v${this.keyVersion}`, "utf8");
  }
}
