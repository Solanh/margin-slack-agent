import type { OwnerScope } from "../domain/note.js";

export type OAuthProvider = "google_calendar";

export interface OAuthConnection extends OwnerScope {
  id: string;
  provider: OAuthProvider;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
  encryptionKeyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveOAuthConnectionInput extends OwnerScope {
  provider: OAuthProvider;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
}

export interface OAuthConnectionRepository {
  save(input: SaveOAuthConnectionInput): Promise<OAuthConnection>;
  get(
    owner: OwnerScope,
    provider: OAuthProvider,
  ): Promise<OAuthConnection | null>;
  delete(owner: OwnerScope, provider: OAuthProvider): Promise<boolean>;
}
