import type { Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Validates the Clerk secret key by hitting a low-cost endpoint (users list,
 * limit=1). A 200 means the key works; 401/403 means it's been rotated or
 * revoked.
 */
export const clerkDetector: Detector = {
  id: 'clerk',
  detect: () => {
    const secret = env('CLERK_SECRET_KEY');
    if (!secret) return [];

    return [
      {
        name: 'clerk-api',
        label: 'Clerk API key valid',
        run: async () => {
          const res = await fetchWithTimeout(
            'https://api.clerk.com/v1/users?limit=1',
            {
              headers: { Authorization: `Bearer ${secret}` },
              timeoutMs: 4_000,
            }
          );
          if (res.status === 200) return { status: 'ok', detail: 'API key valid' };
          if (res.status === 401 || res.status === 403) {
            return { status: 'fail', detail: `auth rejected (${res.status}) — check CLERK_SECRET_KEY` };
          }
          return { status: 'fail', detail: `unexpected status ${res.status}` };
        },
      },
    ];
  },
};
