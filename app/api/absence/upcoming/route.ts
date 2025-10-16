/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth'; // wie bei deinen anderen /teamhub Endpoints

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/**
 * Hilfsfunktion: DateOnly (YYYY-MM-DD) für Europe/Berlin
 */
function dateOnlyBerlin(d = new Date()) {
  const z = new Date(
    d.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })
  );
  return z.toISOString().slice(0, 10);
}
function addDaysDateOnlyBerlin(yyyy_mm_dd: string, days: number) {
  const dt = new Date(yyyy_mm_dd + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Abbildung auf absence.io Benutzer:
 * - bevorzugt Tabelle public.absence_users(user_id uuid, external_id text)
 * - Fallback: E-Mail aus app_users (falls ihr bei absence.io via E-Mail mappt)
 */
async function resolveExternalIds(userIds: string[]) {
  // erst versuchen, aus absence_users zu lesen
  try {
    const rows = await sql<Array<{ user_id: string; external_id: string }>>/*sql*/`
      select user_id::text, external_id
      from public.absence_users
      where user_id = any(${userIds}::uuid[])
    `;
    const map = new Map(rows.map((r: { user_id: any; external_id: any; }) => [r.user_id, r.external_id]));
    // Prüfen, ob alle gemappt sind, fehlende ggf. via E-Mail ergänzen:
    const missing = userIds.filter(id => !map.has(id));
    if (missing.length > 0) {
      const fallback = await sql<Array<{ user_id: string; email: string }>>/*sql*/`
        select user_id::text, email
        from public.app_users
        where user_id = any(${missing}::uuid[])
      `;
      for (const r of fallback) {
        if (r.email) map.set(r.user_id, r.email); // Fallback auf E-Mail
      }
    }
    return map; // Map<user_id, external_id_or_email>
  } catch {
    // Tabelle existiert evtl. (noch) nicht → Fallback nur via E-Mail
    const fallback = await sql<Array<{ user_id: string; email: string }>>/*sql*/`
      select user_id::text, email
      from public.app_users
      where user_id = any(${userIds}::uuid[])
    `;
    return new Map(fallback.map((r: { user_id: any; email: any; }) => [r.user_id, r.email]));
  }
}

/**
 * absence.io API call (als Proxy). Passe die URL und Header nach euren Absence-Dokus an.
 * Viele APIs nutzen Bearer oder X-API-Key – hier sind beide Varianten vorbereitet.
 */
async function fetchAbsencesForUsers(
  externalIds: Array<{ userId: string; externalId: string }>,
  fromDate: string,
  toDate: string
) {
  const BASE = process.env.ABSENCE_BASE_URL || 'https://api.absence.io'; // ggf. anpassen
  const KEY  = process.env.ABSENCE_API_KEY;
  if (!KEY) {
    return { ok: false, error: 'ABSENCE_API_KEY missing (env)' as const };
  }

  // ❗ PASSE DIESE STELLE AUF EUREN KONKRETEN ENDPOINT AN:
  // Beispiel-Strategie: pro externalId (User) die Abwesenheiten im Zeitfenster laden.
  // Dummy-URL und Header – unbedingt mit euren echten Docs abgleichen!
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Variante A:
    'Authorization': `Bearer ${KEY}`,
    // Variante B (wenn gefordert):
    // 'X-API-Key': KEY,
  };

  const items: any[] = [];
  for (const row of externalIds) {
    const ext = encodeURIComponent(row.externalId);
    const url = `${BASE}/v1/absences?user=${ext}&from=${fromDate}&to=${toDate}`;

    const r = await fetch(url, { headers, cache: 'no-store' });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: `absence_api_unauthorized (status ${r.status})` as const };
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, error: `absence_api_error_${r.status}: ${txt}` as const };
    }
    const j = await r.json().catch(() => null);
    // Erwartete Normalisierung. Passe das an die echte response an!
    // Ziel-Shape fürs Frontend:
    // { id, start, end, user: {firstName,lastName,email}, type:{name}, status }
    const normalized = Array.isArray(j?.data) ? j.data.map((a: any) => ({
      id: String(a.id ?? `${row.userId}-${a.start}-${a.end}`),
      start: a.start ?? a.startDate ?? a.from ?? null,
      end:   a.end   ?? a.endDate   ?? a.to   ?? null,
      user: {
        firstName: a.user?.firstName ?? a.userFirstName ?? null,
        lastName:  a.user?.lastName  ?? a.userLastName  ?? null,
        email:     a.user?.email     ?? a.userEmail     ?? null,
      },
      type: { name: a.type?.name ?? a.typeName ?? a.type ?? 'Abwesenheit' },
      status: a.status ?? a.state ?? null,
    })) : [];

    // wenn die API Benutzerinfos nicht mitsendet, hier minimal füllen:
    for (const it of normalized) {
      it.user = it.user || {};
      it.user.email = it.user.email || row.externalId;
    }

    items.push(...normalized);
  }

  // nach Startdatum sortieren
  items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { ok: true as const, items };
}

export async function GET(req: NextRequest) {
  try {
    // Auth: analog zu deinen Teamhub-APIs
    const me = await getUserFromCookies().catch(() => null);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);
    // Falls du das auf Teamleiter/Admin begrenzen willst, hier einkommentieren:
    // if (me.role !== 'teamleiter' && me.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403);

    const { searchParams } = new URL(req.url);
    const ids = searchParams.getAll('member_user_id');

    if (!ids || ids.length === 0) {
      return json({ ok: false, error: 'missing_member_user_id' }, 400);
    }
    const bad = ids.filter(id => !isUUID(id));
    if (bad.length > 0) {
      return json({ ok: false, error: 'invalid_uuid', details: bad }, 400);
    }

    // Datumsfenster: heute … +7 Tage
    const fromDate = dateOnlyBerlin();
    const toDate   = addDaysDateOnlyBerlin(fromDate, 7);

    // User-ID → externalId (absence.io) auflösen
    const map = await resolveExternalIds([...new Set(ids)]);
    const pairs = [...map.entries()]
      .filter(([, ext]) => !!ext)
      .map(([userId, externalId]) => ({ userId: String(userId), externalId: String(externalId) }));

    if (pairs.length === 0) {
      return json({ ok: true, items: [] });
    }

    const abs = await fetchAbsencesForUsers(pairs, fromDate, toDate);
    if (!abs.ok) {
      // Wichtig: sprechende Fehlermeldung zurückgeben → im Frontend anzeigen
      return json({ ok: false, error: abs.error }, 502);
    }

    return json({ ok: true, items: abs.items });
  } catch (e: any) {
    console.error('[absence/upcoming GET]', e?.message || e);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
}
