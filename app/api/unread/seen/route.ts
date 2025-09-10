export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function POST(req: Request) {
  try {
    const me = await requireUser(req);
    // TODO: in DB last_seen_at für me.userId setzen
    return json({ ok:true });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
