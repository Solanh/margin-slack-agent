import { App, LogLevel } from "@slack/bolt";
import type { Environment } from "../config.js";
import type { RawNoteCapturer } from "../services/captureRawNote.js";
import { registerSlackListeners } from "./listeners.js";

function toSlackLogLevel(level: Environment["LOG_LEVEL"]): LogLevel {
  switch (level) {
    case "debug":
      return LogLevel.DEBUG;
    case "warn":
      return LogLevel.WARN;
    case "error":
      return LogLevel.ERROR;
    case "info":
    default:
      return LogLevel.INFO;
  }
}

export function createSlackApp(
  environment: Environment,
  rawNoteCapturer: RawNoteCapturer,
): App {
  const app = new App({
    token: environment.SLACK_BOT_TOKEN,
    signingSecret: environment.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: environment.SLACK_APP_TOKEN,
    logLevel: toSlackLogLevel(environment.LOG_LEVEL),
  });

  registerSlackListeners(app, { rawNoteCapturer });

  return app;
}
