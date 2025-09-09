// app/api/events/[id]/comments/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies as getCookies } from 'next/headers';
import { sql } from '@/lib/db';

const json = (data: any, status = 200) => NextResponse.json(data, { status });

// URL: …/api/events/:id/comments  -> number | null
function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // [..., 'events', ':id', 'comments']
    const idStr = parts[parts.length - 2];
    const n = Number(idStr);
    return Number.isFinite(n) ? n : null;
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

// Body robust lesen (JSON, form-data, urlencoded, Text→JSON)
async function readBody(req: NextRequest): Promise<any> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const raw = await req.text().catch(() => '');
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData().catch(() => null);
    if (!form) return {};
    const obj: Record<string, any> = {};
    for (const [k, v] of form.entries()) obj[k] = typeof v === 'string' ? v : v.name;
    return obj;
  }
  const raw = await req.text().catch(() => '');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/** GET: Kommentare eines Events */
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
        ec.content AS message,                          -- Alias auf content
        ec.created_at,
        COALESCE(ec.user_name, au.name, au.email, ec.user_id::text) AS author_name
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

/** POST: Kommentar anlegen */
export async function POST(req: NextRequest) {
  const eid = extractId(req.url);
  if (eid === null) return json({ ok: false, error: 'invalid_id' }, 400);

  const userId = await getUserIdFromCookies();
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await readBody(req);
  const message = ((body?.message ?? body?.text ?? body?.content) ?? '').toString().trim();
  if (!message) return json({ ok: false, error: 'message_required' }, 400);

  // Optionaler Anzeigename aus Cookie (nicht sicherheitskritisch, nur Komfort)
  const c = await getCookies().catch(() => null);
  const userName = c?.get('user_name')?.value ?? null;

  try {
    // In aktuelles Schema schreiben: content + optional user_name
    const [ins] = await sql<{ id: number; created_at: string }[]>`
      INSERT INTO public.event_comments (event_id, user_id, content, user_name)
      VALUES (${eid}, ${userId}, ${message}, ${userName})
      RETURNING id, created_at
    `;

    // frisch eingefügten Datensatz inkl. Aliase laden
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
        ec.content AS message,
        ec.created_at,
        COALESCE(ec.user_name, au.name, au.email, ec.user_id::text) AS author_name
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
