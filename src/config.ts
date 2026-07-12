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

const EnvironmentSchema = SlackEnvironmentSchema.merge(
  DatabaseEnvironmentSchema,
);

export type Environment = z.infer<typeof EnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof DatabaseEnvironmentSchema>;
export type EncryptionEnvironment = z.infer<typeof EncryptionEnvironmentSchema>;
export type AIEnvironment = z.infer<typeof AIEnvironmentSchema>;

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

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = EnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw formatConfigurationError("application", result.error);
  }

  return result.data;
}

export function loadDatabaseEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  const result = DatabaseEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw formatConfigurationError("database", result.error);
  }

  return result.data;
}

export function loadEncryptionEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): EncryptionEnvironment {
  const result = EncryptionEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw formatConfigurationError("token encryption", result.error);
  }

  return result.data;
}

export function loadAIEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): AIEnvironment {
  const result = AIEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw formatConfigurationError("AI", result.error);
  }

  return result.data;
}
