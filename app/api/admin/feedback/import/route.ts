// app/api/admin/feedback/import/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (d:any, s=200) => new Response(JSON.stringify(d), {
  status: s,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObj(v: unknown): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toBool(v: any): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['ja','yes','true','wahr','1','y','j'].includes(s)) return true;
    if (['nein','no','false','falsch','0','n'].includes(s)) return false;
  }
  return null;
}
function toDateString(v: any): string | null {
  // akzeptiert ISO, 'YYYY-MM-DD', oder TS/Datum; gibt 'YYYY-MM-DD' zurück
  if (!v) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    // häufigster Fall: bereits Datum
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    return null;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req).catch(() => null);
  if (!me) return json({ ok:false, error:'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok:false, error:'invalid_json' }, 400);
  }

  const user_id_raw = String(body?.user_id ?? '').trim();
  if (!user_id_raw) return json({ ok:false, error:'user_id_required' }, 400);

  // user_id (bigint oder uuid) -> user_uuid (uuid)
  let user_uuid: string | null = null;
  if (UUID_RE.test(user_id_raw)) {
    user_uuid = user_id_raw;
  } else {
    const asNum = Number(user_id_raw);
    if (!Number.isFinite(asNum)) return json({ ok:false, error:'invalid_user_id' }, 400);
    const rows = await sql<{ user_id: string | null }[]>`
      select user_id from public.app_users where id = ${asNum} limit 1
    `;
    user_uuid = rows[0]?.user_id ?? null;
  }
  if (!user_uuid) return json({ ok:false, error:'user_uuid_not_found' }, 404);

  // rows -> garantiertes Array von Objekten im erwarteten Schema
  const input = body?.rows;
  const arr: any[] = Array.isArray(input) ? input : (input ? [input] : []);
  if (arr.length === 0) return json({ ok:true, inserted: 0 });

  const normalized = arr
    .filter(isObj)
    .map((r) => {
      // Mappings (de/alt -> intern)
      const feedback_at = toDateString(
        r.feedback_at ?? r.ts ?? r.date ?? r.Datum
      );
      const channel = (r.channel ?? r.feedbacktyp ?? r.Channel ?? '').toString().trim() || null;
      const rating_overall = toInt(r.rating_overall ?? r.bewertung ?? r['Ø']);
      const rating_friend  = toInt(r.rating_friend  ?? r.beraterfreundlichkeit ?? r.F);
      const rating_qual    = toInt(r.rating_qual    ?? r.beraterqualifikation  ?? r.Q);
      const rating_offer   = toInt(r.rating_offer   ?? r.angebotsattraktivitaet ?? r.A);
      const comment_raw    = (r.comment_raw ?? r.kommentar ?? r.Kommentar ?? '').toString().trim() || null;
      const template_name  = (r.template_name ?? r['Template Name'] ?? r.template ?? '').toString().trim() || null;
      const reklamation    = toBool(r.reklamation ?? r.rekla);
      const resolved       = toBool(r.resolved ?? r.geklaert ?? r['Anliegen geklärt?']);
      const note           = (r.note ?? r['Interner Kommentar'] ?? '').toString().trim() || null;

      return {
        feedback_at,
        channel,
        rating_overall,
        rating_friend,
        rating_qual,
        rating_offer,
        comment_raw,
        template_name,
        reklamation,
        resolved,
        note,
      };
    })
    // mindestens irgendein Feld sinnvoll?
    .filter(o =>
      o.feedback_at || o.channel || o.rating_overall || o.rating_friend ||
      o.rating_qual || o.rating_offer || o.comment_raw || o.template_name || o.note
    );

  if (normalized.length === 0) {
    return json({ ok:true, inserted: 0, skipped: arr.length });
  }

  // Jetzt ist garantiert: normalized ist ein Array von Objekten
  const payload = JSON.stringify(normalized);

  const result = await sql<{ inserted: number }[]>`
    with src as (
      select * from jsonb_to_recordset(${payload}::jsonb) as r(
        feedback_at       text,
        channel           text,
        rating_overall    int,
        rating_friend     int,
        rating_qual       int,
        rating_offer      int,
        comment_raw       text,
        template_name     text,
        reklamation       boolean,
        resolved          boolean,
        note              text
      )
    )
    insert into public.user_feedback (
      user_id,
      feedback_at,
      channel,
      rating_overall,
      rating_friend,
      rating_qual,
      rating_offer,
      comment_raw,
      template_name,
      reklamation,
      resolved,
      note
    )
    select
      ${user_uuid}::uuid,
      nullif(r.feedback_at,'')::date,
      nullif(r.channel,''),
      nullif(r.rating_overall,0),
      nullif(r.rating_friend,0),
      nullif(r.rating_qual,0),
      nullif(r.rating_offer,0),
      nullif(r.comment_raw,''),
      nullif(r.template_name,''),
      coalesce(r.reklamation,false),
      coalesce(r.resolved,false),
      nullif(r.note,'')
    from src r
    returning 1 as inserted
  `;

  return json({ ok:true, inserted: result.length });
}
