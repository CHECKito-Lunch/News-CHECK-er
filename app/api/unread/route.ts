// app/api/unread/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type NewsItem = {
  id: number;
  slug?: string | null;
  title: string;
  summary?: string | null;
  // beliebige Datumsfelder möglich
  effective_from?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  date?: string | null;
};

function pickDate(n: NewsItem): string | null {
  return (
    n.effective_from ??
    n.published_at ??
    n.created_at ??
    n.createdAt ??
    n.updated_at ??
    n.updatedAt ??
    n.date ??
    null
  );
}

export async function GET(request: Request) {
  try {
    const jar = await cookies();
    const lastSeen = jar.get('last_seen_at')?.value ?? null;
    const since = lastSeen ? new Date(lastSeen) : null;

    // Base-URL robust aus dem Request
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const base = `${proto}://${host}`;

    // Cookie-Header an interne Requests durchreichen (Auth!)
    const cookieHeader = request.headers.get('cookie') ?? '';

    const load = async (url: string): Promise<NewsItem[]> => {
      try {
        const r = await fetch(url, {
          cache: 'no-store',
          headers: { cookie: cookieHeader },
        });
        const j = await r.json().catch(() => ({}));
        return Array.isArray(j.data) ? (j.data as NewsItem[]) : [];
      } catch {
        return [];
      }
    };

    // News + (optional) Agent-News zusammenziehen
    const main = await load(`${base}/api/news?page=1&pageSize=200`);
    const agent = await load(`${base}/api/news?agent=1&page=1&pageSize=200`);
    const all = [...main, ...agent];

    // Falls gar kein Datumsfeld vorhanden ist, behandeln wir den Eintrag als "jetzt",
    // damit er nicht versehentlich herausfällt.
    const fresh = all
      .map((n) => {
        const ds = pickDate(n) ?? new Date().toISOString();
        const t = new Date(ds);
        return Number.isNaN(+t) ? null : { n, t };
      })
      .filter((x): x is { n: NewsItem; t: Date } => !!x)
      .filter(({ t }) => !since || t > since)
      .sort((a, b) => b.t.getTime() - a.t.getTime());

    const preview = fresh.slice(0, 10).map(({ n, t }) => ({
      id: n.id,
      slug: n.slug ?? null,
      title: n.title,
      summary: n.summary ?? null,
      effective_from: t.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      last_seen_at: lastSeen,
      total: fresh.length,
      unread: fresh.length, // Alias für Header
      preview,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'unread_failed' }, { status: 500 });
  }
}
