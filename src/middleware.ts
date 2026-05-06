import { defineMiddleware } from 'astro:middleware';
import { startInternalCron } from './lib/internal-cron';

/**
 * Astro middleware runs once per request, but module-level code runs once
 * per process. We use that to kick off the internal cron exactly once,
 * lazily on the first request.
 */
startInternalCron();

export const onRequest = defineMiddleware(async (_ctx, next) => {
  return next();
});
