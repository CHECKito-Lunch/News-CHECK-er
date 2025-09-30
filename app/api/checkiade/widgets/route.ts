// app/api/checkiade/widgets/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const json = (d:any, s=200) => NextResponse.json(d, { status: s });

export async function GET() {
  try {
    // nur öffentliche Widgets, neueste zuerst
    const rows = await sql<any[]>`
      select id, name, config, created_at
        from public.checkiade_widgets
       where is_public = true
       order by created_at desc
       limit 200
    `;
    return json({ ok: true, items: rows });
  } catch (e:any) {
    console.error('[checkiade/widgets GET public] error:', e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
