// app/api/me/feedback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function toISODate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}



export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    // 1) Versuche UUID direkt aus dem Auth-Objekt zu ziehen
    let uuid: string | null = null;
    const cand = (me as any)?.sub ?? (me as any)?.user?.sub ?? (me as any)?.user?.user_id;
    if (isUUID(cand)) {
      uuid = cand;
    } else {
      // 2) Fallback: wenn nur eine numerische app_users.id vorhanden ist, frage die UUID nach
      const rawId = (me as any)?.user?.id ?? (me as any)?.id;
      const numericId = Number(rawId);
      if (Number.isFinite(numericId)) {
        const r = await sql<{ user_id: string | null }[]>`
          select user_id from public.app_users where id = ${numericId} limit 1
        `;
        uuid = r[0]?.user_id ?? null;
      }
    }

    if (!uuid || !isUUID(uuid)) {
      return NextResponse.json({ ok: false, error: 'invalid_user_uuid' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const fromISO = toISODate(searchParams.get('from'));
    const toISO = toISODate(searchParams.get('to'));

    // Basisquery gegen user_feedback, Felder auf Frontend-Shape gemappt
    let q = sql`
      select
        id,
        user_id,
        feedback_at                 as ts,
        rating_overall              as bewertung,
        rating_friend               as beraterfreundlichkeit,
        rating_qual                 as beraterqualifikation,
        rating_offer                as angebotsattraktivitaet,
        comment_raw                 as kommentar,
        template_name,
        reklamation                 as rekla,
        resolved                    as geklaert,
        channel                     as feedbacktyp,
        note                        as internal_note,       
        note_checked                as internal_checked 
      from public.user_feedback
      where user_id = ${uuid}::uuid
    `;

    if (fromISO) q = sql`${q} and feedback_at >= ${fromISO}::date`;
    if (toISO)   q = sql`${q} and feedback_at < (${toISO}::date + interval '1 day')`;
    q = sql`${q} order by feedback_at desc, id desc limit 200`;

    const rows = await q;
    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[me/feedback GET]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
