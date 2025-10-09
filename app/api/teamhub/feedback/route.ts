// app/api/teamhub/feedback/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

const json = <T extends object>(d: T, status = 200) => NextResponse.json<T>(d, { status });
const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/**
 * GET /api/teamhub/feedback?user_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=&offset=
 * - Nur teamleiter oder admin
 * - teamleiter: nur Mitarbeiter sehen, die seinem/ihrem Team zugeordnet sind
 * - admin: darf alle sehen
 * - Felder werden auf die vom Frontend erwarteten Keys gemappt
 */
export async function GET(req: NextRequest) {
  const me = await getUserFromCookies();
  if (!me) return json({ ok: false, error: 'unauthorized' as const }, 401);

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('user_id') || '';
  if (!isUUID(userId)) return json({ ok: false, error: 'user_id_required' as const }, 400);

  const from = searchParams.get('from') || null;  // YYYY-MM-DD optional
  const to   = searchParams.get('to')   || null;  // YYYY-MM-DD optional
  const limit  = Math.min(200, Math.max(1, Number(searchParams.get('limit')  ?? '100')));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? '0'));

  // Nur teamleiter & admin erlaubt
  const role = me.role as Role;
  if (!(role === 'teamleiter' || role === 'admin')) {
    return json({ ok: false, error: 'forbidden' as const }, 403);
  }

  // Wenn teamleiter: prüfen, ob target user in einem seiner Teams ist
  if (role === 'teamleiter') {
    const chk = await sql/*sql*/`
      with my_teams as (
        select tm.team_id
        from public.team_memberships tm
        where tm.user_id = ${me.user_id}::uuid
          and tm.is_teamleiter = true
          and tm.active = true
      )
      select exists (
        select 1
        from public.team_memberships x
        join my_teams t on t.team_id = x.team_id
        where x.user_id = ${userId}::uuid
          and x.active = true
      ) as allowed
    `;
    const allowed = Boolean(chk?.[0]?.allowed);
    if (!allowed) return json({ ok: false, error: 'forbidden' as const }, 403);
  }

  // Daten holen – Spalten sauber auf Frontend-Keys gemappt
  const rows = await sql/*sql*/`
    select
      f.id,
      -- bevorzugt exakter Zeitpunkt, sonst Datum auf 00:00 (Berlin) gecastet
      coalesce(f.feedback_ts, f.feedback_at::timestamptz) as ts,
      f.rating_overall       as bewertung,
      f.rating_friend        as beraterfreundlichkeit,
      f.rating_qual          as beraterqualifikation,
      f.rating_offer         as angebotsattraktivitaet,
      f.comment_raw          as kommentar,
      f.note                 as internal_note,
      f.note_checked         as internal_checked,
      f.template_name,
      f.reklamation          as rekla,
      f.resolved             as geklaert,
      coalesce(f.channel, 'unknown') as feedbacktyp,
      f.booking_number_hash,
      NULL::text             as booking_number  -- (booking_number_enc ist verschlüsselt)
    from public.user_feedback f
    where f.user_id = ${userId}::uuid
      ${from ? sql`and coalesce(f.feedback_ts, f.feedback_at::timestamptz) >= ${from}::date` : sql``}
      ${to   ? sql`and coalesce(f.feedback_ts, f.feedback_at::timestamptz) <  (${to}::date + interval '1 day')` : sql``}
    order by coalesce(f.feedback_ts, f.feedback_at::timestamptz) desc nulls last, f.id desc
    limit ${limit} offset ${offset}
  `;

  return json({ ok: true, items: rows });
}
