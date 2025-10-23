/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s=200) => NextResponse.json(d, { status:s });

type Mapping = {
  firstName?: string;     // "Vorname"
  lastName?: string;      // "Nachname"
  fullName?: string;      // alternativ "Name" (falls kombiniert)
  role?: string;          // "Aufgabe"
  // frei: weitere Meta-Spalten wie Eintrittsdatum o.ä. ignorieren wir
  dateCols: string[];     // ALLE Datums-Spalten (z.B. "Mittwoch, 1. Oktober 2025", ...)
};

type UploadBody = {
  team_id: number|string;
  sheet_name?: string;
  headers: string[];        // Excel-Headerzeile
  rows: string[][];         // Excel-Daten als 2D-Array (ohne Header)
  mapping: Mapping;
  // Name→user_id Mapping aus der UI (Dropdowns):
  assignments: Array<{ sheetName: string; user_id: string|null }>;
};

/* ---------- Helpers: Header "Mittwoch, 1. Oktober 2025" -> YYYY-MM-DD ---------- */
const DE_MONTHS: Record<string, number> = {
  januar:1, februar:2, märz:3, maerz:3, april:4, mai:5, juni:6, juli:7,
  august:8, september:9, oktober:10, november:11, dezember:12
};
function parseGermanLongDate(h: string): string | null {
  const s = String(h ?? '').trim().toLowerCase();
  // Beispiele:
  // "mittwoch, 1. oktober 2025" | "donnerstag, 2. oktober 2025"
  const m = s.match(/^\s*[a-zäöüß]+,\s*(\d{1,2})\.\s*([a-zäöüß]+)\s+(\d{4})\s*$/i);
  if (!m) return null;
  const dd = parseInt(m[1],10);
  const monKey = m[2]
    .replace('ä','ae').replace('ö','oe').replace('ü','ue').replace('ß','ss');
  const mm = DE_MONTHS[monKey] || DE_MONTHS[monKey.normalize('NFKD').replace(/[^\x00-\x7F]/g,'')] || NaN;
  const yyyy = parseInt(m[3],10);
  if (!mm || isNaN(dd) || isNaN(yyyy)) return null;
  const dt = new Date(Date.UTC(yyyy, mm-1, dd));
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0,10);
}

/* ---------- Zellparser: extrahiert Status & Zeiten ---------- */
type ParsedCell =
  | { status: string; start_time?: null; end_time?: null; cross_midnight?: boolean; }
  | { status?: null; start_time: string; end_time: string; cross_midnight: boolean; };

function parseCell(raw: string): ParsedCell | null {
  if (raw == null) return null;
  const txt = String(raw).replace(/\r/g,'').trim();

  if (!txt) return null;

  // Status-Stichworte (Zeiten optional, z.B. "Krank\n13:30-22:00")
  const statusKeywords = ['urlaub', 'krank', 'frei', 'feiertag', 'feiertag - frei', 'terminblocker'];
  const lower = txt.toLowerCase();
  const hasStatus = statusKeywords.find(k => lower.includes(k));

  // Zeitmuster: "06:00-14:30" oder "16:30-01:00+1"
  // Wir nehmen die LETZTE passende Zeit im Text (oft stehen zwei Zeilen: "Früh …\n06:00-14:30")
  const allMatches = [...txt.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(\+1)?/g)];
  const last = allMatches.length ? allMatches[allMatches.length-1] : null;
  if (last) {
    const sh = Math.min(23, Math.max(0, parseInt(last[1],10)));
    const sm = Math.min(59, Math.max(0, parseInt(last[2],10)));
    const eh = Math.min(23, Math.max(0, parseInt(last[3],10)));
    const em = Math.min(59, Math.max(0, parseInt(last[4],10)));
    const plus1 = !!last[5];
    const start_time = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
    const end_time   = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
    // Wenn +1 nicht angegeben ist, aber end<start → ebenfalls über Mitternacht
    const cross_midnight = plus1 || (eh*60+em) < (sh*60+sm);
    if (hasStatus) {
      return { status: hasStatus, start_time: null, end_time: null, cross_midnight };
    }
    return { start_time, end_time, cross_midnight };
  }

  // nur Status ohne Zeit
  if (hasStatus) return { status: hasStatus };

  return null; // leer/irrelevant
}

function pick<T=string>(headers: string[], row: string[], colName?: string|null): T|null {
  if (!colName) return null;
  const idx = headers.indexOf(colName);
  if (idx < 0) return null;
  const v = row[idx];
  return (v==null || v==='') ? null : (v as any);
}

function compactSpaces(s: string) {
  return s.trim().replace(/\s+/g,' ');
}

