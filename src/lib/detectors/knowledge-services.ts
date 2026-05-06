import type { Check, Detector } from '../types';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { env } from '../env';

/**
 * Parses KNOWLEDGE_SERVICES (same format as in reave-1) and produces one
 * check per repo. We do an unauthenticated HEAD on the repo's GitHub API
 * URL — public repos respond instantly without consuming auth quota; for
 * private repos set GITHUB_TOKEN.
 *
 * Format: "<slug>:<owner>/<repo>,<slug>:<owner>/<repo>"
 */

interface KnowledgeService {
  slug: string;
  owner: string;
  repo: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OWNER_RE = /^[a-z0-9-]+$/;
const REPO_RE = /^[a-z0-9._-]+$/;

function parse(raw: string | undefined | null): KnowledgeService[] {
  if (!raw || !raw.trim()) return [];
  const out: KnowledgeService[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(',').map((e) => e.trim()).filter(Boolean)) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    const slug = entry.slice(0, colon).trim().toLowerCase();
    const path = entry.slice(colon + 1).trim().toLowerCase();
    const slash = path.indexOf('/');
    if (slash === -1 || slash !== path.lastIndexOf('/')) continue;
    const owner = path.slice(0, slash);
    const repo = path.slice(slash + 1);
    if (!SLUG_RE.test(slug) || !OWNER_RE.test(owner) || !REPO_RE.test(repo)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, owner, repo });
  }
  return out;
}

export const knowledgeServicesDetector: Detector = {
  id: 'knowledge-services',
  detect: () => {
    const services = parse(env('KNOWLEDGE_SERVICES'));
    if (services.length === 0) return [];
    const token = env('GITHUB_TOKEN');

    const checks: Check[] = services.map((svc) => ({
      name: `gh-repo-${svc.slug}`,
      label: `GitHub repo ${svc.owner}/${svc.repo}`,
      run: async () => {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'eliteweblabs-health',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetchWithTimeout(
          `https://api.github.com/repos/${svc.owner}/${svc.repo}`,
          { method: 'HEAD', headers, timeoutMs: 4_000 }
        );
        if (res.ok) return { status: 'ok', detail: `repo reachable (${res.status})` };
        if (res.status === 404) return { status: 'fail', detail: 'repo not found (404)' };
        if (res.status === 401 || res.status === 403) {
          return { status: 'fail', detail: `auth/rate-limit (${res.status})` };
        }
        return { status: 'fail', detail: `unexpected status ${res.status}` };
      },
    }));
    return checks;
  },
};
