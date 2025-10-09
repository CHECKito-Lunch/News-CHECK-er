/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/db.ts
import 'server-only';
import dns from 'dns';
import postgres, { type Sql } from 'postgres';

// IPv4 bevorzugen, ohne globales lookup zu verbiegen
try { dns.setDefaultResultOrder?.('ipv4first'); } catch {}

let _sql: Sql | null = null;

function normalizeUrl(raw: string): string {
  // postgresql -> postgres (beides ok, wir vereinheitlichen)
  let url = raw.replace(/^postgresql:\/\//i, 'postgres://');

  // sslmode=require anhängen, falls nicht vorhanden
  if (!/[?&]sslmode=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  return url;
}

function ensure(): Sql {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL fehlt. Bitte in .env.local setzen.');

  if (!_sql) {
    const url = normalizeUrl(raw);

    // Sanity-Check & Debug (ohne Secrets)
    let host = '';
    try {
      const u = new URL(url);
      host = u.hostname;
      if (!host) throw new Error('Hostname fehlt');
      if (process.env.NODE_ENV !== 'production') {
        console.log('[db] connecting to host:', host);
      }
    } catch {
      throw new Error('Ungültige DATABASE_URL.');
    }

    _sql = postgres(url, {
      // Bei PgBouncer/Pooler: keine Prepared Statements
      prepare: false,
      ssl: 'require',
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _sql;
}

// Tag-Funktion kompatibel halten
type Tag = <T = any>(strings: TemplateStringsArray, ...values: any[]) => Promise<T[]>;
const tag: Tag = (strings, ...values) => (ensure() as any)(strings, ...values);

// Helfer-Methoden durchreichen (an tag)
(tag as any).begin  = (fn: any) => (ensure() as any).begin(fn);
(tag as any).unsafe = (text: any, params?: any) => (ensure() as any).unsafe(text, params);
(tag as any).end    = () => (ensure() as any).end();

// Exporte
// Funktions-export mit durchgereichten Helfern
export const sql: any = ((...a: any[]) => (ensure() as any)(...a)) as any;

// ⬇️ diese vier Zeilen sorgen dafür, dass sql.begin/unsafe/end/json vorhanden sind
(sql as any).begin  = (fn: any) => (ensure() as any).begin(fn);
(sql as any).unsafe = (text: any, params?: any) => (ensure() as any).unsafe(text, params);
(sql as any).end    = () => (ensure() as any).end();
(sql as any).json   = (v: any) => (ensure() as any).json(v);

// Nur json brauchen wir aktuell – array/file weglassen (nicht alle Versionen haben das)
export const sqlJson = (v: any) => (ensure() as any).json(v);
