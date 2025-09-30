// app/api/checkiade/leaderboard/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year') ?? new Date().getFullYear());

  // optional: keine Auth erforderlich (öffentliche Rangliste)
  await requireUser(req).catch(() => null);

  const rows = await sql<any[]>`
    select
      t.id as team_id,
      t.name as team_name,
      sum(s.points)::int as points
    from public.checkiade_scores s
    join public.checkiade_teams t on t.id = s.team_id
    where s.year = ${year}
    group by t.id, t.name
    order by points desc, team_name asc
  `;

  return NextResponse.json({ ok: true, year, items: rows });
}
