import type { OwnerScope } from "../domain/note.js";
import type { OAuthProvider } from "./oauthConnectionRepository.js";

export interface OAuthAuthorizationState extends OwnerScope {
  state: string;
  provider: OAuthProvider;
  expiresAt: Date;
}

export interface OAuthAuthorizationStateRepository {
  create(
    owner: OwnerScope,
    provider: OAuthProvider,
    expiresAt: Date,
  ): Promise<OAuthAuthorizationState>;

  consume(
    state: string,
    provider: OAuthProvider,
    now?: Date,
  ): Promise<OwnerScope | null>;

  deleteExpired(now?: Date): Promise<number>;
}
