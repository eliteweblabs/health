import type { APIRoute } from 'astro';
import { runAllChecks } from '../../lib/runner';
import { processRunForAlerts } from '../../lib/alerts';
import { requireAuth } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const report = await runAllChecks();
  const alerts = await processRunForAlerts(report);

  return new Response(
    JSON.stringify({ ...report, alerts }, null, 2),
    {
      status: report.ok ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};
