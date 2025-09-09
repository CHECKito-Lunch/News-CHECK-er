// app/api/admin/events/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // …/api/admin/events/:id
    const idStr = parts[parts.length - 1];
    const id = Number(idStr);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminFromCookies())) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 401 });
  }

  const id = extractId(req.url);
  if (id === null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  let b: any = {};
  try { b = await req.json(); } catch {}

  const fields = {
    title: b.title ?? null,
    summary: b.summary ?? null,
    content: b.content ?? null,
    location: b.location ?? null,
    starts_at: b.starts_at ? new Date(b.starts_at).toISOString() : null,
    ends_at: b.ends_at ? new Date(b.ends_at).toISOString() : null,
    capacity: Number.isFinite(Number(b.capacity)) ? Number(b.capacity) : null,
    status: b.status ?? null,
    hero_image_url: b.hero_image_url ?? null,
    gallery_json: Array.isArray(b.gallery) ? sqlJson(b.gallery) : null,
  };

  try {
    await sql`
      update public.events set
        title          = coalesce(${fields.title}::text, title),
        summary        = coalesce(${fields.summary}::text, summary),
        content        = coalesce(${fields.content}::text, content),
        location       = coalesce(${fields.location}::text, location),
        starts_at      = coalesce(${fields.starts_at}::timestamptz, starts_at),
        ends_at        = coalesce(${fields.ends_at}::timestamptz, ends_at),
        capacity       = coalesce(${fields.capacity}::int, capacity),
        status         = coalesce(${fields.status}::text, status),
        hero_image_url = coalesce(${fields.hero_image_url}::text, hero_image_url),
        gallery_json   = coalesce(${fields.gallery_json}::jsonb, gallery_json)
      where id = ${id}
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[admin/events PATCH]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminFromCookies())) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 401 });
  }

  const id = extractId(req.url);
  if (id === null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  try {
    await sql`delete from public.events where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[admin/events DELETE]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
