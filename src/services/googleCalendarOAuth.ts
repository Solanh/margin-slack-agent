import { z } from "zod";
import type { OwnerScope } from "../domain/note.js";
import type {
  OAuthConnection,
  OAuthConnectionRepository,
} from "../storage/oauthConnectionRepository.js";
import type { OAuthAuthorizationStateRepository } from "../storage/oauthAuthorizationStateRepository.js";

export const GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";

const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOCATION_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const STATE_LIFETIME_MS = 10 * 60 * 1000;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export interface GoogleOAuthConfiguration {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: Date | null;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class GoogleOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export class GoogleCalendarOAuthClient {
  constructor(
    private readonly configuration: GoogleOAuthConfiguration,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!configuration.clientId || !configuration.clientSecret) {
      throw new Error("Google OAuth client ID and secret are required");
    }
    new URL(configuration.redirectUri);
  }

  buildAuthorizationUrl(state: string): string {
    if (!state) {
      throw new Error("OAuth state is required");
    }

    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.searchParams.set("client_id", this.configuration.clientId);
    url.searchParams.set("redirect_uri", this.configuration.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<GoogleTokenSet> {
    if (!code) {
      throw new GoogleOAuthError("Google authorization code is missing");
    }

    return this.requestToken({
      code,
      client_id: this.configuration.clientId,
      client_secret: this.configuration.clientSecret,
      redirect_uri: this.configuration.redirectUri,
      grant_type: "authorization_code",
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
    if (!refreshToken) {
      throw new GoogleOAuthError("Google refresh token is missing");
    }

    const refreshed = await this.requestToken({
      refresh_token: refreshToken,
      client_id: this.configuration.clientId,
      client_secret: this.configuration.clientSecret,
      grant_type: "refresh_token",
    });

    return {
      ...refreshed,
      refreshToken,
    };
  }

  async revoke(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    const response = await this.fetchImpl(GOOGLE_REVOCATION_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }).toString(),
    });

    return response.ok;
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<GoogleTokenSet> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });

    const payload = await this.readJson(response);
    if (!response.ok) {
      throw new GoogleOAuthError(
        `Google token endpoint returned HTTP ${response.status}`,
      );
    }

    const parsed = TokenResponseSchema.parse(payload);
    const scopes = parsed.scope
      ? parsed.scope.split(/\s+/u).filter(Boolean)
      : [GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE];

    if (!scopes.includes(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE)) {
      throw new GoogleOAuthError(
        "Google did not grant the required read-only Calendar event scope",
      );
    }

    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? null,
      scopes,
      expiresAt: parsed.expires_in
        ? new Date(Date.now() + parsed.expires_in * 1000)
        : null,
    };
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new GoogleOAuthError("Google returned a non-JSON OAuth response");
    }
  }
}

export class GoogleCalendarConnectionService {
  constructor(
    private readonly states: OAuthAuthorizationStateRepository,
    private readonly connections: OAuthConnectionRepository,
    private readonly oauthClient: GoogleCalendarOAuthClient,
  ) {}

  async createAuthorizationUrl(owner: OwnerScope): Promise<string> {
    const authorizationState = await this.states.create(
      owner,
      "google_calendar",
      new Date(Date.now() + STATE_LIFETIME_MS),
    );

    return this.oauthClient.buildAuthorizationUrl(authorizationState.state);
  }

  async completeAuthorization(
    state: string,
    code: string,
  ): Promise<OAuthConnection> {
    const owner = await this.states.consume(state, "google_calendar");
    if (!owner) {
      throw new GoogleOAuthError("OAuth state is invalid, expired, or already used");
    }

    const [tokenSet, existing] = await Promise.all([
      this.oauthClient.exchangeCode(code),
      this.connections.get(owner, "google_calendar"),
    ]);
    const refreshToken = tokenSet.refreshToken ?? existing?.refreshToken ?? null;
    if (!refreshToken) {
      throw new GoogleOAuthError(
        "Google did not return offline credentials; reconnect and grant consent",
      );
    }

    return this.connections.save({
      ...owner,
      provider: "google_calendar",
      accessToken: tokenSet.accessToken,
      refreshToken,
      scopes: tokenSet.scopes,
      expiresAt: tokenSet.expiresAt,
    });
  }

  async isConnected(owner: OwnerScope): Promise<boolean> {
    return (
      (await this.connections.get(owner, "google_calendar")) !== null
    );
  }

  async disconnect(owner: OwnerScope): Promise<{
    disconnected: boolean;
    revokedRemotely: boolean;
  }> {
    const connection = await this.connections.get(owner, "google_calendar");
    if (!connection) {
      return { disconnected: false, revokedRemotely: false };
    }

    let revokedRemotely = false;
    try {
      revokedRemotely = await this.oauthClient.revoke(
        connection.refreshToken ?? connection.accessToken,
      );
    } catch {
      revokedRemotely = false;
    }

    await this.connections.delete(owner, "google_calendar");
    return { disconnected: true, revokedRemotely };
  }
}
