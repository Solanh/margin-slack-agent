import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { OwnerScope } from "../domain/note.js";
import type { TokenCipher } from "../security/tokenCipher.js";
import type {
  OAuthConnection,
  OAuthConnectionRepository,
  OAuthProvider,
  SaveOAuthConnectionInput,
} from "./oauthConnectionRepository.js";

interface OAuthConnectionRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: OAuthProvider;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  scopes: string[];
  expires_at: Date | string | null;
  encryption_key_version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

const SAVE_SQL = `
  INSERT INTO oauth_connections (
    id,
    workspace_id,
    user_id,
    provider,
    access_token_ciphertext,
    refresh_token_ciphertext,
    scopes,
    expires_at,
    encryption_key_version
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (workspace_id, user_id, provider)
  DO UPDATE SET
    access_token_ciphertext = EXCLUDED.access_token_ciphertext,
    refresh_token_ciphertext = COALESCE(
      EXCLUDED.refresh_token_ciphertext,
      oauth_connections.refresh_token_ciphertext
    ),
    scopes = EXCLUDED.scopes,
    expires_at = EXCLUDED.expires_at,
    encryption_key_version = EXCLUDED.encryption_key_version
  RETURNING *
`;

const GET_SQL = `
  SELECT *
  FROM oauth_connections
  WHERE workspace_id = $1
    AND user_id = $2
    AND provider = $3
  LIMIT 1
`;

const DELETE_SQL = `
  DELETE FROM oauth_connections
  WHERE workspace_id = $1
    AND user_id = $2
    AND provider = $3
`;

export class PostgresOAuthConnectionRepository
  implements OAuthConnectionRepository
{
  constructor(
    private readonly pool: Pick<Pool, "query">,
    private readonly cipher: TokenCipher,
  ) {}

  async save(input: SaveOAuthConnectionInput): Promise<OAuthConnection> {
    const accessTokenCiphertext = this.cipher.encrypt(input.accessToken);
    const refreshTokenCiphertext = input.refreshToken
      ? this.cipher.encrypt(input.refreshToken)
      : null;

    const result = await this.pool.query<OAuthConnectionRow>(SAVE_SQL, [
      randomUUID(),
      input.workspaceId,
      input.userId,
      input.provider,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      input.scopes,
      input.expiresAt,
      this.cipher.keyVersion,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("PostgreSQL did not return the saved OAuth connection");
    }

    return this.mapRow(row);
  }

  async get(
    owner: OwnerScope,
    provider: OAuthProvider,
  ): Promise<OAuthConnection | null> {
    const result = await this.pool.query<OAuthConnectionRow>(GET_SQL, [
      owner.workspaceId,
      owner.userId,
      provider,
    ]);

    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async delete(owner: OwnerScope, provider: OAuthProvider): Promise<boolean> {
    const result = await this.pool.query(DELETE_SQL, [
      owner.workspaceId,
      owner.userId,
      provider,
    ]);

    return (result.rowCount ?? 0) > 0;
  }

  private mapRow(row: OAuthConnectionRow): OAuthConnection {
    if (row.encryption_key_version !== this.cipher.keyVersion) {
      throw new Error(
        `OAuth connection requires encryption key version ${row.encryption_key_version}`,
      );
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      provider: row.provider,
      accessToken: this.cipher.decrypt(row.access_token_ciphertext),
      refreshToken: row.refresh_token_ciphertext
        ? this.cipher.decrypt(row.refresh_token_ciphertext)
        : null,
      scopes: row.scopes,
      expiresAt: this.toDate(row.expires_at),
      encryptionKeyVersion: row.encryption_key_version,
      createdAt: this.toRequiredDate(row.created_at),
      updatedAt: this.toRequiredDate(row.updated_at),
    };
  }

  private toDate(value: Date | string | null): Date | null {
    return value === null ? null : this.toRequiredDate(value);
  }

  private toRequiredDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
