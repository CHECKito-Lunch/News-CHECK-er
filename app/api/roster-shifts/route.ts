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

  // 🔥 NEUE LOGIK: Auto-Link unverknüpfte Namen
  try {
    await autoLinkRosterUsers(s);
  } catch (e) {
    console.error('[roster-shifts] Auto-link failed:', e);
    // Nicht blockieren, nur loggen
  }

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

/**
 * 🔥 Automatisches Linking von team_roster <-> app_users
 * Verknüpft alle Einträge mit user_id=NULL, wenn ein passender Name in app_users existiert
 */
async function autoLinkRosterUsers(s: any) {
  // 1. Hole alle unverknüpften employee_names
  const { data: unlinked } = await s
    .from('team_roster')
    .select('employee_name')
    .is('user_id', null)
    .limit(100); // Max 100 pro Request (Performance)

  if (!unlinked || unlinked.length === 0) return;

  // 2. Hole alle app_users mit passenden Namen
  const uniqueNames = [...new Set(unlinked.map((r: any) => r.employee_name))];
  const { data: users } = await s
    .from('app_users')
    .select('user_id, name')
    .in('name', uniqueNames);

  if (!users || users.length === 0) return;

  // 3. Erstelle Mapping: name -> user_id
  const nameToUserId = new Map<string, string>();
  for (const u of users) {
    if (u.name) nameToUserId.set(u.name, u.user_id);
  }

  // 4. Update team_roster für alle gematchten Namen
  for (const [name, userId] of nameToUserId.entries()) {
    await s
      .from('team_roster')
      .update({ user_id: userId })
      .eq('employee_name', name)
      .is('user_id', null);
  }

  console.log(`[roster-shifts] Auto-linked ${nameToUserId.size} users`);
}
