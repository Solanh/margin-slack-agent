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

const EncryptionEnvironmentSchema = z.object({
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive().default(1),
});

const AIEnvironmentSchema = z.object({
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
});

const GoogleEnvironmentSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  OAUTH_HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  OAUTH_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const EnvironmentSchema = SlackEnvironmentSchema.merge(
  DatabaseEnvironmentSchema,
);

export type Environment = z.infer<typeof EnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof DatabaseEnvironmentSchema>;
export type EncryptionEnvironment = z.infer<typeof EncryptionEnvironmentSchema>;
export type AIEnvironment = z.infer<typeof AIEnvironmentSchema>;
export type GoogleEnvironment = z.infer<typeof GoogleEnvironmentSchema>;

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

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return parseEnvironment("application", EnvironmentSchema, source);
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
  return parseEnvironment("Google OAuth", GoogleEnvironmentSchema, source);
}
