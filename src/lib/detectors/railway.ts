import type { Check, Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * The headline feature: when running inside a Railway project, this
 * detector queries Railway's GraphQL API to list every service in the
 * project, then produces a liveness check for each service that has at
 * least one public domain (Railway-provided or custom).
 *
 * Drop a new service into the same Railway project, share env vars to it,
 * and the next time the registry is built (i.e. on next deploy of this
 * service) it will show up in the dashboard automatically.
 *
 * Requires:
 *   RAILWAY_API_TOKEN   — account or workspace token
 *   RAILWAY_PROJECT_ID  — auto-injected by Railway in production; set
 *                         manually for local dev.
 */

const RAILWAY_GQL = 'https://backboard.railway.com/graphql/v2';

interface ServiceWithDomains {
  id: string;
  name: string;
  domains: string[];
}

async function listProjectServices(
  projectId: string,
  token: string
): Promise<ServiceWithDomains[]> {
  const query = /* GraphQL */ `
    query Project($id: String!) {
      project(id: $id) {
        name
        services {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node {
                    domains {
                      serviceDomains { domain }
                      customDomains { domain }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetchWithTimeout(RAILWAY_GQL, {
    method: 'POST',
    timeoutMs: 5_000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables: { id: projectId } }),
  });

  if (!res.ok) {
    throw new Error(`Railway GraphQL HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: {
      project?: {
        services?: {
          edges?: {
            node: {
              id: string;
              name: string;
              serviceInstances?: {
                edges?: {
                  node?: {
                    domains?: {
                      serviceDomains?: { domain: string }[];
                      customDomains?: { domain: string }[];
                    };
                  };
                }[];
              };
            };
          }[];
        };
      };
    };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(`Railway GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  }

  const edges = json.data?.project?.services?.edges ?? [];
  const out: ServiceWithDomains[] = [];
  for (const edge of edges) {
    const node = edge.node;
    const domains: string[] = [];
    for (const inst of node.serviceInstances?.edges ?? []) {
      const d = inst.node?.domains;
      for (const sd of d?.serviceDomains ?? []) if (sd.domain) domains.push(sd.domain);
      for (const cd of d?.customDomains ?? []) if (cd.domain) domains.push(cd.domain);
    }
    out.push({ id: node.id, name: node.name, domains: [...new Set(domains)] });
  }
  return out;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'svc';
}

export const railwayDetector: Detector = {
  id: 'railway',
  detect: () => {
    const token = env('RAILWAY_API_TOKEN');
    const projectId = env('RAILWAY_PROJECT_ID');
    const selfServiceId = env('RAILWAY_SERVICE_ID');
    if (!token || !projectId) return [];

    /*
     * The Railway query happens *inside the check*, not at detect() time,
     * because (a) detect() must be sync, and (b) we want fresh service
     * lists on every cron tick, not just at boot. The downside: each tick
     * pays for one introspection call. That's fine — it's cached in
     * Railway's CDN-like layer and takes <300ms typically.
     */
    const introspect: Check = {
      name: 'railway-project-introspect',
      label: 'Railway project introspection',
      timeoutMs: 6_000,
      run: async () => {
        const services = await listProjectServices(projectId, token);
        const total = services.length;
        const withDomains = services.filter((s) => s.domains.length > 0).length;
        return {
          status: 'ok',
          detail: `${total} services, ${withDomains} with public domains`,
        };
      },
    };

    /*
     * For the per-service liveness checks, we have a chicken-and-egg
     * problem: detect() is sync but we don't know the service list until
     * we hit the API. Solution: kick off a one-shot async fetch at module
     * load, and the per-service checks read from a memo. On the *first*
     * detect() call (during Astro build) the memo is empty so we only
     * register `introspect`. On subsequent boots after the memo populates
     * (warm restart), per-service checks light up.
     *
     * For the typical case (Railway redeploys after a code change), this
     * still works because the fresh boot kicks off the memo fetch and the
     * NEXT detect() call (i.e. the next cron tick that calls runAllChecks)
     * will pick up the per-service checks. That's a one-tick delay, which
     * is acceptable.
     */
    const memo = getServicesMemo(token, projectId, selfServiceId);
    const perService: Check[] = memo.map((svc) => ({
      name: `railway-${slugify(svc.name)}`,
      label: `Railway service: ${svc.name}`,
      run: async () => {
        const url = `https://${svc.domains[0]}`;
        const res = await fetchWithTimeout(url, {
          headers: { 'User-Agent': 'eliteweblabs-health' },
          timeoutMs: 4_000,
        });
        if (res.status >= 200 && res.status < 500) {
          return { status: 'ok', detail: `${url} → ${res.status}` };
        }
        return { status: 'fail', detail: `${url} → ${res.status}` };
      },
    }));

    return [introspect, ...perService];
  },
};

let memoCache: ServiceWithDomains[] = [];
let memoStartedAt = 0;
const MEMO_TTL_MS = 5 * 60 * 1_000;

function getServicesMemo(
  token: string,
  projectId: string,
  selfServiceId: string | undefined
): ServiceWithDomains[] {
  const stale = Date.now() - memoStartedAt > MEMO_TTL_MS;
  if (memoStartedAt === 0 || stale) {
    memoStartedAt = Date.now();
    void listProjectServices(projectId, token)
      .then((services) => {
        memoCache = services
          .filter((s) => s.id !== selfServiceId)
          .filter((s) => s.domains.length > 0);
        console.log(
          `[railway] discovered ${memoCache.length} sibling service(s) with public domains`
        );
      })
      .catch((err) => {
        console.error('[railway] introspection failed:', err);
      });
  }
  return memoCache;
}
