export interface ReadinessSnapshot {
  ready: boolean;
  checks: {
    database: boolean;
    migrations: boolean;
    slack: boolean;
    digestWorker: boolean;
    resurfacingWorker: boolean;
  };
}

export interface RuntimeReadinessOptions {
  checkDatabase: () => Promise<boolean>;
  checkMigrations: () => Promise<boolean>;
  resurfacingRequired: boolean;
}

export class RuntimeReadiness {
  private slackStarted = false;
  private digestWorkerStarted = false;
  private resurfacingWorkerStarted = false;

  constructor(private readonly options: RuntimeReadinessOptions) {}

  markSlackStarted(): void {
    this.slackStarted = true;
  }

  markSlackStopped(): void {
    this.slackStarted = false;
  }

  markDigestWorkerStarted(): void {
    this.digestWorkerStarted = true;
  }

  markDigestWorkerStopped(): void {
    this.digestWorkerStarted = false;
  }

  markResurfacingWorkerStarted(): void {
    this.resurfacingWorkerStarted = true;
  }

  markResurfacingWorkerStopped(): void {
    this.resurfacingWorkerStarted = false;
  }

  async snapshot(): Promise<ReadinessSnapshot> {
    const [database, migrations] = await Promise.all([
      this.safeCheck(this.options.checkDatabase),
      this.safeCheck(this.options.checkMigrations),
    ]);
    const resurfacingWorker =
      !this.options.resurfacingRequired || this.resurfacingWorkerStarted;
    const checks = {
      database,
      migrations,
      slack: this.slackStarted,
      digestWorker: this.digestWorkerStarted,
      resurfacingWorker,
    };

    return {
      ready: Object.values(checks).every(Boolean),
      checks,
    };
  }

  private async safeCheck(check: () => Promise<boolean>): Promise<boolean> {
    try {
      return await check();
    } catch {
      return false;
    }
  }
}
