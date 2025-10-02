// app/api/me/feedback/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Basisquery
    let query = sql`
      select id,
             user_id,
             ts,
             bewertung,
             beraterfreundlichkeit,
             beraterqualifikation,
             angebotsattraktivitaet,
             kommentar,
             template_name,
             rekla,
             geklaert,
             feedbacktyp
      from public.feedback
      where user_id = ${me.sub}::uuid
    `;

    if (from) {
      query = sql`${query} and ts >= ${from}::date`;
    }
    if (to) {
      query = sql`${query} and ts <= ${to}::date + interval '1 day'`;
    }

    query = sql`${query} order by ts desc limit 200`;

    const rows = await query;

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[feedback GET]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
