import { createServer, type Server } from "node:http";
import type { GoogleCalendarConnectionService } from "../services/googleCalendarOAuth.js";

export interface GoogleOAuthCallbackServerConfiguration {
  host: string;
  port: number;
  redirectUri: string;
}

export class GoogleOAuthCallbackServer {
  private server: Server | null = null;
  private readonly callbackPath: string;

  constructor(
    private readonly configuration: GoogleOAuthCallbackServerConfiguration,
    private readonly connections: GoogleCalendarConnectionService,
  ) {
    const redirect = new URL(configuration.redirectUri);
    this.callbackPath = redirect.pathname;
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((request, response) => {
      void this.handle(request.url, request.method).then(
        (result) => {
          response.writeHead(result.status, {
            "content-type": result.contentType,
            "cache-control": "no-store",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          });
          response.end(result.body);
        },
        () => {
          response.writeHead(500, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          });
          response.end(
            this.page(
              "Calendar connection failed",
              "Margin could not complete the Google Calendar connection. Return to Slack and try again.",
            ),
          );
        },
      );
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(
        this.configuration.port,
        this.configuration.host,
        () => {
          this.server?.off("error", reject);
          resolve();
        },
      );
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async handle(
    rawUrl: string | undefined,
    method: string | undefined,
  ): Promise<{ status: number; contentType: string; body: string }> {
    const url = new URL(rawUrl ?? "/", "http://localhost");

    if (url.pathname === "/healthz") {
      return {
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: "ok",
      };
    }

    if (url.pathname !== this.callbackPath || method !== "GET") {
      return {
        status: 404,
        contentType: "text/plain; charset=utf-8",
        body: "Not found",
      };
    }

    const providerError = url.searchParams.get("error");
    if (providerError) {
      return {
        status: 400,
        contentType: "text/html; charset=utf-8",
        body: this.page(
          "Calendar connection cancelled",
          "Google did not authorize Calendar access. No calendar credentials were stored.",
        ),
      };
    }

    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || !code) {
      return {
        status: 400,
        contentType: "text/html; charset=utf-8",
        body: this.page(
          "Invalid callback",
          "The Google OAuth callback did not include the required authorization data.",
        ),
      };
    }

    await this.connections.completeAuthorization(state, code);
    return {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: this.page(
        "Google Calendar connected",
        "Margin can now use read-only event metadata to identify the meeting around a note. You can close this tab and return to Slack.",
      ),
    };
  }

  private page(title: string, message: string): string {
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>${title}</h1><p>${message}</p></body></html>`;
  }
}
