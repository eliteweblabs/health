import type { APIRoute } from 'astro';
import { runCheckByName } from '../../../lib/runner';
import { requireAuth } from '../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const name = params.name;
  if (!name) {
    return new Response(JSON.stringify({ ok: false, error: 'name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await runCheckByName(name);
  if (!result) {
    return new Response(
      JSON.stringify({ ok: false, error: `no check named "${name}"` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify(result, null, 2), {
    status: result.status === 'fail' ? 503 : 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
