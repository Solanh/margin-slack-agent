import type { WebClient } from "@slack/web-api";

export async function resolveSlackUserTimeZone(
  client: WebClient,
  userId: string,
): Promise<string> {
  try {
    const response = await client.users.info({ user: userId });
    const timeZone = response.user?.tz;
    return typeof timeZone === "string" && timeZone ? timeZone : "UTC";
  } catch {
    return "UTC";
  }
}
