export type PreflightCheckStatus = "pass" | "warn" | "fail";

export interface PreflightCheck {
  name: string;
  status: PreflightCheckStatus;
  detail: string;
}

export interface DemoSeedSnapshot {
  noteCount: number;
  meetingCount: number;
  ambiguousCandidateCount: number;
  digestStatus: string | null;
  digestChannelId: string | null;
  resurfacingStatus: string | null;
  resurfacingChannelId: string | null;
}

export interface PreflightSummary {
  ready: boolean;
  passed: number;
  warnings: number;
  failed: number;
}

export function evaluateDemoSeed(
  snapshot: DemoSeedSnapshot,
): PreflightCheck[] {
  const checks: PreflightCheck[] = [
    thresholdCheck(
      "Seeded notes",
      snapshot.noteCount,
      9,
      "Run npm run demo:prepare to recreate the complete demo dataset.",
    ),
    thresholdCheck(
      "Seeded meetings",
      snapshot.meetingCount,
      6,
      "The complete demo requires current, overlapping, completed, prior, and upcoming meetings.",
    ),
    thresholdCheck(
      "Ambiguous context candidates",
      snapshot.ambiguousCandidateCount,
      3,
      "The clarification example requires two meeting candidates plus No meeting.",
    ),
  ];

  checks.push(
    deliveryCheck(
      "Post-meeting digest",
      snapshot.digestStatus,
      snapshot.digestChannelId,
    ),
  );
  checks.push(
    deliveryCheck(
      "Pre-meeting resurfacing",
      snapshot.resurfacingStatus,
      snapshot.resurfacingChannelId,
    ),
  );

  return checks;
}

export function summarizeChecks(
  checks: readonly PreflightCheck[],
): PreflightSummary {
  const passed = checks.filter((check) => check.status === "pass").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  return { ready: failed === 0, passed, warnings, failed };
}

export function formatCheckLine(check: PreflightCheck): string {
  const marker =
    check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
  return `[${marker}] ${check.name}: ${check.detail}`;
}

export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("PREFLIGHT_BASE_URL must use http or https");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

function thresholdCheck(
  name: string,
  actual: number,
  minimum: number,
  failureDetail: string,
): PreflightCheck {
  return actual >= minimum
    ? {
        name,
        status: "pass",
        detail: `${actual} found; minimum ${minimum}.`,
      }
    : {
        name,
        status: "fail",
        detail: `${actual} found; minimum ${minimum}. ${failureDetail}`,
      };
}

function deliveryCheck(
  name: string,
  status: string | null,
  channelId: string | null,
): PreflightCheck {
  if (!status || status === "skipped") {
    return {
      name,
      status: "fail",
      detail: "No usable seeded delivery exists. Run npm run demo:prepare.",
    };
  }

  if (status === "sent") {
    if (!channelId?.startsWith("D")) {
      return {
        name,
        status: "fail",
        detail: "Marked sent without an owner DM reference.",
      };
    }
    return {
      name,
      status: "pass",
      detail: `Delivered privately in ${channelId}.`,
    };
  }

  return {
    name,
    status: "warn",
    detail: `Seeded with status ${status}; start Margin or run npm run demo:publish to deliver it.`,
  };
}
