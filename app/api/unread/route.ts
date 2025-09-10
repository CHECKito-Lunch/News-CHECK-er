export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function GET(req: Request) {
  try {
    await requireUser(req);
    // TODO: echte Logik – hier nur Dummy
    return json({
      ok: true,
      last_seen_at: null,
      total: 0,
      unread: 0,
      preview: []
    });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
