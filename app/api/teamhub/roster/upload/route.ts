/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s = 200) => NextResponse.json(d, { status: s });

type Mapping = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: string;
  dateCols: string[];
};

type UploadBody = {
  sheet_name?: string;
  headers: string[];
  rows: string[][];
  mapping: Mapping;
  assignments: Array<{ sheetName: string; user_id: string | null }>;
};

const DE_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12
};

function parseGermanLongDate(h: string): string | null {
  const s = String(h ?? '').trim().toLowerCase();
  const m = s.match(/^\s*[a-zäöüß]+,\s*(\d{1,2})\.\s*([a-zäöüß]+)\s+(\d{4})\s*$/i);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const monKey = m[2].replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss');
  const mm = DE_MONTHS[monKey] || DE_MONTHS[monKey.normalize('NFKD').replace(/[^\x00-\x7F]/g, '')] || NaN;
  const yyyy = parseInt(m[3], 10);
  if (!mm || isNaN(dd) || isNaN(yyyy)) return null;
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

type ParsedCell =
  | { status: string; start_time?: null; end_time?: null; cross_midnight?: boolean }
  | { status?: null; start_time: string; end_time: string; cross_midnight: boolean };

function parseCell(raw: string): ParsedCell | null {
  if (raw == null) return null;
  const txt = String(raw).replace(/\r/g, '').trim();
  if (!txt) return null;

  const statusKeywords = ['urlaub', 'krank', 'frei', 'feiertag', 'feiertag - frei', 'terminblocker'];
  const lower = txt.toLowerCase();
  const hasStatus = statusKeywords.find(k => lower.includes(k));

  const allMatches = [...txt.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(\+1)?/g)];
  const last = allMatches.length ? allMatches[allMatches.length - 1] : null;

  if (last) {
    const sh = Math.min(23, Math.max(0, parseInt(last[1], 10)));
    const sm = Math.min(59, Math.max(0, parseInt(last[2], 10)));
    const eh = Math.min(23, Math.max(0, parseInt(last[3], 10)));
    const em = Math.min(59, Math.max(0, parseInt(last[4], 10)));
    const plus1 = !!last[5];
    const start_time = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    const end_time = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    const cross_midnight = plus1 || (eh * 60 + em) < (sh * 60 + sm);
    if (hasStatus) {
      return { status: hasStatus, start_time: null, end_time: null, cross_midnight };
    }
    return { start_time, end_time, cross_midnight };
  }
  if (hasStatus) return { status: hasStatus };
  return null;
}

function pick<T = string>(headers: string[], row: string[], colName?: string | null): T | null {
  if (!colName) return null;
  const idx = headers.indexOf(colName);
  if (idx < 0) return null;
  const v = row[idx];
  return (v == null || v === '') ? null : (v as any);
}

function compactSpaces(s: string) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

