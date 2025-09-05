// app/api/admin/news-agent/run/route.ts
import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/newsAgent';
import { isCronAuthorized, getDryFlag } from '@/lib/server/cronSecret';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTE_VERSION = 'run-v3';

// ✅ Statisch getypte Fehlerform
type SerializedError = {
  message: string | null;
  code?: unknown;
  status?: unknown;
  name?: string | null;
  details?: unknown;
  hint?: unknown;
  stack?: string | null;
  raw?: unknown;
};

function serializeError(e: unknown, debug = false): SerializedError {
  const any = e as any;

  const base: SerializedError = {
    message:
      any?.message ??
      any?.error ??
      any?.msg ??
      (() => {
        try { return JSON.stringify(any); } catch { return String(any); }
      })() ??
      null,
    code: any?.code ?? undefined,
    status: any?.status ?? undefined,
    name: any?.name ?? null,
    details: any?.details ?? undefined,
    hint: any?.hint ?? undefined,
  };

  if (debug) {
    base.stack = any?.stack ?? null;
    try {
      base.raw = JSON.stringify(any);
    } catch {
      base.raw = String(any);
    }
  }

  return base;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get('debug') === '1';

  try {
    const dry = getDryFlag(req);

    if (isCronAuthorized(req)) {
      const result = await runAgent({ dry, force: true });
      const res = NextResponse.json({ ok: true, ...result });
      res.headers.set('X-Route-Version', ROUTE_VERSION);
      return res;
    }

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
    const payload = serializeError(e, debug);
    const res = NextResponse.json(payload, { status: 500 });
    res.headers.set('X-Route-Version', ROUTE_VERSION);
    return res;
  }
}