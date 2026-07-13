export interface DemoOwnerEnvironment {
  workspaceId: string;
  userId: string;
  sourceChannelId: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function loadDemoOwnerEnvironment(
  environment: Environment = process.env,
): DemoOwnerEnvironment {
  const workspaceId = required(environment, "DEMO_WORKSPACE_ID");
  const userId = required(environment, "DEMO_USER_ID");
  const sourceChannelId =
    environment.DEMO_SOURCE_CHANNEL_ID?.trim() || "D-MARGIN-DEMO";

  return { workspaceId, userId, sourceChannelId };
}

export function assertDemoResetAllowed(
  owner: DemoOwnerEnvironment,
  environment: Environment = process.env,
): void {
  const expectedConfirmation = `${owner.workspaceId}:${owner.userId}`;
  if (environment.DEMO_CONFIRM_RESET !== expectedConfirmation) {
    throw new Error(
      `DEMO_CONFIRM_RESET must exactly equal ${expectedConfirmation}`,
    );
  }

  const nodeEnvironment = environment.NODE_ENV ?? "development";
  const safeEnvironment =
    nodeEnvironment === "development" || nodeEnvironment === "test";
  if (
    !safeEnvironment &&
    environment.DEMO_ALLOW_NON_DEVELOPMENT_RESET !== "true"
  ) {
    throw new Error(
      "Refusing demo reset outside development/test. Set DEMO_ALLOW_NON_DEVELOPMENT_RESET=true only for an isolated demo owner.",
    );
  }
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