export async function POST(req: NextRequest){
  try {
    const me = await getUserFromCookies().catch(()=>null);
    if (!me) return json({ ok:false, error:'unauthorized' }, 401);
    if (me.role !== 'teamleiter' && me.role !== 'admin') {
      return json({ ok:false, error:'forbidden' }, 403);
    }

    // Body als JSON (wir schicken kein File mehr, sondern geparste Inhalte vom Client)
    const body = await req.json() as UploadBody;

    const teamId = Number(body?.team_id ?? NaN);
    const headers = Array.isArray(body?.headers) ? body.headers : [];
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const mapping = body?.mapping as Mapping;
    const assigns = Array.isArray(body?.assignments) ? body.assignments : [];

    if (!Number.isFinite(teamId) || !teamId) return json({ ok:false, error:'invalid team_id' }, 400);
    if (!headers.length || !rows.length) return json({ ok:false, error:'no_rows' }, 400);
    if (!mapping?.dateCols?.length) return json({ ok:false, error:'no_date_columns' }, 400);

    // Berechtigung prüfen
    const can = await sql<{ok:boolean}[]>/*sql*/`
      select exists(
        select 1 from public.team_memberships tm
        where tm.team_id = ${teamId}::bigint
          and tm.user_id = ${me.user_id}::uuid
          and tm.is_teamleiter and tm.active
      ) as ok
    `;
    if (!can?.[0]?.ok && me.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403);

    // Name→user_id Lookuptabelle (aus Dropdown)
    const nameToUser = new Map<string,string>(); // key = normalized sheet name
    for (const a of assigns) {
      const k = compactSpaces(String(a.sheetName||'').toLowerCase());
      if (a.user_id) nameToUser.set(k, a.user_id);
    }

    // Zielrows bauen
    type Out = {
      team_id: number;
      roster_date: string;       // YYYY-MM-DD
      start_time: string|null;
      end_time: string|null;
      employee_name: string;
      user_id: string|null;
      role: string|null;
      status: string|null;
      raw_cell: string|null;
      created_by: string;
      cross_midnight: boolean;
    };
    const out: Out[] = [];

    for (const row of rows) {
      const first = pick(headers, row, mapping.firstName);
      const last  = pick(headers, row, mapping.lastName);
      const full  = pick(headers, row, mapping.fullName);

      const sheetName = full
        ? compactSpaces(String(full))
        : compactSpaces([last, first].filter(Boolean).join(' '));

      if (!sheetName) continue;

      const role = pick<string>(headers, row, mapping.role);

      // Jede Datums-Spalte falten
      for (const col of mapping.dateCols) {
        const dateISO = parseGermanLongDate(col);
        if (!dateISO) continue;

        const rawCell = pick<string>(headers, row, col) ?? '';
        if (!rawCell) continue; // leer

        const parsed = parseCell(rawCell);
        if (!parsed) continue;

        const normKey = sheetName.toLowerCase(); // fürs Mapping
        const user_id = nameToUser.get(normKey) ?? null;

        if ('start_time' in parsed && parsed.start_time && parsed.end_time) {
          out.push({
            team_id: teamId,
            roster_date: dateISO,
            start_time: parsed.start_time,
            end_time: parsed.end_time,
            employee_name: sheetName,
            user_id,
            role: role ? String(role) : null,
            status: parsed.status ?? null,
            raw_cell: rawCell,
            created_by: me.user_id,
            cross_midnight: parsed.cross_midnight ?? false,
          });
        } else {
          // reiner Status-Tag ohne Zeiten (Urlaub/Frei/Krank/…)
          out.push({
            team_id: teamId,
            roster_date: dateISO,
            start_time: null,
            end_time: null,
            employee_name: sheetName,
            user_id,
            role: role ? String(role) : null,
            status: parsed.status ?? null,
            raw_cell: rawCell,
            created_by: me.user_id,
            cross_midnight: false,
          });
        }
      }
    }

    if (!out.length) return json({ ok:false, error:'no_parsed_rows' }, 400);

    // Insert
const res = await sql/*sql*/`
  with src as (
    select * from jsonb_to_recordset(${sqlJson(out)}) as r(
      team_id bigint,
      roster_date text,
      start_time text,
      end_time text,
      employee_name text,
      user_id uuid,
      role text,
      status text,
      raw_cell text,
      created_by uuid,
      cross_midnight boolean
    )
  )
  insert into public.team_roster (
    team_id, roster_date, start_time, end_time,
    employee_name, user_id, role, status, raw_cell, created_by
  )
  select
    team_id,
    roster_date::date,
    case when start_time is not null then start_time::time end,
    case when end_time   is not null then end_time::time end,
    employee_name, user_id, role, status, raw_cell, created_by
  from src
  where not exists (
    select 1 from public.team_roster t
    where t.team_id = src.team_id
      and t.roster_date = src.roster_date::date
      and t.employee_name = src.employee_name
  )
  returning id
`;

return json({ ok:true, inserted: Array.isArray(res) ? res.length : 0 });
  } catch (e:any) {
    console.error('[roster/upload]', e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
