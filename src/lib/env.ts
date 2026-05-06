/**
 * Read an env var at runtime.
 *
 * We deliberately avoid `import.meta.env` for non-PUBLIC vars: with Astro's
 * Node adapter, Vite freezes `import.meta.env` at build time, so a value
 * set in the Railway dashboard *after* the build (which is, you know, the
 * normal case) is invisible. `process.env` always reads live.
 */
export function env(key: string): string | undefined {
  const v = process.env[key];
  return v === undefined || v === '' ? undefined : v;
}

/** Same as `env(key)` but returns `fallback` for undefined. */
export function envOr(key: string, fallback: string): string {
  return env(key) ?? fallback;
}
