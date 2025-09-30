// app/api/admin/checkiade/scores/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

async function assertAdmin(req: NextRequest) {
  const me = await requireUser(req);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator'))
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  return me;
}

export async function POST(req: NextRequest) {
  const me = await assertAdmin(req);
  if (!(me as any)?.sub) return me as any;

  const body = await req.json().catch(() => ({}));

  const {
    teamId, teamName, groupId,
    year, month,
    productive_outage, lateness_minutes, efeedback_score,
    points, note
  } = body || {};

  if ((!teamId && !teamName) || !year || !month)
    return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 400 });

  // 1) Team sicherstellen
  const rows = await sql<any[]>`
    insert into public.checkiade_teams(name, group_id)
    values(${teamName ?? null}, ${groupId ?? null})
    on conflict (name) do update set name = excluded.name
    returning id
  `;

  const tid = teamId ?? rows?.[0]?.id;

  // 2) Score upsert
  await sql`
    insert into public.checkiade_scores
      (team_id, year, month, productive_outage, lateness_minutes, efeedback_score, points, note, updated_at)
    values
      (${tid}, ${year}, ${month}, ${productive_outage}, ${lateness_minutes}, ${efeedback_score}, ${points ?? 0}, ${note ?? null}, now())
    on conflict (team_id, year, month)
      do update set
        productive_outage = excluded.productive_outage,
        lateness_minutes  = excluded.lateness_minutes,
        efeedback_score   = excluded.efeedback_score,
        points            = excluded.points,
        note              = excluded.note,
        updated_at        = now()
  `;

  return NextResponse.json({ ok: true });
}
