// app/api/admin/news-agent/run/route.ts
import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/newsAgent';
import { isCronAuthorized, getDryFlag } from '@/lib/server/cronSecret';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTE_VERSION = 'run-v3'; // <— sichtbar in Response-Header

export async function POST(req: Request) {
  try {
    const dry = getDryFlag(req);

    if (isCronAuthorized(req)) {
      const result = await runAgent({ dry, force: true });
      const res = NextResponse.json({ ok: true, ...result });
      res.headers.set('X-Route-Version', ROUTE_VERSION);
      return res;
    }

    // Admin/Moderator-UI: nur DRY
    const u = await requireAdmin(req);
    if (u && dry) {
      const result = await runAgent({ dry: true, force: true });
      const res = NextResponse.json({ ok: true, ...result });
      res.headers.set('X-Route-Version', ROUTE_VERSION);
      return res;
    }

    const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    res.headers.set('X-Route-Version', ROUTE_VERSION);
    return res;
  } catch (e: unknown) {
    const res = NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
    res.headers.set('X-Route-Version', ROUTE_VERSION);
    return res;
  }
}
