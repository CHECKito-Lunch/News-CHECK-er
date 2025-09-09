// app/api/admin/events/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const slugify = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'event';

export async function GET(req: NextRequest) {
  if (!(await getAdminFromCookies())) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 401 });
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  const like = q ? `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%` : null;

  try {
    // Kein View nötig: Counts inline per LEFT JOIN
    const rows = await sql<{
      id: number;
      slug: string;
      title: string;
      summary: string | null;
      content: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      capacity: number | null;
      status: string;
      hero_image_url: string | null;
      gallery_json: any | null;
      confirmed_count: number;
      waitlist_count: number;
    }[]>`
      select
        e.id, e.slug, e.title, e.summary, e.content, e.location,
        e.starts_at, e.ends_at, e.capacity, e.status,
        e.hero_image_url, e.gallery_json,
        coalesce(c.confirmed_count, 0) as confirmed_count,
        coalesce(c.waitlist_count, 0)  as waitlist_count
      from public.events e
      left join (
        select
          er.event_id,
          count(*) filter (where er.state = 'confirmed')                  as confirmed_count,
          count(*) filter (where er.state not in ('confirmed','cancelled')) as waitlist_count
        from public.event_registrations er
        group by er.event_id
      ) c on c.event_id = e.id
      ${like ? sql`where e.title ilike ${like} or e.summary ilike ${like}` : sql``}
      order by e.starts_at desc
      limit 200
    `;

    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error('[admin/events GET]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await getAdminFromCookies())) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const title = (body?.title ?? '').trim();
  const starts_at = body?.starts_at ? new Date(body.starts_at) : null;

  if (!title) {
    return NextResponse.json({ ok: false, error: 'title_required' }, { status: 400 });
  }
  if (!starts_at || isNaN(starts_at.getTime())) {
    return NextResponse.json({ ok: false, error: 'starts_at_required' }, { status: 400 });
  }

  const ends_at   = body?.ends_at ? new Date(body.ends_at) : null;
  const summary   = body?.summary ?? null;
  const content   = body?.content ?? null;
  const location  = body?.location ?? null;
  const capacity  = Number.isFinite(Number(body?.capacity)) ? Number(body.capacity) : null;
  const status    = (body?.status ?? 'published') as string;
  const hero      = body?.hero_image_url ?? null;
  const gallery   = Array.isArray(body?.gallery) ? body.gallery.filter((u: string) => typeof u === 'string') : [];

  try {
    const base = slugify(title);
    let final = base;

    const existing = await sql<{ slug: string }[]>`
      select slug from public.events where slug like ${base + '%'}
    `;
    const taken = new Set(existing.map(r => r.slug));
    if (taken.has(final)) { let i = 2; while (taken.has(`${base}-${i}`)) i++; final = `${base}-${i}`; }

    const [row] = await sql<{ id: number; slug: string }[]>`
      insert into public.events
        (slug, title, summary, content, location, starts_at, ends_at,
         capacity, status, hero_image_url, gallery_json)
      values
        (${final}, ${title}, ${summary}, ${content}, ${location},
         ${starts_at.toISOString()},
         ${ends_at ? ends_at.toISOString() : null},
         ${capacity}, ${status}, ${hero}, ${sqlJson(gallery)})
      returning id, slug
    `;

    return NextResponse.json({ ok: true, id: row.id, slug: row.slug });
  } catch (e: any) {
    console.error('[admin/events POST]', e);
    const msg = String(e?.message ?? '');
    return NextResponse.json(
      { ok: false, error: msg || 'server_error' },
      { status: /unique|duplicate key/i.test(msg) ? 409 : 500 }
    );
  }
}