export async function POST(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(() => null);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

    if (me.role !== 'teamleiter' && me.role !== 'admin') {
      return json({ ok: false, error: 'forbidden' }, 403);
    }

    const body = await req.json() as UploadBody;
    const headers = Array.isArray(body?.headers) ? body.headers : [];
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const mapping = body?.mapping as Mapping;
    const assigns = Array.isArray(body?.assignments) ? body.assignments : [];

    if (!headers.length || !rows.length) return json({ ok: false, error: 'no_rows' }, 400);
    if (!mapping?.dateCols?.length) return json({ ok: false, error: 'no_date_columns' }, 400);

    type Out = {
      roster_date: string;
      start_time: string | null;
      end_time: string | null;
      employee_name: string;
      role: string | null;
      status: string | null;
      raw_cell: string | null;
      created_by: string;
      cross_midnight: boolean;
    };

    const out: Out[] = [];

    for (const row of rows) {
      const first = pick(headers, row, mapping.firstName);
      const last = pick(headers, row, mapping.lastName);
      const full = pick(headers, row, mapping.fullName);

      const sheetName = full
        ? compactSpaces(String(full))
        : compactSpaces([last, first].filter(Boolean).join(' '));

      if (!sheetName) continue;

      const role = pick<string>(headers, row, mapping.role);

      for (const col of mapping.dateCols) {
        const dateISO = parseGermanLongDate(col);
        if (!dateISO) continue;

        const rawCell = pick<string>(headers, row, col) ?? '';
        if (!rawCell) continue;

        const parsed = parseCell(rawCell);
        if (!parsed) continue;

        const base = {
          roster_date: dateISO,
          employee_name: sheetName,
          role: role ? String(role) : null,
          status: parsed.status ?? null,
          raw_cell: rawCell,
          created_by: me.user_id as string,
        };

        if ('start_time' in parsed && parsed.start_time && parsed.end_time) {
          out.push({
            ...base,
            start_time: parsed.start_time,
            end_time: parsed.end_time,
            cross_midnight: parsed.cross_midnight ?? false,
          });
        } else {
          out.push({
            ...base,
            start_time: null,
            end_time: null,
            cross_midnight: false,
          });
        }
      }
    }

    if (!out.length) return json({ ok: false, error: 'no_parsed_rows' }, 400);

    // --- INSERT (team_id aus app_users.team_id, Name normalisiert wie im Frontend) ---
    const inserted = await sql/*sql*/`
WITH src AS (
  SELECT * FROM jsonb_to_recordset(${sqlJson(out)}) AS r(
    roster_date     text,
    start_time      text,
    end_time        text,
    employee_name   text,
    role            text,
    status          text,
    raw_cell        text,
    created_by      uuid,
    cross_midnight  boolean
  )
),
assign_map AS (
  SELECT
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(lower(a.sheetName),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
        '[^a-z0-9\\s]','',
        'g'
      ),
      '\\s+',' ',
      'g'
    ) AS sheet_name_norm,
    NULLIF(a.user_id, '')::uuid AS user_id
  FROM jsonb_to_recordset(${sqlJson(assigns)}) AS a(sheetName text, user_id text)
  WHERE a.user_id IS NOT NULL
),
src_norm AS (
  SELECT
    s.*,
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(lower(s.employee_name),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
        '[^a-z0-9\\s]','',
        'g'
      ),
      '\\s+',' ',
      'g'
    ) AS employee_name_norm
  FROM src s
),
app_users_active AS (
  SELECT
    au.*,
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(lower(au.name),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
        '[^a-z0-9\\s]','',
        'g'
      ),
      '\\s+',' ',
      'g'
    ) AS au_name_norm
  FROM public.app_users au
  WHERE au.active = true
),
resolved_user AS (
  SELECT
    sn.*,
    COALESCE(am.user_id, aua.user_id) AS user_id
  FROM src_norm sn
  LEFT JOIN assign_map am
    ON am.sheet_name_norm = sn.employee_name_norm
  LEFT JOIN app_users_active aua
    ON aua.au_name_norm = sn.employee_name_norm
),
resolved_primary AS (
  SELECT
    ru.*,
    au2.team_id
  FROM resolved_user ru
  LEFT JOIN public.app_users au2
    ON au2.user_id = ru.user_id
   AND au2.active  = true
)
INSERT INTO public.team_roster (
  team_id, roster_date, start_time, end_time,
  employee_name, user_id, role, status, raw_cell, created_by
)
SELECT
  rp.team_id,
  rp.roster_date::date,
  CASE WHEN rp.start_time IS NOT NULL THEN rp.start_time::time END,
  CASE WHEN rp.end_time   IS NOT NULL THEN rp.end_time::time END,
  rp.employee_name,
  rp.user_id,
  rp.role,
  rp.status,
  rp.raw_cell,
  rp.created_by
FROM resolved_primary rp
WHERE rp.team_id IS NOT NULL
  AND rp.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_roster tr
    WHERE tr.team_id       = rp.team_id
      AND tr.roster_date   = rp.roster_date::date
      AND tr.employee_name = rp.employee_name
  )
RETURNING id;
    `;

    // --- UNRESOLVED (für UI) – gleiche Normalisierung + team_id aus app_users ---
    const unresolved = await sql/*sql*/`
WITH src AS (
  SELECT * FROM jsonb_to_recordset(${sqlJson(out)}) AS r(
    roster_date     text,
    start_time      text,
    end_time        text,
    employee_name   text,
    role            text,
    status          text,
    raw_cell        text,
    created_by      uuid,
    cross_midnight  boolean
  )
),
assign_map AS (
  SELECT
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(lower(a.sheetName),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
        '[^a-z0-9\\s]','',
        'g'
      ),
      '\\s+',' ',
      'g'
    ) AS sheet_name_norm,
    NULLIF(a.user_id, '')::uuid AS user_id
  FROM jsonb_to_recordset(${sqlJson(assigns)}) AS a(sheetName text, user_id text)
  WHERE a.user_id IS NOT NULL
),
src_norm AS (
  SELECT
    s.*,
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(lower(s.employee_name),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
        '[^a-z0-9\\s]','',
        'g'
      ),
      '\\s+',' ',
      'g'
    ) AS employee_name_norm
  FROM src s
),
app_users_active AS (
  SELECT
    au.*,
    regexp_replace(
      regexp_replace(
        replace(replace(replace(replace(lower(au.name),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
        '[^a-z0-9\\s]','',
        'g'
      ),
      '\\s+',' ',
      'g'
    ) AS au_name_norm
  FROM public.app_users au
  WHERE au.active = true
),
resolved_user AS (
  SELECT
    sn.*,
    COALESCE(am.user_id, aua.user_id) AS user_id
  FROM src_norm sn
  LEFT JOIN assign_map am
    ON am.sheet_name_norm = sn.employee_name_norm
  LEFT JOIN app_users_active aua
    ON aua.au_name_norm = sn.employee_name_norm
),
resolved_primary AS (
  SELECT
    ru.*,
    au2.team_id
  FROM resolved_user ru
  LEFT JOIN public.app_users au2
    ON au2.user_id = ru.user_id
   AND au2.active  = true
)
SELECT
  employee_name,
  (user_id IS NULL)                         AS reason_no_user,
  (user_id IS NOT NULL AND team_id IS NULL) AS reason_no_primary_team
FROM resolved_primary
WHERE team_id IS NULL OR user_id IS NULL;
    `;

    return json({
      ok: true,
      inserted: Array.isArray(inserted) ? inserted.length : 0,
      unresolved: Array.isArray(unresolved) ? unresolved : []
    });
  } catch (e: any) {
    console.error('[roster/upload]', e);
    if (e?.code === '23503') {
      return json({ ok: false, error: 'foreign_key_violation: ensure active team membership & teams exist' }, 400);
    }
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}
