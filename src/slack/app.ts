import { App, LogLevel } from "@slack/bolt";
import type { Environment } from "../config.js";
import type { PostMeetingDigestRepository } from "../storage/postMeetingDigestRepository.js";
import { registerCalendarActions } from "./calendarActions.js";
import { registerNoteCardActions } from "./noteCardActions.js";
import { registerPostMeetingDigestActions } from "./postMeetingDigestActions.js";
import {
  registerSlackListeners,
  type SlackListenerDependencies,
} from "./listeners.js";

export interface SlackApplicationDependencies
  extends SlackListenerDependencies {
  postMeetingDigests: PostMeetingDigestRepository;
}

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
  dependencies: SlackApplicationDependencies,
): App {
  const app = new App({
    token: environment.SLACK_BOT_TOKEN,
    signingSecret: environment.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: environment.SLACK_APP_TOKEN,
    logLevel: toSlackLogLevel(environment.LOG_LEVEL),
  });

  registerSlackListeners(app, dependencies);
  registerNoteCardActions(app, dependencies.noteCards);
  registerCalendarActions(app, dependencies.calendarConnections);
  registerPostMeetingDigestActions(app, dependencies.postMeetingDigests);

  return app;
}
