// lib/db.ts
import 'server-only';
import dns from 'dns';
import postgres, { type Sql } from 'postgres';

// --- IPv4 bevorzugen (ohne harte Annahmen)
try { dns.setDefaultResultOrder?.('ipv4first'); } catch {}

// Fallback: lookup auf IPv4 biegen, aber nur bei gültigem Hostnamen
const origLookup = dns.lookup as any;
// @ts-expect-error Overload ist uns egal: wir leiten korrekt weiter
dns.lookup = (hostname: any, options?: any, callback?: any) => {
  if (typeof hostname !== 'string' || hostname.length === 0) {
    return (origLookup as any)(hostname, options, callback);
  }
  if (typeof options === 'function') {
    return (origLookup as any)(hostname, { family: 4, all: false }, options);
  }
  if (typeof options === 'number') {
    return (origLookup as any)(hostname, 4, callback);
  }
  const opts = { ...(options || {}), family: 4, all: false };
  return (origLookup as any)(hostname, opts, callback);
};

let _sql: Sql<{}> | null = null;

function normalizeUrl(raw: string): string {
  // sslmode=require anhängen, wenn nicht gesetzt
  const hasQuery = raw.includes('?');
  const hasSslMode = /[?&]sslmode=/.test(raw);
  if (!hasSslMode) return raw + (hasQuery ? '&' : '?') + 'sslmode=require';
  return raw;
}

function ensure(): Sql<{}> {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL fehlt. Bitte in .env.local setzen.');

  if (!_sql) {
    let url = normalizeUrl(raw);

    // Validierung + Debug-Hinweis (ohne Geheimnisse zu loggen)
    try {
      const u = new URL(url);
      if (!u.hostname) throw new Error('Hostname fehlt');
      if (process.env.NODE_ENV !== 'production') {
        console.log('[db] connecting to host:', u.hostname, '(pooler)');
      }
    } catch {
      throw new Error('Ungültige DATABASE_URL.');
    }

    _sql = postgres(url, {
      // Shared/Transaction Pooler:
      prepare: false,          // WICHTIG bei PgBouncer
      ssl: 'require',
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _sql;
}

// Tag-Funktion kompatibel halten (vermeidet TS2556)
type Tag = <T = any>(strings: TemplateStringsArray, ...values: any[]) => Promise<T[]>;
const tag: Tag = (strings, ...values) => (ensure() as any)(strings, ...values);

// Helfer-Methoden sauber durchreichen
(tag as any).begin  = (fn: any) => (ensure() as any).begin(fn);
(tag as any).unsafe = (text: any, params?: any) => (ensure() as any).unsafe(text, params);
(tag as any).end    = () => (ensure() as any).end();

export const sql = tag as unknown as Sql<{}>;

export const sqlArray = (...args: any[]) => (ensure() as any).array(...args);
export const sqlFile  = (...args: any[]) => (ensure() as any).file(...args);
export const sqlJson  = (v: any) => (ensure() as any).json(v);