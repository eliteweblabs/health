import type { Check, CheckResult, RunReport } from './types';
import { getRegistry } from './registry';

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Runs a single check with a hard timeout. If the check throws or times out
 * we return a `fail` result instead of propagating, so one bad check can
 * never crash the whole suite.
 */
export async function runOneCheck(
  detector: string,
  check: Check
): Promise<CheckResult> {
  const start = Date.now();
  const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const timeout = new Promise<CheckResult>((resolve) => {
    setTimeout(
      () =>
        resolve({
          name: check.name,
          label: check.label,
          detector,
          status: 'fail',
          ms: Date.now() - start,
          detail: `Timed out after ${timeoutMs}ms`,
        }),
      timeoutMs
    );
  });

  try {
    const work = (async (): Promise<CheckResult> => {
      const outcome = await check.run();
      return {
        name: check.name,
        label: check.label,
        detector,
        status: outcome.status,
        ms: Date.now() - start,
        detail: outcome.detail,
      };
    })();
    return await Promise.race([work, timeout]);
  } catch (err) {
    return {
      name: check.name,
      label: check.label,
      detector,
      status: 'fail',
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Runs every active check from every detector in parallel. */
export async function runAllChecks(): Promise<RunReport> {
  const start = Date.now();
  const registry = getRegistry();
  const tasks: Promise<CheckResult>[] = [];
  for (const { detector, check } of registry) {
    tasks.push(runOneCheck(detector, check));
  }
  const results = await Promise.all(tasks);
  return {
    ok: results.every((r) => r.status !== 'fail'),
    ranAt: new Date().toISOString(),
    totalMs: Date.now() - start,
    results,
  };
}

/** Runs a single check by name. Returns null if not registered. */
export async function runCheckByName(name: string): Promise<CheckResult | null> {
  const registry = getRegistry();
  const entry = registry.find((e) => e.check.name === name);
  if (!entry) return null;
  return runOneCheck(entry.detector, entry.check);
}
