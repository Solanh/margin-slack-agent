import { afterEach, describe, expect, it } from "vitest";
import { ApplicationHttpServer } from "../src/http/applicationHttpServer.js";
import { RuntimeReadiness } from "../src/http/readiness.js";

const servers: ApplicationHttpServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("ApplicationHttpServer", () => {
  it("keeps liveness independent from runtime readiness", async () => {
    const readiness = new RuntimeReadiness({
      checkDatabase: async () => true,
      checkMigrations: async () => true,
      resurfacingRequired: false,
    });
    const server = new ApplicationHttpServer({
      host: "127.0.0.1",
      port: 0,
      readiness,
    });
    servers.push(server);
    await server.start();
    const port = server.getPort();
    expect(port).not.toBeNull();

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");

    const notReady = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(notReady.status).toBe(503);
    expect(await notReady.json()).toMatchObject({
      ready: false,
      checks: {
        database: true,
        migrations: true,
        slack: false,
        digestWorker: false,
        resurfacingWorker: true,
      },
    });

    readiness.markSlackStarted();
    readiness.markDigestWorkerStarted();
    const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ ready: true });
  });

  it("requires the resurfacing worker only when Calendar is enabled", async () => {
    const readiness = new RuntimeReadiness({
      checkDatabase: async () => true,
      checkMigrations: async () => true,
      resurfacingRequired: true,
    });
    readiness.markSlackStarted();
    readiness.markDigestWorkerStarted();

    const before = await readiness.snapshot();
    expect(before.ready).toBe(false);
    expect(before.checks.resurfacingWorker).toBe(false);

    readiness.markResurfacingWorkerStarted();
    await expect(readiness.snapshot()).resolves.toMatchObject({ ready: true });
  });

  it("returns not-ready when database or migration checks fail", async () => {
    const readiness = new RuntimeReadiness({
      checkDatabase: async () => {
        throw new Error("database unavailable");
      },
      checkMigrations: async () => false,
      resurfacingRequired: false,
    });
    readiness.markSlackStarted();
    readiness.markDigestWorkerStarted();

    await expect(readiness.snapshot()).resolves.toEqual({
      ready: false,
      checks: {
        database: false,
        migrations: false,
        slack: true,
        digestWorker: true,
        resurfacingWorker: true,
      },
    });
  });

  it("does not expose a Google callback route when Calendar is disabled", async () => {
    const readiness = new RuntimeReadiness({
      checkDatabase: async () => true,
      checkMigrations: async () => true,
      resurfacingRequired: false,
    });
    const server = new ApplicationHttpServer({
      host: "127.0.0.1",
      port: 0,
      readiness,
    });
    servers.push(server);
    await server.start();
    const response = await fetch(
      `http://127.0.0.1:${server.getPort()}/oauth/google/calendar/callback?state=x&code=y`,
    );
    expect(response.status).toBe(404);
  });
});
