/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/admin/qa/import/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type IncomingRow = Record<string, any>;

const headerMap: Record<string, string> = {
  // Zeit / Datum
  'datum': 'ts',
  'timestamp': 'ts',
  'ts': 'ts',
  // Klassifizierung
  'fehlertyp': 'incident_type',
  'incident_type': 'incident_type',
  'typ': 'incident_type',
  'kategorie': 'category',
  'category': 'category',
  'gewichtung': 'severity',
  'score': 'severity',
  'severity': 'severity',
  // Beschreibung / Kommentar
  'kommentar': 'description',
  'beschreibung': 'description',
  'description': 'description',
  // Buchungsnummer
  'booking_id': 'booking_number',
  'bookingid': 'booking_number',
  'booking': 'booking_number',
  'buchungsnummer': 'booking_number',
  'bnr': 'booking_number',
  // Agent
  'verursacher': 'agent_name',
  'berater': 'agent_name',
  'name': 'agent_name',
  'agent_name': 'agent_name',
  'agent_first': 'agent_first',
  'vorname': 'agent_first',
  'agent_last': 'agent_last',
  'nachname': 'agent_last',
};

const normalizeHeader = (h: string) => {
  const map: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
  return h
    .replace(/^\uFEFF/, '')
    .trim().toLowerCase()
    .replace(/[äöüß]/g, ch => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

function mapHeaders(r: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) {
    const nk = headerMap[normalizeHeader(k)] ?? normalizeHeader(k);
    out[nk] = v;
  }
  return out;
}

const toStr = (v: any) => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

const cleanBooking = (v: any): string | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/\D+/g, '');
  return digits || null;
};

// dd.mm.yy(yy)[ hh:mm] | dd/mm/yy(yy)[ hh:mm] | ISO → ISO (UTC)
function toISODateTime(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh = '00', mi = '00'] = m;
    let year = +yy;
    if (yy.length === 2) year = year >= 70 ? 1900 + year : 2000 + year;
    const d = new Date(Date.UTC(year, +mm - 1, +dd, +hh, +mi, 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh = '00', mi = '00'] = m;
    let year = +yy;
    if (yy.length === 2) year = year >= 70 ? 1900 + year : 2000 + year;
    const d = new Date(Date.UTC(year, +mm - 1, +dd, +hh, +mi, 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

// Name-Normalisierung wie in deinem Beispiel (lower + whitespace squish)
const normName = (s: string | null) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim() || null;

export async function POST(req: NextRequest) {
  // Admin-Check identisch zu deinem Beispiel
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  // Optionaler Fallback-User (wenn kein Match über Agent-Name gefunden wird)
  const fallbackUserId = String(body?.user_id ?? '').trim();
  if (fallbackUserId && !isUUID(fallbackUserId)) {
    return NextResponse.json({ ok: false, error: 'user_id_must_be_uuid' }, { status: 400 });
  }

  const rowsIn: unknown = body?.rows;
  const rows: IncomingRow[] = Array.isArray(rowsIn) ? rowsIn.map(mapHeaders) : [];
  if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0, skipped: 0 });

  // Vor-Normalisierung in JS (nur was wir für SQL-CTE brauchen)
  type PrepRow = {
    ts_iso: string;                // timestamptz
    incident_type: string | null;
    category: string | null;
    severity: string | null;
    description: string | null;
    booking_number: string | null; // Ziffern only
    agent_first: string | null;
    agent_last: string | null;
    agent_name: string | null;
  };

  const prepped: PrepRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    const ts_iso = toISODateTime(r.ts ?? r.datum ?? r.timestamp);
    if (!ts_iso) { skipped++; continue; }

    const first = toStr(r.agent_first);
    const last  = toStr(r.agent_last);
    const fullFromParts = [first, last].filter(Boolean).join(' ').trim() || null;

    prepped.push({
      ts_iso,
      incident_type: toStr(r.incident_type),
      category: toStr(r.category),
      severity: toStr(r.severity),
      description: toStr(r.description),
      booking_number: cleanBooking(r.booking_number),
      agent_first: first,
      agent_last: last,
      agent_name: toStr(r.agent_name) ?? fullFromParts,
    });
  }

  if (prepped.length === 0) return NextResponse.json({ ok: true, inserted: 0, skipped });

  try {
    // Alles in SQL lösen: Agent-Name normalisieren, gegen app_users matchen, in qa_incidents upserten
    const res = await sql<{ inserted: number }[]>`
with src as (
  select *
  from jsonb_to_recordset(${sqlJson(prepped)}) as r(
    ts_iso         timestamptz,
    incident_type  text,
    category       text,
    severity       text,
    description    text,
    booking_number text,
    agent_first    text,
    agent_last     text,
    agent_name     text
  )
),
agent_src as (
  select
    s.*,
    nullif(trim(regexp_replace(
      coalesce(s.agent_name, trim(concat_ws(' ', s.agent_first, s.agent_last))),
      '\\s+', ' ', 'g'
    )), '') as agent_full_norm
  from src s
),
matched as (
  select
    a.*,
    au.user_id as matched_user_id
  from agent_src a
  left join public.app_users au
    on au.active = true
   and trim(regexp_replace(lower(coalesce(au.name,'')),'\\s+',' ','g'))
       = trim(regexp_replace(lower(coalesce(a.agent_full_norm,'')),'\\s+',' ','g'))
),
prep as (
  select
    coalesce(m.matched_user_id, ${fallbackUserId || null}::uuid) as user_id,
    m.ts_iso as ts,
    nullif(m.incident_type,'') as incident_type,
    nullif(m.category,'') as category,
    nullif(m.severity,'') as severity,
    nullif(m.description,'') as description,
    nullif(m.booking_number,'') as booking_number_hash   -- Name bleibt, Inhalt = Ziffern
  from matched m
  -- Ohne user_id (weder Match noch Fallback) nicht importieren
  where coalesce(m.matched_user_id, ${fallbackUserId || null}::uuid) is not null
)
insert into public.qa_incidents (
  ts, user_id, incident_type, category, severity, description, booking_number_hash
)
select
  p.ts, p.user_id, p.incident_type, p.category, p.severity, p.description, p.booking_number_hash
from prep p
on conflict (user_id, ts, description, booking_number_hash) do nothing
returning 1 as inserted
`;

    const inserted = res.length;
    return NextResponse.json({ ok: true, inserted, skipped });
  } catch (e: any) {
    console.error('[qa/import]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
