import type { Reporter } from 'vitest/reporters';

// Work around occasional Vitest hangs after all tests pass (e.g., leaked file watchers).
// This is only wired into the `test` (run) script, not `test:watch`.
export default class ForceExitReporter implements Reporter {
  private hasFailures = false;
  private exitScheduled = false;
  private activityTimer: any = null;
  // Should exceed any single test file/test case runtime to avoid exiting mid-run.
  private readonly idleMs = 30_000;

  private scheduleExit(code: number) {
    if (this.exitScheduled) return;
    this.exitScheduled = true;

    // Let other reporters flush output first.
    setTimeout(() => {
      // eslint-disable-next-line no-process-exit
      process.exit(code);
    }, 50);
  }

  private bumpActivity() {
    if (this.exitScheduled) return;
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = setTimeout(() => {
      // If Vitest teardown hangs (e.g., leaked watchers), force-exit after a quiet period.
      this.scheduleExit(this.hasFailures ? 1 : 0);
    }, this.idleMs);
  }

  onTestRunStart() {
    this.hasFailures = false;
    this.exitScheduled = false;
    this.bumpActivity();
  }

  onTestModuleStart() {
    this.bumpActivity();
  }

  onTestModuleEnd(testModule) {
    if (typeof (testModule as any)?.ok === 'function' && !(testModule as any).ok()) {
      this.hasFailures = true;
    }
    this.bumpActivity();
  }

  onTestCaseReady() {
    this.bumpActivity();
  }

  onTestCaseResult() {
    this.bumpActivity();
  }

  onHookStart() {
    this.bumpActivity();
  }

  onHookEnd() {
    this.bumpActivity();
  }

  onTestRunEnd(testModules = [], unhandledErrors = []) {
    const hasFailures =
      unhandledErrors.length > 0 ||
      testModules.some((m: any) => typeof m?.ok === 'function' ? !m.ok() : true);

    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.scheduleExit(hasFailures ? 1 : 0);
  }
}
