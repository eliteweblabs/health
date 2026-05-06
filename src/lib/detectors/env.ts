import type { Detector } from '../types';
import { env } from '../env';

/**
 * Synchronous env-var presence check. Always runs. Catches the most common
 * production breakage: a redeploy that forgot a variable.
 *
 * What's "required" depends on what's been turned on. We check coherent
 * groupings — e.g. if you set TWILIO_ACCOUNT_SID you almost certainly meant
 * to set TWILIO_AUTH_TOKEN too.
 */
export const envDetector: Detector = {
  id: 'env',
  detect: () => [
    {
      name: 'env-required',
      label: 'Required env vars present',
      run: async () => {
        const missing: string[] = [];
        const partial: string[] = [];

        const groups: Record<string, string[]> = {
          twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
          'twilio-alerting': ['ALERT_PHONE_FROM', 'ALERT_PHONE_TO'],
          'resend-alerting': ['RESEND_API_KEY', 'ALERT_EMAIL'],
          supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
          vapi: ['VAPI_PRIVATE_KEY', 'PUBLIC_VAPI_ASSISTANT_ID'],
          railway: ['RAILWAY_API_TOKEN', 'RAILWAY_PROJECT_ID'],
        };

        for (const [group, vars] of Object.entries(groups)) {
          const present = vars.filter((v) => !!env(v));
          if (present.length > 0 && present.length < vars.length) {
            const missingFromGroup = vars.filter((v) => !env(v));
            partial.push(`${group}: missing ${missingFromGroup.join(', ')}`);
          }
        }

        if (!env('HEALTHCHECK_TOKEN')) {
          missing.push('HEALTHCHECK_TOKEN');
        }

        const issues: string[] = [];
        if (missing.length) issues.push(`missing: ${missing.join(', ')}`);
        if (partial.length) issues.push(`partial groups: ${partial.join('; ')}`);

        if (issues.length === 0) {
          return { status: 'ok', detail: 'All required vars present.' };
        }
        return { status: 'fail', detail: issues.join(' | ') };
      },
    },
  ],
};
