// lib/db.ts
import 'server-only';
import dns from 'dns';
import postgres, { type Sql } from 'postgres';

// IPv4 bevorzugen, aber nur wenn sinnvoll
try { dns.setDefaultResultOrder?.('ipv4first'); } catch {}

// Hartes IPv4-Fallback, aber robust: wenn hostname fehlt, durchreichen
const origLookup = dns.lookup as any;
// @ts-expect-error: wir übersteuern bewusst die Overloads
dns.lookup = (hostname: any, options?: any, callback?: any) => {
  // Falls jemand Mist übergibt (undefined/null/leer) → unverändert an Original weiterreichen
  if (typeof hostname !== 'string' || hostname.length === 0) {
    return origLookup(hostname, options, callback);
  }

  // (host, cb)
  if (typeof options === 'function') {
    return origLookup(hostname, { family: 4, all: false }, options);
  }
  // (host, number, cb)
  if (typeof options === 'number') {
    return origLookup(hostname, 4, callback);
  }
  // (host, options, cb)
  const opts = { ...(options || {}), family: 4, all: false };
  return origLookup(hostname, opts, callback);
};

let _sql: Sql<{}> | null = null;

function ensure(): Sql<{}> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL fehlt. Bitte in .env.local setzen.');
  }
  if (!_sql) {
    // Kleiner Sanity-Check: Host aus URL extrahieren (hilft beim Debug)
    try {
      const host = new URL(url).hostname;
      if (!host) throw new Error('Host aus DATABASE_URL nicht lesbar');
      if (process.env.NODE_ENV !== 'production') {
        console.log('[db] connecting to', host);
      }
    } catch (e) {
      throw new Error(`Ungültige DATABASE_URL: ${url}`);
    }

    _sql = postgres(url, {
      ssl: 'require',
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return _sql;
}

// Tag-Funktion: sql`select 1`
export const sql = ((...args: any[]) => (ensure() as any)(...args)) as unknown as Sql<{}>;

// Methoden typgerecht durchreichen
(sql as any).begin  = (fn: any) => (ensure() as any).begin(fn);
(sql as any).unsafe = (text: any, params?: any) => (ensure() as any).unsafe(text, params);
(sql as any).end    = () => (ensure() as any).end();
