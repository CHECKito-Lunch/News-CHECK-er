/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/roster-shifts/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

export const runtime = 'nodejs';

type RosterRow = {
  employee_name: string | null;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;   // "HH:MM:SS"
  user_id: string | null;
  team_id: number;
  roster_date: string;       // "YYYY-MM-DD"
};

function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  const h = parts[0], m = parts[1];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// GET /api/roster-shifts?day=YYYY-MM-DD&earlyStart=300&middleStart=600&lateStart=750[&team_id=123]
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const s = supabaseAdmin();

  const day = (searchParams.get('day') || '').slice(0, 10);
  if (!day) {
    return NextResponse.json({ error: 'Missing day param' }, { status: 400 });
  }

  const teamIdParam = searchParams.get('team_id');
  const teamId = teamIdParam != null ? Number(teamIdParam) : null;

  const earlyStart = Math.max(0, Math.floor(Number(searchParams.get('earlyStart') ?? '300')));  // 05:00
  const middleStart = Math.max(earlyStart, Math.floor(Number(searchParams.get('middleStart') ?? '600'))); // 10:00
  const lateStart = Math.max(middleStart, Math.floor(Number(searchParams.get('lateStart') ?? '750')));    // 12:30

  let q = s
    .from(T.team_roster)
    .select('employee_name,start_time,end_time,user_id,team_id,roster_date') as any;
  q = q.eq('roster_date', day);
  if (Number.isFinite(teamId)) q = q.eq('team_id', teamId);

  const { data, error } = await q as { data: RosterRow[] | null; error: any };
  if (error) {
    console.error('roster-shifts supabase error', error);
    return NextResponse.json({ error: error.message || 'Query error' }, { status: 500 });
  }

  const rows: RosterRow[] = Array.isArray(data) ? data : [];

  // Aggregation pro Person (user_id bevorzugt, sonst Name), früheste Startzeit
  const perPerson = new Map<string, { name: string; startMin: number | null }>();
  for (const it of rows) {
    const key = it.user_id || it.employee_name || '';
    if (!key) continue;
    const name = (it.employee_name || '—').trim();
    const start = toMinutes(it.start_time);
    // Nur Zeilen mit gültiger Startzeit zählen (Schicht), alles andere ist "abwesend"
    if (!Number.isFinite(start)) continue;
    const prev = perPerson.get(key);
    if (!prev) {
      perPerson.set(key, { name, startMin: start });
    } else {
      const bestStart =
        prev.startMin == null
          ? start
          : start == null
            ? prev.startMin
            : Math.min(prev.startMin, start);
      perPerson.set(key, { name, startMin: bestStart });
    }
  }

  // Schicht-Klassifikation nur anhand früheste Startzeit (wenn vorhanden)
  const classify = (start: number | null): 'early' | 'middle' | 'late' | null => {
    if (start == null) return null;
    if (start < earlyStart) return 'early';
    if (start < middleStart) return 'middle';
    if (start < lateStart) return 'late';
    return 'late';
  };

  const buckets = {
    early: [] as string[],
    middle: [] as string[],
    late: [] as string[],
    absent: [] as string[],
  };

  const allKeys = new Set<string>();
  for (const it of rows) {
    const key = it.user_id || it.employee_name || '';
    if (key) allKeys.add(key);
  }
  // Sortiere alle mit Schicht ein
  for (const [key, { name, startMin }] of perPerson.entries()) {
    const b = classify(startMin);
    if (b === 'early') buckets.early.push(name);
    else if (b === 'middle') buckets.middle.push(name);
    else buckets.late.push(name);
  }
  // Alle übrigen gelten als abwesend
  for (const key of allKeys) {
    if (!perPerson.has(key)) {
      // Name aus Zeilen holen
      const row = rows.find(it => (it.user_id || it.employee_name || '') === key);
      const name = (row?.employee_name || '—').trim();
      buckets.absent.push(name);
    }
  }

  const result = {
    day,
    thresholds: { earlyStart, middleStart, lateStart },
    buckets: {
      early:  { count: buckets.early.length,  names: buckets.early },
      middle: { count: buckets.middle.length, names: buckets.middle },
      late:   { count: buckets.late.length,   names: buckets.late },
      absent: { count: buckets.absent.length, names: buckets.absent },
    },
  };

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
