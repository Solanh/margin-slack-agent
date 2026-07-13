import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { GoogleCalendarConnectionService } from "../services/googleCalendarOAuth.js";
import type { RuntimeReadiness } from "./readiness.js";

export interface ApplicationHttpServerConfiguration {
  host: string;
  port: number;
  readiness: RuntimeReadiness;
  googleCalendar?: {
    redirectUri: string;
    connections: GoogleCalendarConnectionService;
  };
}

interface HttpResult {
  status: number;
  contentType: string;
  body: string;
}

export class ApplicationHttpServer {
  private server: Server | null = null;
  private readonly callbackPath: string | null;

  constructor(private readonly configuration: ApplicationHttpServerConfiguration) {
    this.callbackPath = configuration.googleCalendar
      ? new URL(configuration.googleCalendar.redirectUri).pathname
      : null;
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((request, response) => {
      void this.handle(request.url, request.method).then(
        (result) => {
          response.writeHead(result.status, this.headers(result.contentType));
          response.end(result.body);
        },
        () => {
          response.writeHead(
            500,
            this.headers("text/html; charset=utf-8"),
          );
          response.end(
            this.page(
              "Request failed",
              "Margin could not complete this request. Return to Slack and try again.",
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

  getPort(): number | null {
    const address = this.server?.address();
    return address && typeof address === "object"
      ? (address as AddressInfo).port
      : null;
  }

  private async handle(
    rawUrl: string | undefined,
    method: string | undefined,
  ): Promise<HttpResult> {
    const url = new URL(rawUrl ?? "/", "http://localhost");

    if (method !== "GET") {
      return {
        status: 405,
        contentType: "text/plain; charset=utf-8",
        body: "Method not allowed",
      };
    }

    if (url.pathname === "/healthz") {
      return {
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: "ok",
      };
    }

    if (url.pathname === "/readyz") {
      const snapshot = await this.configuration.readiness.snapshot();
      return {
        status: snapshot.ready ? 200 : 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(snapshot),
      };
    }

    if (
      !this.configuration.googleCalendar ||
      !this.callbackPath ||
      url.pathname !== this.callbackPath
    ) {
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

    await this.configuration.googleCalendar.connections.completeAuthorization(
      state,
      code,
    );
    return {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: this.page(
        "Google Calendar connected",
        "Margin can now use read-only event metadata to identify the meeting around a note. You can close this tab and return to Slack.",
      ),
    };
  }

  private headers(contentType: string): Record<string, string> {
    return {
      "content-type": contentType,
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    };
  }

  private page(title: string, message: string): string {
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1>${title}</h1><p>${message}</p></body></html>`;
  }
}
