# health

Auto-discovering health-check service for Railway projects.

Drop it into a Railway project, share the relevant env vars to it, and it
figures out what to monitor. New service joins the project? It shows up in
the dashboard automatically. Something breaks? You get an SMS.

## What it does

- **Discovers checks from env vars.** Each detector module asks "are my env
  vars set?" — if yes, it contributes one or more checks. No config file.
- **Runs everything in parallel** under per-check hard timeouts (default 5s).
  One bad service can't hang the suite.
- **Alerts on state transitions only** (ok → fail and fail → ok), not on
  every failed run. Throttled to 1 SMS per service per 30 min so a flapping
  service can't run up your Twilio bill.
- **Two cron paths**, internal (in-process `setInterval`) and external
  (GitHub Actions). Use both: the external one catches outages of the
  health service itself.
- **Token-gated API**, safe to expose publicly.

## Built-in detectors

| Detector            | Triggers when these env vars are set                           | Check |
|---------------------|----------------------------------------------------------------|-------|
| `env`               | always                                                         | required env var presence + group consistency |
| `vapi`              | `VAPI_PRIVATE_KEY`, `PUBLIC_VAPI_ASSISTANT_ID`                 | `GET https://api.vapi.ai/assistant/{id}` |
| `clerk`             | `CLERK_SECRET_KEY`                                             | `GET https://api.clerk.com/v1/users?limit=1` |
| `twilio`            | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`                      | `GET https://api.twilio.com/2010-04-01/Accounts/{sid}.json` |
| `supabase`          | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                    | `GET {url}/rest/v1/` |
| `postgres`          | `DATABASE_URL`                                                 | `SELECT 1` (SSL, no pool) |
| `resend`            | `RESEND_API_KEY`                                               | `GET https://api.resend.com/domains` |
| `knowledge-services`| `KNOWLEDGE_SERVICES="<slug>:<owner>/<repo>,..."`               | one HEAD per repo against the GitHub API |
| `http-targets`      | `HEALTH_TARGETS="name=url,name=url"`                           | one GET per target; 2xx/3xx = ok |
| `railway`           | `RAILWAY_API_TOKEN` (+ `RAILWAY_PROJECT_ID`, auto-injected)    | introspects the project, adds one liveness check per sibling service with a public domain |

## Alerting

| Channel | Required env vars                                                                  |
|---------|------------------------------------------------------------------------------------|
| SMS     | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ALERT_PHONE_FROM`, `ALERT_PHONE_TO`    |
| Email   | `RESEND_API_KEY`, `ALERT_EMAIL` (optionally `ALERT_EMAIL_FROM`)                    |

If neither group is fully set, alerts silently no-op — useful for staging.

## API

All endpoints require `Authorization: Bearer <HEALTHCHECK_TOKEN>`.

| Method | Path                  | Description |
|--------|-----------------------|-------------|
| GET    | `/`                   | dashboard (HTML) |
| GET    | `/api/check`          | run all checks; `200` if all ok, `503` if any fail |
| GET    | `/api/check/<name>`   | run a single check by name |
| GET    | `/api/services`       | list which detectors fired (no checks executed) |

## Local dev

```sh
cp .env.example .env
# fill in HEALTHCHECK_TOKEN and whichever service vars you want active
npm install
npm run dev
# open http://localhost:4321
```

## Deploying to Railway

1. **Create the service.**
   ```sh
   railway init                    # or use the dashboard
   railway link
   railway up                      # builds via Dockerfile
   ```
2. **Generate a public domain** in the service's Networking tab.
3. **Set required env vars:**
   - `HEALTHCHECK_TOKEN` — long random string.
   - `RAILWAY_API_TOKEN` — create at <https://railway.app/account/tokens>;
     this is what enables sibling-service auto-discovery. (`RAILWAY_PROJECT_ID`
     is auto-injected.)
4. **Share variables from the services you want to monitor** into this
   service's variable list. Railway's "Reference variable" UI is the
   cleanest way: pick `${{ApiService.TWILIO_ACCOUNT_SID}}` etc. The
   detectors will fire on next deploy.
5. **Set alerting vars** (`TWILIO_*` + `ALERT_PHONE_*`, optionally
   `RESEND_API_KEY` + `ALERT_EMAIL`).
6. **Wire the GitHub Actions external cron:**
   - Repo → Settings → Secrets and variables → Actions → New secret
   - `HEALTH_URL` = `https://<your-service>.up.railway.app/api/check`
   - `HEALTH_TOKEN` = same value as `HEALTHCHECK_TOKEN`
   - The workflow at `.github/workflows/ping.yml` runs every 5 min.

## Adding your own detector

Drop a file in `src/lib/detectors/`:

```ts
import type { Detector } from '../types';

export const myDetector: Detector = {
  id: 'mything',
  detect: () => {
    const apiKey = import.meta.env.MYTHING_API_KEY;
    if (!apiKey) return [];
    return [{
      name: 'mything-api',
      label: 'MyThing API reachable',
      run: async () => {
        const res = await fetch('https://api.mything.com/ping', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok
          ? { status: 'ok' }
          : { status: 'fail', detail: `HTTP ${res.status}` };
      },
    }];
  },
};
```

Then register it in `src/lib/registry.ts`:

```ts
import { myDetector } from './detectors/mything';
const detectors: Detector[] = [..., myDetector];
```

That's it.
