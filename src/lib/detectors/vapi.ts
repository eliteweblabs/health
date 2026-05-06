import type { Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Vapi assistant reachability via the REST API. Requires the *private* key
 * (VAPI_PRIVATE_KEY) — the public/web key won't authenticate against the
 * REST endpoint.
 */
export const vapiDetector: Detector = {
  id: 'vapi',
  detect: () => {
    const privateKey = env('VAPI_PRIVATE_KEY');
    const assistantId = env('PUBLIC_VAPI_ASSISTANT_ID');
    if (!privateKey || !assistantId) return [];

    return [
      {
        name: 'vapi-assistant',
        label: 'Vapi assistant reachable',
        run: async () => {
          const res = await fetchWithTimeout(
            `https://api.vapi.ai/assistant/${encodeURIComponent(assistantId)}`,
            {
              headers: { Authorization: `Bearer ${privateKey}` },
              timeoutMs: 4_000,
            }
          );
          if (res.status === 200) {
            return { status: 'ok', detail: `assistant ${assistantId} OK` };
          }
          if (res.status === 401 || res.status === 403) {
            return { status: 'fail', detail: `auth rejected (${res.status}) — check VAPI_PRIVATE_KEY` };
          }
          if (res.status === 404) {
            return { status: 'fail', detail: `assistant ${assistantId} not found` };
          }
          return { status: 'fail', detail: `unexpected status ${res.status}` };
        },
      },
    ];
  },
};
