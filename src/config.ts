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

const EnvironmentSchema = SlackEnvironmentSchema.merge(
  DatabaseEnvironmentSchema,
);

export type Environment = z.infer<typeof EnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof DatabaseEnvironmentSchema>;

function formatConfigurationError(
  label: string,
  error: z.ZodError,
): Error {
  const fields = error.issues
    .map((issue) => issue.path.join("."))
    .filter(Boolean)
    .join(", ");

  return new Error(
    `Invalid ${label} configuration${fields ? `: ${fields}` : ""}. See .env.example and docs/SLACK_SETUP.md.`,
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
