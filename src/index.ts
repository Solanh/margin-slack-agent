import "dotenv/config";
import { createSlackApp } from "./slack/app.js";

const app = createSlackApp();

async function start(): Promise<void> {
  await app.start();
  console.log("Margin is connected to Slack through Socket Mode.");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; stopping Margin.`);
  await app.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch((error: unknown) => {
  console.error("Margin failed to start", error);
  process.exit(1);
});
