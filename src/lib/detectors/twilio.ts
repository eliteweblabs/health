import type { Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Validates Twilio credentials by fetching the account record. Cheap and
 * doesn't consume any messaging quota.
 */
export const twilioDetector: Detector = {
  id: 'twilio',
  detect: () => {
    const sid = env('TWILIO_ACCOUNT_SID');
    const token = env('TWILIO_AUTH_TOKEN');
    if (!sid || !token) return [];

    return [
      {
        name: 'twilio-account',
        label: 'Twilio account reachable',
        run: async () => {
          const auth = Buffer.from(`${sid}:${token}`).toString('base64');
          const res = await fetchWithTimeout(
            `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`,
            {
              headers: { Authorization: `Basic ${auth}` },
              timeoutMs: 4_000,
            }
          );
          if (res.status === 200) {
            const json = (await res.json()) as { status?: string; friendly_name?: string };
            const acctStatus = json.status ?? 'unknown';
            if (acctStatus !== 'active') {
              return {
                status: 'fail',
                detail: `account "${json.friendly_name ?? sid}" status=${acctStatus}`,
              };
            }
            return { status: 'ok', detail: `${json.friendly_name ?? sid} active` };
          }
          if (res.status === 401 || res.status === 403) {
            return { status: 'fail', detail: `auth rejected (${res.status}) — check TWILIO_AUTH_TOKEN` };
          }
          return { status: 'fail', detail: `unexpected status ${res.status}` };
        },
      },
    ];
  },
};
