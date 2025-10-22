/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/roster-shifts/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

export const runtime = 'nodejs';

type RosterRow = {
  employee_name: string | null;
  raw_cell: string | null;
  user_id: string | null;
  team_id: number;
  roster_date: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const s = supabaseAdmin();

  const day = (searchParams.get('day') || '').slice(0, 10);
  if (!day) {
    return NextResponse.json({ error: 'Missing day param' }, { status: 400 });
  }

  const teamIdParam = searchParams.get('team_id');
  const teamId = teamIdParam != null ? Number(teamIdParam) : null;

  // Daten abfragen
  let q = s.from(T.team_roster)
    .select('employee_name,raw_cell,user_id,team_id,roster_date') as any;
  q = q.eq('roster_date', day);
  if (Number.isFinite(teamId)) q = q.eq('team_id', teamId);

  const { data, error } = await q as { data: RosterRow[] | null; error: any };
  if (error) {
    return NextResponse.json({ error: error.message || 'Query error' }, { status: 500 });
  }
  const rows: RosterRow[] = Array.isArray(data) ? data : [];

  // Genaues Klassifizieren nach Wort
  const buckets = {
    early: [] as string[],
    middle: [] as string[],
    late: [] as string[],
    absent: [] as string[],
  };

  for (const row of rows) {
    const name = (row.employee_name || '—').trim();
    const cell = row.raw_cell?.toLowerCase() || '';
    if (cell.includes('früh')) {
      buckets.early.push(name);
    } else if (cell.includes('mittel')) {
      buckets.middle.push(name);
    } else if (cell.includes('spät')) {
      buckets.late.push(name);
    } else {
      buckets.absent.push(name);
    }
  }

  const result = {
    day,
    buckets: {
      early:  { count: buckets.early.length,  names: buckets.early },
      middle: { count: buckets.middle.length, names: buckets.middle },
      late:   { count: buckets.late.length,   names: buckets.late },
      absent: { count: buckets.absent.length, names: buckets.absent },
    }
  };
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
