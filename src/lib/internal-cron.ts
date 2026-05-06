import { runAllChecks } from './runner';
import { processRunForAlerts } from './alerts';
import { envOr } from './env';

/**
 * Internal cron tick. Boots once per process (Astro will import this from
 * a middleware) and runs `runAllChecks` on a schedule set by
 * HEALTH_INTERVAL_MIN. Set to 0 to disable and rely on external pings.
 *
 * The first tick is delayed by ~30s so we don't slam external APIs during
 * a Railway zero-downtime swap.
 */

let started = false;

export function startInternalCron(): void {
  if (started) return;
  started = true;

  const minutes = Number(envOr('HEALTH_INTERVAL_MIN', '10'));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log('[cron] internal cron disabled (HEALTH_INTERVAL_MIN <= 0)');
    return;
  }

  const intervalMs = minutes * 60 * 1_000;
  console.log(`[cron] internal cron every ${minutes} min`);

  const tick = async () => {
    try {
      const report = await runAllChecks();
      const alerts = await processRunForAlerts(report);
      const fails = report.results.filter((r) => r.status === 'fail').length;
      console.log(
        `[cron] tick: ${report.results.length} checks, ${fails} failing` +
          (alerts.transitions.length ? `, transitions: ${alerts.transitions.length}` : '')
      );
    } catch (err) {
      console.error('[cron] tick threw:', err);
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), intervalMs);
  }, 30_000);
}
