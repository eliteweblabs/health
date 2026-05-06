import twilio from 'twilio';
import type { CheckResult, RunReport } from './types';
import { fetchWithTimeout } from './fetch-with-timeout';
import { env, envOr } from './env';

/**
 * State-transition alerting.
 *
 * We compare each run against the previous run (in-memory) and only alert
 * when a check transitions ok → fail or fail → ok. Every run is the source
 * of truth; we never alert on a static state, only on changes. This is
 * what keeps the SMS bill sane.
 *
 * Per-service throttling: even on transitions, no more than one SMS per
 * `MIN_SMS_INTERVAL_MS` per check name. Email alerts are not throttled
 * because they don't cost anything and are a paper trail.
 */

const MIN_SMS_INTERVAL_MS = 30 * 60 * 1_000;

type LastStatus = 'ok' | 'fail';
const lastStatusByName = new Map<string, LastStatus>();
const lastSmsAtByName = new Map<string, number>();

export interface AlertSummary {
  transitions: { name: string; from: LastStatus | 'unknown'; to: LastStatus }[];
  smsSent: number;
  smsThrottled: number;
  emailSent: number;
}

/**
 * Compares the report against in-memory last state, dispatches alerts for
 * transitions, and updates state. Should be called for every run (cron tick
 * or manual) — this is what keeps the diff accurate.
 */
export async function processRunForAlerts(report: RunReport): Promise<AlertSummary> {
  const summary: AlertSummary = {
    transitions: [],
    smsSent: 0,
    smsThrottled: 0,
    emailSent: 0,
  };

  for (const result of report.results) {
    if (result.status === 'skipped') continue;
    const current: LastStatus = result.status === 'ok' ? 'ok' : 'fail';
    const previous = lastStatusByName.get(result.name);
    lastStatusByName.set(result.name, current);

    if (previous === undefined) continue;
    if (previous === current) continue;

    summary.transitions.push({ name: result.name, from: previous, to: current });

    const direction = current === 'fail' ? 'down' : 'recovered';
    const subject = `[health] ${result.label} ${direction}`;
    const body = composeAlertBody(result, previous, current);

    const now = Date.now();
    const lastSms = lastSmsAtByName.get(result.name) ?? 0;
    if (now - lastSms >= MIN_SMS_INTERVAL_MS) {
      const sent = await trySendSms(`${subject}\n\n${body}`);
      if (sent) {
        summary.smsSent++;
        lastSmsAtByName.set(result.name, now);
      }
    } else {
      summary.smsThrottled++;
    }

    const emailed = await trySendEmail(subject, body);
    if (emailed) summary.emailSent++;
  }

  return summary;
}

function composeAlertBody(
  result: CheckResult,
  from: LastStatus,
  to: LastStatus
): string {
  const lines = [
    `${result.label} (${result.detector}/${result.name}) went ${from} → ${to}.`,
    `Latency: ${result.ms}ms`,
  ];
  if (result.detail) lines.push(`Detail: ${result.detail}`);
  return lines.join('\n');
}

async function trySendSms(message: string): Promise<boolean> {
  const sid = env('TWILIO_ACCOUNT_SID');
  const token = env('TWILIO_AUTH_TOKEN');
  const from = env('ALERT_PHONE_FROM');
  const to = env('ALERT_PHONE_TO');
  if (!sid || !token || !from || !to) return false;

  try {
    const client = twilio(sid, token);
    await client.messages.create({ body: message.slice(0, 1500), from, to });
    return true;
  } catch (err) {
    console.error('[alerts] Twilio send failed:', err);
    return false;
  }
}

async function trySendEmail(subject: string, body: string): Promise<boolean> {
  const apiKey = env('RESEND_API_KEY');
  const to = env('ALERT_EMAIL');
  const from = envOr('ALERT_EMAIL_FROM', 'health@localhost');
  if (!apiKey || !to) return false;

  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      timeoutMs: 4_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      console.error('[alerts] Resend returned', res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[alerts] Resend send failed:', err);
    return false;
  }
}

/** For tests / debug: returns the current in-memory state snapshot. */
export function snapshotAlertState() {
  return {
    lastStatus: Object.fromEntries(lastStatusByName),
    lastSmsAt: Object.fromEntries(lastSmsAtByName),
  };
}
