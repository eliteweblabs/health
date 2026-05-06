import type { Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Validates the Resend API key by listing domains (read-only, no quota
 * impact, no sends).
 */
export const resendDetector: Detector = {
  id: 'resend',
  detect: () => {
    const key = env('RESEND_API_KEY');
    if (!key) return [];

    return [
      {
        name: 'resend-api',
        label: 'Resend API key valid',
        run: async () => {
          const res = await fetchWithTimeout('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${key}` },
            timeoutMs: 4_000,
          });
          if (res.ok) return { status: 'ok', detail: 'API key valid' };
          if (res.status === 401 || res.status === 403) {
            return { status: 'fail', detail: `auth rejected (${res.status}) — check RESEND_API_KEY` };
          }
          return { status: 'fail', detail: `unexpected status ${res.status}` };
        },
      },
    ];
  },
};
