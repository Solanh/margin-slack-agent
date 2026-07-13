import { App, LogLevel } from "@slack/bolt";
import type { Environment } from "../config.js";
import { SafeStructuredLogger } from "../observability/safeLogger.js";
import type { UserDataControlService } from "../services/userDataControls.js";
import type { PostMeetingDigestRepository } from "../storage/postMeetingDigestRepository.js";
import type { PreMeetingResurfacingRepository } from "../storage/preMeetingResurfacingRepository.js";
import { registerCalendarActions } from "./calendarActions.js";
import { registerNoteCardActions } from "./noteCardActions.js";
import { registerNoteRetrievalActions } from "./noteRetrievalActions.js";
import { registerPostMeetingDigestActions } from "./postMeetingDigestActions.js";
import { registerPreMeetingResurfacingActions } from "./preMeetingResurfacingActions.js";
import { registerCaptureShortcuts } from "./shortcutActions.js";
import {
  registerSlackListeners,
  type SlackListenerDependencies,
} from "./listeners.js";
import { installSlackApiPolicy } from "./slackApiExecutor.js";
import { registerUserDataActions } from "./userDataActions.js";

export interface SlackApplicationDependencies
  extends SlackListenerDependencies {
  postMeetingDigests: PostMeetingDigestRepository;
  preMeetingResurfacings: PreMeetingResurfacingRepository;
  userDataControls: UserDataControlService;
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
  const safeLogger = new SafeStructuredLogger(
    toSlackLogLevel(environment.LOG_LEVEL),
  );
  safeLogger.setName("margin_slack");

  const app = new App({
    token: environment.SLACK_BOT_TOKEN,
    signingSecret: environment.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: environment.SLACK_APP_TOKEN,
    logger: safeLogger as never,
    clientOptions: {
      rejectRateLimitedCalls: true,
    },
  });
  installSlackApiPolicy(app.client);

  app.error(async (error) => {
    safeLogger.logEvent(
      "error",
      {
        component: "slack",
        eventType: "unhandled_bolt_error",
      },
      error,
    );
  });

  registerSlackListeners(app, dependencies);
  registerCaptureShortcuts(app, dependencies);
  registerNoteCardActions(app, dependencies.noteCards);
  registerNoteRetrievalActions(app, dependencies.noteRetrieval);
  registerCalendarActions(app, dependencies.calendarConnections);
  registerPostMeetingDigestActions(app, dependencies.postMeetingDigests);
  registerPreMeetingResurfacingActions(
    app,
    dependencies.preMeetingResurfacings,
  );
  registerUserDataActions(
    app,
    dependencies.userDataControls,
    dependencies.calendarConnections,
  );

  return app;
}
