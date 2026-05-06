/**
 * Bearer-token guard for /api/* routes.
 *
 * Reads HEALTHCHECK_TOKEN from env and validates the Authorization header.
 * If the token is unset, the API is open — useful for local dev but logged
 * loudly so it's not accidentally shipped.
 */

import { env } from './env';

let warned = false;

export function requireAuth(request: Request): Response | null {
  const expected = env('HEALTHCHECK_TOKEN');
  if (!expected) {
    if (!warned) {
      console.warn(
        '[auth] HEALTHCHECK_TOKEN is not set — /api/* is unauthenticated. Set it before exposing publicly.'
      );
      warned = true;
    }
    return null;
  }

  const header = request.headers.get('Authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (presented && timingSafeEqual(presented, expected)) return null;

  return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Constant-time string comparison to avoid timing attacks on token leak. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
