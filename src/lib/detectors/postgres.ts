import type { Detector } from '../types';
import pg from 'pg';
import { env } from '../env';

/**
 * SELECT 1 against DATABASE_URL. We use a fresh client per check (no pool)
 * so a hung connection from a prior tick can't poison this one. SSL is
 * required by default for managed providers (Supabase/Neon/Railway PG).
 */
export const postgresDetector: Detector = {
  id: 'postgres',
  detect: () => {
    const url = env('DATABASE_URL');
    if (!url) return [];

    return [
      {
        name: 'postgres-select-1',
        label: 'Postgres SELECT 1',
        timeoutMs: 6_000,
        run: async () => {
          const client = new pg.Client({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5_000,
            statement_timeout: 4_000,
          });
          try {
            await client.connect();
            const res = await client.query('SELECT 1 AS ok');
            if (res.rows[0]?.ok === 1) {
              return { status: 'ok', detail: 'connected, SELECT 1 returned 1' };
            }
            return { status: 'fail', detail: 'unexpected SELECT 1 result' };
          } finally {
            try {
              await client.end();
            } catch {
              // swallow — cleanup failures shouldn't mask the real result
            }
          }
        },
      },
    ];
  },
};
