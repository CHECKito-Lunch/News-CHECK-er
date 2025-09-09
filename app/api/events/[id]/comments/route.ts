// app/api/events/[id]/comments/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies as getCookies } from 'next/headers';
import { sql } from '@/lib/db';

const json = (data: any, status = 200) => NextResponse.json(data, { status });

// URL: .../api/events/:id/comments  -> number | null
function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // [..., 'events', ':id', 'comments']
    const idStr = parts[parts.length - 2];
    const id = Number(idStr);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

async function getUserIdFromCookies(): Promise<string | null> {
  try {
    const c = await getCookies();
    const uid = c.get('user_id')?.value || null;
    if (uid) return uid;

    const auth = c.get('auth')?.value;
    if (!auth || !auth.includes('.')) return null;

    try {
      const payloadB64 = auth.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      const sub = typeof payload?.sub === 'string' ? payload.sub : null;
      return sub || null;
    } catch { return null; }
  } catch { return null; }
}

/**
 * GET: Kommentare eines Events (liefert author_name als Alias via JOIN)
 * Response: { ok:true, items:[{ id, message, created_at, user_id, author_name }] }
 */
export async function GET(req: NextRequest) {
  const eid = extractId(req.url);
  if (eid === null) return json({ ok: false, error: 'invalid_id' }, 400);

  try {
    const rows = await sql<{
      id: number;
      event_id: number;
      user_id: string;
      message: string;
      created_at: string;
      author_name: string | null;
    }[]>`
      SELECT
        ec.id,
        ec.event_id,
        ec.user_id,
        ec.message,
        ec.created_at,
        /* Alias, kein Spaltenbedarf in event_comments */
        COALESCE(au.name, au.email, ec.user_id::text) AS author_name
      FROM public.event_comments ec
      LEFT JOIN public.app_users au
        ON au.user_id = ec.user_id
      WHERE ec.event_id = ${eid}
      ORDER BY ec.created_at ASC
      LIMIT 500
    `;
    return json({ ok: true, items: rows });
  } catch (e: any) {
    console.error('[comments GET]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}

/**
 * POST: Kommentar anlegen
 * Body: { message: string }
 * Response: { ok:true, item:{ ... wie oben ... } }
 */
export async function POST(req: NextRequest) {
  const eid = extractId(req.url);
  if (eid === null) return json({ ok: false, error: 'invalid_id' }, 400);

  const userId = await getUserIdFromCookies();
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const message = (body?.message ?? '').toString().trim();
  if (!message) return json({ ok: false, error: 'message_required' }, 400);

  try {
    // Insert OHNE author_name (nicht vorhanden)
    const [ins] = await sql<{ id: number; created_at: string }[]>`
      INSERT INTO public.event_comments (event_id, user_id, message)
      VALUES (${eid}, ${userId}, ${message})
      RETURNING id, created_at
    `;

    // frisch eingefügten Datensatz inkl. author_name-Alias zurückgeben
    const [row] = await sql<{
      id: number;
      event_id: number;
      user_id: string;
      message: string;
      created_at: string;
      author_name: string | null;
    }[]>`
      SELECT
        ec.id,
        ec.event_id,
        ec.user_id,
        ec.message,
        ec.created_at,
        COALESCE(au.name, au.email, ec.user_id::text) AS author_name
      FROM public.event_comments ec
      LEFT JOIN public.app_users au
        ON au.user_id = ec.user_id
      WHERE ec.id = ${ins.id}
      LIMIT 1
    `;

    return json({ ok: true, item: row });
  } catch (e: any) {
    console.error('[comments POST]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}
