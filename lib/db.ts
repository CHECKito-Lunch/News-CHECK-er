// lib/db.ts
import 'server-only';
import dns from 'dns';
import postgres, { type Sql } from 'postgres';

// IPv4 bevorzugen (Container/Codespaces haben oft zickiges IPv6)
dns.setDefaultResultOrder?.('ipv4first');

let _sql: Sql<{}> | null = null;

function ensure(): Sql<{}> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // WICHTIG: erst beim Aufruf meckern, nicht beim Import (Build-freundlich)
    throw new Error('DATABASE_URL fehlt. Bitte in .env.local setzen.');
  }
  if (!_sql) {
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

// Der getaggte Template-Call selbst (sql`SELECT …`)
export const sql = ((...args: any[]) => (ensure() as any)(...args)) as unknown as Sql<{}>;

// Methoden explizit und ohne Spread typgerecht durchreichen
(sql as any).begin = (fn: any) => (ensure() as any).begin(fn);
(sql as any).unsafe = (text: any, params?: any) => (ensure() as any).unsafe(text, params);
(sql as any).end = () => (ensure() as any).end();
