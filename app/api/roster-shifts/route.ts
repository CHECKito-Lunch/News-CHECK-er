import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import fs from 'node:fs';

// Minimal PG Pool (DATABASE_URL aus Env) – mit SSL-Handling für self-signed CAs
function buildPgSsl(): false | { rejectUnauthorized: boolean; ca?: string } | undefined {
  // 1) Bevorzugt: echte CA über ENV
  //    - PGSSLROOTCERT kann entweder der komplette PEM-String ODER ein Pfad zur Datei sein
  const caEnv = process.env.PGSSLROOTCERT || process.env.PG_CA || '';
  if (caEnv) {
    const ca = caEnv.includes('-----BEGIN CERTIFICATE-----')
      ? caEnv
      : fs.existsSync(caEnv) ? fs.readFileSync(caEnv, 'utf8') : caEnv; // falls Pfad
    return { rejectUnauthorized: true, ca };
  }

  // 2) Wenn sslmode=require|prefer|allow|no-verify gesetzt ist oder in der URL steckt,
  //    aber keine CA vorhanden ist → auf no-verify gehen, um SELF_SIGNED_CERT_IN_CHAIN zu vermeiden
  const sslmode = (process.env.PGSSLMODE || '').toLowerCase();
  const url = process.env.DATABASE_URL || '';
  const urlHasSsl = /sslmode=(require|prefer|allow|no-verify)/i.test(url);
  if (urlHasSsl || ['require', 'prefer', 'allow', 'no-verify'].includes(sslmode)) {
    return { rejectUnauthorized: false };
  }

  // 3) Standard: pg entscheidet (kein SSL erzwungen)
  return undefined;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildPgSsl(),
});

// YYYY-MM-DD für eine gegebene TZ (Standard: Europe/Berlin)
function ymdInTz(date = new Date(), tz = 'Europe/Berlin') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * GET /api/roster-shifts
 * Params:
 *  - day: YYYY-MM-DD (Default: heute in Europe/Berlin)
 *  - earlyStart: Minuten ab 00:00 für Beginn Früh (Default 300 = 05:00)
 *  - middleStart: Minuten ab 00:00 für Beginn Mittel (Default 660 = 11:00)
 *  - lateStart: Minuten ab 00:00 für Beginn Spät (Default 1020 = 17:00)
 *  - team_id: optional; wenn angegeben, wird auf Team gefiltert. Weglassen = alle Teams
 *
 * Antwort:
 * {
 *   day: 'YYYY-MM-DD',
 *   thresholds: { earlyStart, middleStart, lateStart },
 *   buckets: {
 *     early:  { count: number, names: string[] },
 *     middle: { count: number, names: string[] },
 *     late:   { count: number, names: string[] },
 *     absent: { count: number, names: string[] },
 *   }
 * }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const day = (searchParams.get('day') || ymdInTz()).slice(0, 10);
  const teamIdRaw = searchParams.get('team_id');
  const teamId = teamIdRaw ? Number(teamIdRaw) : null;

  // Schichtgrenzen (Minuten ab 00:00)
  const earlyStart = Number(searchParams.get('earlyStart') ?? '300');   // 05:00
  const middleStart = Number(searchParams.get('middleStart') ?? '660'); // 11:00
  const lateStart = Number(searchParams.get('lateStart') ?? '1020');    // 17:00

  if (!Number.isFinite(earlyStart) || !Number.isFinite(middleStart) || !Number.isFinite(lateStart)) {
    return NextResponse.json({ error: 'Bad thresholds' }, { status: 400 });
  }

  // Guard: Plausibilität (nicht blocken, nur tauschen falls unsinnig)
  const a = Math.max(0, Math.floor(earlyStart));
  const b = Math.max(a, Math.floor(middleStart));
  const c = Math.max(b, Math.floor(lateStart));

  // SQL: pro Person (user_id bevorzugt; sonst employee_name) bestimmen wir
  //  - früheste start_time (in Minuten)
  //  - present = es existiert mind. eine Zeile mit start_time UND end_time und end_time > start_time
  // Anschließend klassifizieren wir die Schicht nach frühester Startzeit.
  const sql = `
    with base as (
      select
        coalesce(user_id::text, employee_name) as person_key,
        coalesce(nullif(employee_name, ''), '—') as employee_name,
        start_time,
        end_time,
        status
      from public.team_roster
      where roster_date = $1
        and ($2::bigint is null or team_id = $2)
    ), per_person as (
      select
        person_key,
        min((extract(epoch from start_time)::int) / 60) filter (where start_time is not null) as start_min,
        bool_or(start_time is not null and end_time is not null and end_time > start_time) as present,
        min(employee_name) as employee_name
      from base
      group by person_key
    ), classified as (
      select
        person_key,
        employee_name,
        present,
        case
          when not present then 'absent'
          when start_min is null then 'absent'
          when start_min <  $3 then 'early'
          when start_min <  $4 then 'middle'
          when start_min >= $4 and start_min < $5 then 'late'
          else 'late'
        end as bucket
      from per_person
    )
    select jsonb_build_object(
      'day', $1,
      'thresholds', jsonb_build_object('earlyStart', $3, 'middleStart', $4, 'lateStart', $5),
      'buckets', jsonb_build_object(
        'early',  jsonb_build_object('count', count(*) filter (where bucket = 'early'),  'names', jsonb_agg(employee_name) filter (where bucket = 'early')),
        'middle', jsonb_build_object('count', count(*) filter (where bucket = 'middle'), 'names', jsonb_agg(employee_name) filter (where bucket = 'middle')),
        'late',   jsonb_build_object('count', count(*) filter (where bucket = 'late'),   'names', jsonb_agg(employee_name) filter (where bucket = 'late')),
        'absent', jsonb_build_object('count', count(*) filter (where bucket = 'absent'), 'names', jsonb_agg(employee_name) filter (where bucket = 'absent'))
      )
    ) as result
    from classified;
  `;

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(sql, [day, teamId, a, b, c]);
      const payload = rows?.[0]?.result ?? {
        day,
        thresholds: { earlyStart: a, middleStart: b, lateStart: c },
        buckets: { early: { count: 0, names: [] }, middle: { count: 0, names: [] }, late: { count: 0, names: [] }, absent: { count: 0, names: [] } },
      };
      return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error('roster-shifts error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Optional: HEAD für leichte Healthchecks
export async function HEAD(req: Request) {
  return new NextResponse(null, { status: 204 });
}
