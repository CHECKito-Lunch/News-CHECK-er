// app/api/events/[id]/comments/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

// URL-Helfer: .../api/events/:id/comments -> number | null
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

// Body robust lesen (JSON/Form)
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

// GET: Kommentare eines Events
export async function GET(req: NextRequest) {
  const eventId = extractId(req.url);
  if (eventId === null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  try {
    const rows = await sql<any[]>`
      select id, event_id, user_id, author_name, content, created_at
        from public.event_comments
       where event_id = ${eventId}
       order by created_at desc
       limit 200
    `;
    return NextResponse.json({ ok: true, items: rows });
  } catch (e: any) {
    console.error('[comments GET]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

// POST: neuen Kommentar anlegen (Login erforderlich)
export async function POST(req: NextRequest) {
  const eventId = extractId(req.url);
  if (eventId === null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const jar = await cookies(); // Next 15: async
  const userId = jar.get('user_id')?.value || null;
  const displayName = jar.get('user_name')?.value || null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await readBody(req);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ ok: false, error: 'content_required' }, { status: 400 });
  }

  try {
    const [row] = await sql<any[]>`
      insert into public.event_comments (event_id, user_id, author_name, content)
      values (${eventId}, ${userId}, ${displayName}, ${content})
      returning id, event_id, user_id, author_name, content, created_at
    `;
    return NextResponse.json({ ok: true, item: row }, { status: 201 });
  } catch (e: any) {
    console.error('[comments POST]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
