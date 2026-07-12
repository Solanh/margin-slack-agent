import { createHash, randomBytes } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { OwnerScope } from "../domain/note.js";
import type { OAuthProvider } from "./oauthConnectionRepository.js";
import type {
  OAuthAuthorizationState,
  OAuthAuthorizationStateRepository,
} from "./oauthAuthorizationStateRepository.js";

interface ConsumedStateRow extends QueryResultRow {
  workspace_id: string;
  user_id: string;
}

const INSERT_SQL = `
  INSERT INTO oauth_authorization_states (
    state_hash,
    workspace_id,
    user_id,
    provider,
    expires_at
  )
  VALUES ($1, $2, $3, $4, $5)
`;

const CONSUME_SQL = `
  UPDATE oauth_authorization_states
  SET consumed_at = $3
  WHERE state_hash = $1
    AND provider = $2
    AND consumed_at IS NULL
    AND expires_at > $3
  RETURNING workspace_id, user_id
`;

const DELETE_EXPIRED_SQL = `
  DELETE FROM oauth_authorization_states
  WHERE expires_at <= $1
     OR consumed_at IS NOT NULL
`;

export class PostgresOAuthAuthorizationStateRepository
  implements OAuthAuthorizationStateRepository
{
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async create(
    owner: OwnerScope,
    provider: OAuthProvider,
    expiresAt: Date,
  ): Promise<OAuthAuthorizationState> {
    if (expiresAt.getTime() <= Date.now()) {
      throw new Error("OAuth authorization state must expire in the future");
    }

    const state = randomBytes(32).toString("base64url");
    await this.pool.query(INSERT_SQL, [
      this.hash(state),
      owner.workspaceId,
      owner.userId,
      provider,
      expiresAt,
    ]);

    return { ...owner, state, provider, expiresAt };
  }

  async consume(
    state: string,
    provider: OAuthProvider,
    now = new Date(),
  ): Promise<OwnerScope | null> {
    if (!state) {
      return null;
    }

    const result = await this.pool.query<ConsumedStateRow>(CONSUME_SQL, [
      this.hash(state),
      provider,
      now,
    ]);
    const row = result.rows[0];

    return row
      ? { workspaceId: row.workspace_id, userId: row.user_id }
      : null;
  }

  async deleteExpired(now = new Date()): Promise<number> {
    const result = await this.pool.query(DELETE_EXPIRED_SQL, [now]);
    return result.rowCount ?? 0;
  }

  private hash(state: string): string {
    return createHash("sha256").update(state, "utf8").digest("hex");
  }
}
