/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s=200) => NextResponse.json(d, { status: s });

/** Normalize “Max   Müller ” -> “max müller” */
function normName(s?: string|null) {
  return (s ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Parse "8:00-16:30" -> [480, 990] (minutes) */
function parseRangeToMinutes(s: string): [number|null, number|null] {
  const m = String(s).replace(/\s/g,'').match(/^(\d{1,2}):(\d{2})[-–](\d{1,2}):(\d{2})$/);
  if (!m) return [null, null];
  const [ , h1, mi1, h2, mi2 ] = m.map(Number);
  const start = h1*60 + mi1;
  const end   = h2*60 + mi2;
  if (start>=0 && start<1440 && end>0 && end<=1440 && end>start) return [start, end];
  return [null, null];
}

/** Try detect “absence” words */
function classifyCell(raw: string) {
  const s = raw.trim().toLowerCase();
  if (!s) return { kind:'free' as const, label:null, note:null, start_min:null, end_min:null };
  // Split into lines (label may be first line, time range second line)
  const lines = s.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

  // Look for a time range on any line:
  for (const line of lines) {
    const [st, en] = parseRangeToMinutes(line.replace(',', ':'));
    if (st!=null && en!=null) {
      const label = lines.length>1 ? lines.find(l=>l!==line) ?? null : null;
      return { kind:'work' as const, label, note:null, start_min:st, end_min:en };
    }
  }

  // Absence / holiday keywords
  const abs = ['urlaub','krank','abwesend','fortbildung','elternzeit','sonderurlaub'];
  const hol = ['feiertag','frei (feiertag)','feiertag - frei','frei/feiertag','bank holiday'];
  if (abs.some(k=>s.includes(k))) return { kind:'absent' as const, label:null, note: lines.join(' ') || 'Abwesenheit', start_min:null, end_min:null };
  if (hol.some(k=>s.includes(k))) return { kind:'holiday' as const, label:null, note: lines.join(' ') || 'Feiertag', start_min:null, end_min:null };

  // Catch “frei”, “off”:
  if (/\bfrei\b|\boff\b/.test(s)) return { kind:'free' as const, label:null, note: lines.join(' ') || 'Frei', start_min:null, end_min:null };

  // Fallback: treat as label-only work without time
  return { kind:'work' as const, label: lines[0] ?? null, note: lines.slice(1).join(' ') || null, start_min:null, end_min:null };
}

/** Split a CSV line respecting quotes */
function splitQuoted(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"'){ cur+='"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if (!inQ && ch === delim){ out.push(cur); cur=''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function pickDelimiter(firstNonEmpty: string){
  const cand = [',',';','\t'];
  let best = ',';
  let bestCols = 0;
  for (const d of cand){
    const cols = splitQuoted(firstNonEmpty, d).length;
    if (cols>bestCols){ bestCols=cols; best=d; }
  }
  return best;
}

/** Extract:
 *  - header row index that contains "Name"
 *  - daily column indexes with their Date
 */
function extractHeader(lines: string[]) {
  const nonEmpty = lines.find(l => l.trim().length>0) || '';
  const delim = pickDelimiter(nonEmpty);

  let headerIdx = -1;
  let headerParts: string[] = [];
  for (let i=0;i<Math.min(200, lines.length); i++){
    const parts = splitQuoted(lines[i], delim).map(s=>s.replace(/^\uFEFF/,'').trim());
    if (parts.includes('Name')) { headerIdx = i; headerParts = parts; break; }
  }
  if (headerIdx<0) throw new Error('Header mit "Name" nicht gefunden.');

  // Find date columns (e.g. "Mittwoch, 1. Oktober 2025")
  const dayCols: Array<{ idx: number; date: string }> = [];
  for (let i=0;i<headerParts.length;i++){
    const cell = headerParts[i];
    // try to parse German long date
    const m = cell.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})$/i) || cell.match(/(\d{1,2})\.\s*(\w+)\s*(\d{2,4})/i);
    if (m || /Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag/i.test(cell)) {
      // robust: try Date.parse on the full header (works in most browsers for German locales sometimes)
      // safer: use a regex to pick up dd. <Monat> yyyy from the tail:
      const m2 = cell.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s*(\d{4})/);
      if (m2) {
        const [ , dd, monName, yyyy ] = m2;
        // lightweight month map
        const mons: Record<string, string> = {
          'januar':'01','februar':'02','märz':'03','maerz':'03','april':'04','mai':'05','juni':'06',
          'juli':'07','august':'08','september':'09','oktober':'10','november':'11','dezember':'12'
        };
        const key = monName.toLowerCase().replace('ä','ae').replace('ö','oe').replace('ü','ue');
        const mm = mons[key] ?? null;
        if (mm) {
          const iso = `${yyyy}-${mm}-${String(parseInt(dd,10)).padStart(2,'0')}`;
          dayCols.push({ idx:i, date: iso });
        }
      }
    }
  }

  const partsAtHeader = splitQuoted(lines[headerIdx], delim).map(s=>s.trim());
  const nameIdx = partsAtHeader.indexOf('Name');

  return { delim, headerIdx, nameIdx, dayCols };
}

