import { z } from "zod";

const SlackEnvironmentSchema = z.object({
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_APP_TOKEN: z.string().startsWith("xapp-"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

const DatabaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const HttpEnvironmentSchema = z.object({
  HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const EncryptionEnvironmentSchema = z.object({
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
});

const AIEnvironmentSchema = z.object({
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
});

const GoogleConfigurationSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  OAUTH_HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  OAUTH_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const EnvironmentSchema = SlackEnvironmentSchema.merge(
  DatabaseEnvironmentSchema,
).merge(HttpEnvironmentSchema);

export type Environment = z.infer<typeof EnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof DatabaseEnvironmentSchema>;
export type EncryptionEnvironment = z.infer<typeof EncryptionEnvironmentSchema>;
export type AIEnvironment = z.infer<typeof AIEnvironmentSchema>;
export type EnabledGoogleEnvironment = z.infer<typeof GoogleConfigurationSchema> & {
  enabled: true;
};
export type DisabledGoogleEnvironment = {
  enabled: false;
};
export type GoogleEnvironment =
  | EnabledGoogleEnvironment
  | DisabledGoogleEnvironment;

function formatConfigurationError(
  label: string,
  error: z.ZodError,
): Error {
  const fields = error.issues
    .map((issue) => issue.path.join("."))
    .filter(Boolean)
    .join(", ");

  return new Error(
    `Invalid ${label} configuration${fields ? `: ${fields}` : ""}. See .env.example and the setup documentation.`,
  );
}

function parseEnvironment<T>(
  label: string,
  schema: z.ZodType<T>,
  source: NodeJS.ProcessEnv,
): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw formatConfigurationError(label, result.error);
  }
  return result.data;
}

function normalizeApplicationEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...source,
    HTTP_HOST: source.HTTP_HOST ?? source.OAUTH_HTTP_HOST,
    HTTP_PORT: source.HTTP_PORT ?? source.OAUTH_HTTP_PORT,
  };
}

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return parseEnvironment(
    "application",
    EnvironmentSchema,
    normalizeApplicationEnvironment(source),
  );
}

export function loadDatabaseEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return parseEnvironment("database", DatabaseEnvironmentSchema, source);
}

export function loadEncryptionEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): EncryptionEnvironment {
  return parseEnvironment("token encryption", EncryptionEnvironmentSchema, source);
}

export function loadAIEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): AIEnvironment {
  return parseEnvironment("AI", AIEnvironmentSchema, source);
}

export function loadGoogleEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): GoogleEnvironment {
  const enabledValue = source.GOOGLE_CALENDAR_ENABLED?.trim().toLowerCase();
  if (
    enabledValue !== undefined &&
    enabledValue !== "" &&
    enabledValue !== "true" &&
    enabledValue !== "false"
  ) {
    throw new Error(
      "Invalid Google OAuth configuration: GOOGLE_CALENDAR_ENABLED must be true or false.",
    );
  }

  if (enabledValue === "false") {
    return { enabled: false };
  }

  const coreValues = [
    source.GOOGLE_CLIENT_ID,
    source.GOOGLE_CLIENT_SECRET,
    source.GOOGLE_REDIRECT_URI,
  ].map((value) => value?.trim() ?? "");
  const anyCoreValue = coreValues.some(Boolean);
  const allCoreValues = coreValues.every(Boolean);

  if (enabledValue !== "true" && !anyCoreValue) {
    return { enabled: false };
  }

  if (!allCoreValues) {
    throw new Error(
      "Invalid Google OAuth configuration: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must all be set when Calendar is enabled.",
    );
  }

  const configuration = parseEnvironment(
    "Google OAuth",
    GoogleConfigurationSchema,
    source,
  );
  return { enabled: true, ...configuration };
}
