import type { Check, Detector } from './types';

import { envDetector } from './detectors/env';
import { vapiDetector } from './detectors/vapi';
import { clerkDetector } from './detectors/clerk';
import { twilioDetector } from './detectors/twilio';
import { supabaseDetector } from './detectors/supabase';
import { postgresDetector } from './detectors/postgres';
import { resendDetector } from './detectors/resend';
import { knowledgeServicesDetector } from './detectors/knowledge-services';
import { httpTargetsDetector } from './detectors/http-targets';
import { railwayDetector } from './detectors/railway';

/**
 * Order matters only for display in the dashboard. The runner executes
 * everything in parallel.
 */
const detectors: Detector[] = [
  envDetector,
  vapiDetector,
  clerkDetector,
  twilioDetector,
  supabaseDetector,
  postgresDetector,
  resendDetector,
  knowledgeServicesDetector,
  httpTargetsDetector,
  railwayDetector,
];

export interface RegistryEntry {
  detector: string;
  check: Check;
}

let cached: RegistryEntry[] | null = null;

/**
 * Builds (and caches) the active check registry by asking every detector
 * what it contributes given current env. Cached per process; restart the
 * service to pick up new env vars.
 */
export function getRegistry(): RegistryEntry[] {
  if (cached) return cached;
  const entries: RegistryEntry[] = [];
  const seen = new Set<string>();
  for (const d of detectors) {
    let checks: Check[] = [];
    try {
      checks = d.detect();
    } catch (err) {
      console.error(`[registry] detector "${d.id}" threw:`, err);
      continue;
    }
    for (const check of checks) {
      if (seen.has(check.name)) {
        console.warn(`[registry] duplicate check name "${check.name}" — skipping`);
        continue;
      }
      seen.add(check.name);
      entries.push({ detector: d.id, check });
    }
  }
  cached = entries;
  console.log(
    `[registry] active checks (${entries.length}): ${entries
      .map((e) => `${e.detector}/${e.check.name}`)
      .join(', ') || '(none)'}`
  );
  return cached;
}

/** Lists which detectors fired (had ≥1 check). For /api/services. */
export function listActiveServices(): { detector: string; checks: string[] }[] {
  const registry = getRegistry();
  const byDetector = new Map<string, string[]>();
  for (const e of registry) {
    if (!byDetector.has(e.detector)) byDetector.set(e.detector, []);
    byDetector.get(e.detector)!.push(e.check.name);
  }
  return [...byDetector.entries()].map(([detector, checks]) => ({ detector, checks }));
}
