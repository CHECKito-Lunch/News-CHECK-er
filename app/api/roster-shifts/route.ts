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

  // Klassifizieren nach Schicht
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
 * 🔥 Intelligentes Name-Matching für verschiedene Formate:
 * - "Nachname Vorname" <-> "Vorname Nachname"
 * - Doppelnamen
 * - Verschiedene Schreibweisen
 */
function normalizeNameForMatching(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ');
  const parts = clean.split(' ');
  
  // Generiere verschiedene Kombinationen
  const variants = new Set<string>();
  
  // Original
  variants.add(clean.toLowerCase());
  
  // Umgekehrte Reihenfolge
  if (parts.length >= 2) {
    variants.add(parts.reverse().join(' ').toLowerCase());
    parts.reverse(); // zurückdrehen
  }
  
  // Alle Wörter als Set (für Teilmatch)
  const wordSet = parts.map(p => p.toLowerCase()).join('|');
  variants.add(wordSet);
  
  return Array.from(variants);
}

/**
 * Prüft ob zwei Namen wahrscheinlich die gleiche Person sind
 */
function namesMatch(name1: string, name2: string): boolean {
  const variants1 = normalizeNameForMatching(name1);
  const variants2 = normalizeNameForMatching(name2);
  
  // Exakte Übereinstimmung einer Variante
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (v1 === v2) return true;
    }
  }
  
  // Wort-basiertes Matching (alle Wörter müssen vorkommen)
  const words1 = name1.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const words2 = name2.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  
  // Mindestens 2 Wörter müssen übereinstimmen
  const matches = words1.filter(w => words2.includes(w));
  return matches.length >= Math.min(2, Math.min(words1.length, words2.length));
}

/**
 * 🔥 Automatisches Linking von team_roster <-> app_users
 * Verknüpft alle Einträge mit user_id=NULL, wenn ein passender Name in app_users existiert
 */
async function autoLinkRosterUsers(s: any) {
  // 1. Hole alle unverknüpften employee_names
  const { data: unlinked } = await s
    .from('team_roster')
    .select('id, employee_name')
    .is('user_id', null)
    .limit(100);

  if (!unlinked || unlinked.length === 0) return;

  // 2. Hole ALLE app_users (für intelligentes Matching)
  const { data: users } = await s
    .from('app_users')
    .select('user_id, name, email')
    .not('name', 'is', null);

  if (!users || users.length === 0) return;

  // 3. Intelligentes Matching mit verschiedenen Namensformaten
  const updates: Array<{ id: number; user_id: string }> = [];

  for (const roster of unlinked) {
    const rosterName = roster.employee_name;
    if (!rosterName) continue;

    // Suche passenden User
    const match = users.find((u: { name: string; }) => namesMatch(rosterName, u.name));
    
    if (match) {
      updates.push({ id: roster.id, user_id: match.user_id });
      console.log(`[roster-shifts] Match found: "${rosterName}" -> "${match.name}" (${match.email})`);
    } else {
      console.log(`[roster-shifts] No match for: "${rosterName}"`);
    }
  }

  // 4. Batch-Update aller gematchten Einträge
  if (updates.length > 0) {
    for (const { id, user_id } of updates) {
      await s
        .from('team_roster')
        .update({ user_id })
        .eq('id', id);
    }
    console.log(`[roster-shifts] Auto-linked ${updates.length} users`);
  }
}
