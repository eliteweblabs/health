import type { Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Hits the Supabase REST root with the service role key. A 200 means the
 * project is up and the key is accepted.
 */
export const supabaseDetector: Detector = {
  id: 'supabase',
  detect: () => {
    const url = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return [];

    return [
      {
        name: 'supabase-rest',
        label: 'Supabase REST reachable',
        run: async () => {
          const base = url.replace(/\/+$/, '');
          const res = await fetchWithTimeout(`${base}/rest/v1/`, {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
            },
            timeoutMs: 4_000,
          });
          if (res.ok) return { status: 'ok', detail: `REST 200 from ${base}` };
          if (res.status === 401 || res.status === 403) {
            return { status: 'fail', detail: `auth rejected (${res.status}) — check SUPABASE_SERVICE_ROLE_KEY` };
          }
          return { status: 'fail', detail: `unexpected status ${res.status}` };
        },
      },
    ];
  },
};
