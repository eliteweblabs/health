/**
 * Core types for the health-check suite.
 *
 * A `Detector` inspects env vars on boot and either produces zero or more
 * `Check`s. The runner executes every check from every detector in parallel,
 * each under a hard timeout, and aggregates the results.
 */

export type CheckStatus = 'ok' | 'fail' | 'skipped';

export interface CheckResult {
  /** Stable machine name, unique across all checks. */
  name: string;
  /** Human label shown in the dashboard. */
  label: string;
  /** Which detector produced this check (e.g. "twilio", "railway"). */
  detector: string;
  status: CheckStatus;
  /** Wall-clock duration of the check in ms. */
  ms: number;
  /** One-line message: error reason on fail, summary on ok. */
  detail?: string;
}

/** What a check function returns; the runner stamps `ms` and rewrites name/label. */
export type CheckOutcome = Pick<CheckResult, 'status' | 'detail'>;

export interface Check {
  name: string;
  label: string;
  /** Per-check timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
  run: () => Promise<CheckOutcome>;
}

export interface Detector {
  /** Stable id, e.g. "vapi". */
  id: string;
  /** Returns the checks this detector contributes given current env. */
  detect: () => Check[];
}

export interface RunReport {
  ok: boolean;
  ranAt: string;
  totalMs: number;
  results: CheckResult[];
}
