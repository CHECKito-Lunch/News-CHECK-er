export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return json({ ok:true, user });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    console.error('[me GET]', e);
    return json({ ok:false, error:'server_error' }, 500);
  }
}
