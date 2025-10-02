// app/api/me/feedback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

function toISODate(d: string | null): string | null {
  if (!d) return null;
  // akzeptiert YYYY-MM-DD oder beliebiges Datum, fällt auf null zurück, wenn invalid
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    if (!me) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // 🔑 User-ID sicher auf number bringen (app_users.id = bigint)
    const rawId = (me.user?.id ?? me.user?.sub ?? me.sub) as unknown;
    const userId = Number(rawId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const fromISO = toISODate(searchParams.get('from'));
    const toISO = toISODate(searchParams.get('to'));

    // Basis-Query
    let q = sql`
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
      where user_id = ${userId}
    `;

    // Filter sicher hinzufügen
    if (fromISO) {
      q = sql`${q} and ts >= ${fromISO}::date`;
    }
    if (toISO) {
      // inkl. Tagesende
      q = sql`${q} and ts < (${toISO}::date + interval '1 day')`;
    }

    q = sql`${q} order by ts desc limit 200`;

    const rows = await q;
    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[feedback GET]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