export async function POST(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(()=>null);
    if (!me) return json({ ok:false, error:'unauthorized' }, 401);
    if (me.role!=='teamleiter' && me.role!=='admin') return json({ ok:false, error:'forbidden' }, 403);

    const form = await req.formData();
    const teamIdRaw = form.get('team_id');
    const file = form.get('file') as File | null;
    if (!file || !teamIdRaw) return json({ ok:false, error:'missing_file_or_team_id' }, 400);

    const team_id = Number(teamIdRaw);
    if (!Number.isFinite(team_id)) return json({ ok:false, error:'bad_team_id' }, 400);

    // permission: requester must be TL of that team (or admin)
    if (me.role !== 'admin') {
      const can = await sql<{ ok:boolean }[]>/*sql*/`
        select exists(
          select 1 from public.team_memberships tm
          where tm.user_id = ${me.user_id}::uuid
            and tm.team_id = ${team_id}::bigint
            and tm.is_teamleiter
            and tm.active
        ) as ok
      `;
      if (!can?.[0]?.ok) return json({ ok:false, error:'forbidden' }, 403);
    }

    // Load file text (try UTF-8, fall back ISO-8859-1)
    let text = await file.text();
    if (!/Name/.test(text) && typeof Buffer !== 'undefined'){
      const buf = Buffer.from(await file.arrayBuffer());
      text = new TextDecoder('iso-8859-1').decode(buf);
    }

    const lines = text.split(/\r?\n/);
    const { delim, headerIdx, nameIdx, dayCols } = extractHeader(lines);

    if (headerIdx < 0 || nameIdx < 0 || dayCols.length === 0) {
      return json({ ok:false, error:'header_not_detected' }, 400);
    }

    // Build person rows (after header)
    const people: Array<{ name: string; row: string[] }> = [];
    for (let i = headerIdx+1; i < lines.length; i++){
      const row = splitQuoted(lines[i], delim);
      // stop if row too short or “end section”
      if (row.every(c => !String(c||'').trim())) continue;
      const name = (row[nameIdx] ?? '').trim();
      if (!name) continue;
      people.push({ name, row });
    }

    // Fetch members of the team (active)
    const members = await sql<Array<{ user_id: string, name: string|null, email: string|null }>>/*sql*/`
      select u.user_id::text, u.name, u.email
      from public.team_memberships tm
      join public.app_users u on u.user_id = tm.user_id
      where tm.team_id = ${team_id}::bigint
        and tm.active
    `;
    const byNormName = new Map<string, string>(); // normName -> user_id
    for (const m of (members ?? [])) {
      if (m.name) byNormName.set(normName(m.name), m.user_id);
      // also map "firstname lastname" from email localpart if helpful
    }

    // Prepare normalized entries
    type Prep = {
      team_id: number;
      user_id: string;
      day: string;
      start_min: number|null;
      end_min: number|null;
      minutes_worked: number|null;
      label: string|null;
      kind: 'work'|'absent'|'holiday'|'free';
      note: string|null;
      raw_cell: string|null;
      import_fp: string;
    };
    const preps: Prep[] = [];

    for (const p of people) {
      const uid = byNormName.get(normName(p.name));
      if (!uid) continue; // skip non-team person

      for (const dc of dayCols) {
        const cellRaw = (p.row[dc.idx] ?? '').replace(/\r/g,'').trim();
        if (!cellRaw) continue;

        // split into display lines
        const lines = cellRaw.split('\n').map(s=>s.trim()).filter(Boolean);
        const parsed = classifyCell(cellRaw);

        const start_min = parsed.start_min;
        const end_min = parsed.end_min;
        const minutes_worked = (start_min!=null && end_min!=null) ? (end_min - start_min) : null;
        const label = parsed.label ? (parsed.label || null) : (lines.length>1 ? lines[0] : null);
        const note = parsed.note ?? (lines.length>1 ? lines.slice(1).join(' ') : (lines[0] || null));

        // Compute fingerprint in SQL later; here build a deterministic string:
        const fp = [
          uid, dc.date, start_min ?? '', end_min ?? '',
          (label ?? ''), (parsed.kind ?? ''), (note ?? ''), cellRaw
        ].join('|');

        preps.push({
          team_id,
          user_id: uid,
          day: dc.date,
          start_min,
          end_min,
          minutes_worked,
          label,
          kind: parsed.kind,
          note,
          raw_cell: cellRaw,
          import_fp: fp,
        });
      }
    }

    if (preps.length === 0) {
      return json({ ok:true, inserted: 0, skipped: 0 });
    }

    // Insert with dedupe
    const res = await sql<{ inserted:number }[]>/*sql*/`
      with src as (
        select *
        from jsonb_to_recordset(${sqlJson(preps)}) as r(
          team_id bigint,
          user_id uuid,
          day date,
          start_min int,
          end_min int,
          minutes_worked int,
          label text,
          kind text,
          note text,
          raw_cell text,
          import_fp text
        )
      ),
      prep as (
        select
          s.team_id, s.user_id, s.day,
          s.start_min, s.end_min, s.minutes_worked,
          nullif(s.label,'') as label,
          case when s.kind in ('work','absent','holiday','free') then s.kind else 'work' end as kind,
          nullif(s.note,'') as note,
          s.raw_cell,
          md5(
            coalesce(s.user_id::text,'') || '|' ||
            coalesce(s.day::text,'')     || '|' ||
            coalesce(s.start_min::text,'') || '|' ||
            coalesce(s.end_min::text,'')   || '|' ||
            coalesce(s.label,'')         || '|' ||
            coalesce(s.kind,'')          || '|' ||
            coalesce(s.note,'')          || '|' ||
            coalesce(s.raw_cell,'')
          ) as fp
        from src s
      )
      insert into public.team_roster_entries (
        team_id, user_id, day, start_min, end_min, minutes_worked, label, kind, note, raw_cell, import_fp
      )
      select
        p.team_id, p.user_id, p.day, p.start_min, p.end_min, p.minutes_worked, p.label, p.kind, p.note, p.raw_cell, p.fp
      from prep p
      on conflict (user_id, day, import_fp) do nothing
      returning 1 as inserted
    `;

    return json({ ok:true, inserted: res.length, skipped: preps.length - res.length });
  } catch (e:any) {
    console.error('[roster/upload] error:', e?.message || e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
