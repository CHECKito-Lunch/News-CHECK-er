export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

function sluggify(t: string) {
  return t.toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
    .slice(0, 140);
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.code === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.code });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    const rows = await sql<any[]>`
      select * from public.events_with_counts
      ${q ? sql`where title ilike ${'%' + q + '%'} or summary ilike ${'%' + q + '%'}` : sql``}
      order by starts_at desc
      limit 400
    `;
    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.code === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.code });

    const b = await req.json().catch(() => ({}));
    const title: string = b?.title ?? '';
    if (!title.trim()) return NextResponse.json({ ok: false, error: 'title_required' }, { status: 400 });

    const slug = b?.slug?.trim() || sluggify(title);
    const galleryJson: string | null =
      Array.isArray(b?.gallery) ? JSON.stringify(b.gallery) :
      (typeof b?.gallery_json === 'string' ? b.gallery_json : null);
    const cap = Number.isFinite(+b?.capacity) ? +b.capacity : null;

    const [row] = await sql<any[]>`
      insert into public.events
        (title, slug, summary, content, location, starts_at, ends_at,
         capacity, status, hero_image_url, gallery_json)
      values (
        ${title}, ${slug},
        ${b?.summary ?? null}, ${b?.content ?? null},
        ${b?.location ?? null},
        ${b?.starts_at ?? null}, ${b?.ends_at ?? null},
        ${cap},
        ${b?.status ?? 'published'},
        ${b?.hero_image_url ?? null},
        ${galleryJson}
      )
      returning id, slug
    `;
    return NextResponse.json({ ok: true, data: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
