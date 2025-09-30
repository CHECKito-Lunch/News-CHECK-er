export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET(req: NextRequest) {
  const year = Number(new URL(req.url).searchParams.get('year') ?? new Date().getFullYear());
  const rows = await sql<any[]>`
    select s.id, s.year, s.month, s.productive_outage, s.lateness_minutes, s.efeedback_score, s.points,
           t.id as team_id, t.name as team_name
    from public.checkiade_scores s
    join public.checkiade_teams t on t.id = s.team_id
    where s.year = ${year}
    order by t.name, s.month
  `;
  return json({ ok:true, items: rows });
}

export async function POST(req: NextRequest) {
  const me = await requireUser(req);
  if (!me || (me.role !== 'admin' && me.role !== 'moderator')) return json({ ok:false, error:'forbidden' }, 403);

  const body = await req.json().catch(()=>null);
  if (!body) return json({ ok:false, error:'invalid json' }, 400);

  const {
    year, month, team_id, team_name,
    productive_outage, lateness_minutes, efeedback_score, points
  } = body;

  if (!year || !month) return json({ ok:false, error:'year/month required' }, 400);

  // Team ermitteln/auto-anlegen falls name geliefert
  let teamId = Number(team_id) || null;
  if (!teamId && team_name?.trim()) {
    const [t] = await sql<any[]>`
      insert into public.checkiade_teams (name) values (${team_name.trim()})
      on conflict (name) do update set name = excluded.name
      returning id
    `;
    teamId = t.id;
  }
  if (!teamId) return json({ ok:false, error:'team_id or team_name required' }, 400);

  const [row] = await sql<any[]>`
    insert into public.checkiade_scores
      (year, month, team_id, productive_outage, lateness_minutes, efeedback_score, points)
    values
      (${year}, ${month}, ${teamId},
       ${productive_outage}, ${lateness_minutes}, ${efeedback_score}, ${points ?? 0})
    on conflict (year, month, team_id) do update set
      productive_outage = excluded.productive_outage,
      lateness_minutes  = excluded.lateness_minutes,
      efeedback_score   = excluded.efeedback_score,
      points            = excluded.points,
      updated_at        = now()
    returning id
  `;
  return json({ ok:true, id: row.id });
}
