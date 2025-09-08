// lib/db.ts
import postgres, { Sql } from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL fehlt. Bitte in .env(.local) setzen.');
}

declare global {
  // Verhindert doppelte Verbindungen im Dev bei HMR
  // eslint-disable-next-line no-var
  var __SQL__: Sql | undefined;
}

export const sql: Sql =
  globalThis.__SQL__ ??
  postgres(url, {
    ssl: 'require',    // Supabase braucht SSL
    idle_timeout: 20,  // Sekunden
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__SQL__ = sql;
}