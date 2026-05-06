import type { Check, Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Generic liveness probe for arbitrary URLs. Format:
 *   HEALTH_TARGETS="reave=https://reave.example.com,cms=https://cms.example.com/api/health"
 *
 * Any 2xx or 3xx counts as ok. We use GET (not HEAD) because some hosts and
 * CDNs reject HEAD with a 405.
 */
export const httpTargetsDetector: Detector = {
  id: 'http-targets',
  detect: () => {
    const raw = env('HEALTH_TARGETS');
    if (!raw) return [];

    const targets: { name: string; url: string }[] = [];
    for (const entry of raw.split(',').map((e) => e.trim()).filter(Boolean)) {
      const eq = entry.indexOf('=');
      if (eq === -1) continue;
      const name = entry.slice(0, eq).trim();
      const url = entry.slice(eq + 1).trim();
      if (!name || !url) continue;
      try {
        new URL(url);
      } catch {
        continue;
      }
      targets.push({ name, url });
    }
    if (targets.length === 0) return [];

    const checks: Check[] = targets.map((t) => ({
      name: `http-${t.name}`,
      label: `HTTP ${t.name}`,
      run: async () => {
        const res = await fetchWithTimeout(t.url, {
          headers: { 'User-Agent': 'eliteweblabs-health' },
          timeoutMs: 4_000,
        });
        if (res.status >= 200 && res.status < 400) {
          return { status: 'ok', detail: `${t.url} → ${res.status}` };
        }
        return { status: 'fail', detail: `${t.url} → ${res.status}` };
      },
    }));
    return checks;
  },
};
