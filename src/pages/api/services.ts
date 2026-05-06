import type { APIRoute } from 'astro';
import { listActiveServices } from '../../lib/registry';
import { requireAuth } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  return new Response(
    JSON.stringify({ services: listActiveServices() }, null, 2),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }
  );
};
