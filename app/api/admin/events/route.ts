// app/api/admin/events/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

function normalizeIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /Z$|[+-]\d{2}:\d{2}$/.test(v)) return v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'event';

// ---- robuste Body-Parser-Helfer ----
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

// ✅ KEIN zweites Argument hier
export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookies(req);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();

  try {
    const rows = await sql<any[]>`
      select id, slug, title, summary, content, location, starts_at, ends_at,
             capacity, status, hero_image_url, gallery_json,
             confirmed_count, waitlist_count
        from public.events_with_counts
       ${q ? sql`where title ilike ${'%' + q + '%'} or summary ilike ${'%' + q + '%'}` : sql``}
       order by starts_at desc
       limit 200
    `;
    return NextResponse.json({ ok:true, data: rows });
  } catch (e: any) {
    console.error('[admin/events GET]', e);
    return NextResponse.json({ ok:false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  const body: any = await readBody(req);

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const startsIso = normalizeIso(body?.starts_at ?? body?.startsAt);
  const endsIso   = normalizeIso(body?.ends_at   ?? body?.endsAt);

  if (!title)     return NextResponse.json({ ok:false, error:'title_required' }, { status: 400 });
  if (!startsIso) return NextResponse.json({ ok:false, error:'starts_at_required' }, { status: 400 });

  const summary  = typeof body?.summary  === 'string' ? body.summary  : null;
  const content  = typeof body?.content  === 'string' ? body.content  : null;
  const location = typeof body?.location === 'string' ? body.location : null;

  const capacity =
    body?.capacity === '' || body?.capacity == null
      ? null
      : Number.isFinite(Number(body.capacity))
        ? Math.max(0, Math.trunc(Number(body.capacity)))
        : null;

  const statusRaw = (body?.status ?? 'published') as string;
  const status = ['draft','published','cancelled'].includes(statusRaw) ? statusRaw : 'published';

  const hero = typeof body?.hero_image_url === 'string' ? body.hero_image_url : null;

  let gallery: string[] = [];
  if (Array.isArray(body?.gallery)) {
    gallery = body.gallery.filter((u: string) => typeof u === 'string');
  } else if (typeof body?.gallery_json === 'string') {
    try {
      const j = JSON.parse(body.gallery_json);
      if (Array.isArray(j)) gallery = j.filter((u: any) => typeof u === 'string');
    } catch {}
  }

  try {
    const base = slugify(title);
    let final = base;

    type Existing = { slug: string };
    const existing = await sql<Existing[]>`
      select slug from public.events where slug like ${base + '%'}
    `;
    const taken = new Set(existing.map((r: Existing) => r.slug));
    if (taken.has(final)) { let i = 2; while (taken.has(`${base}-${i}`)) i++; final = `${base}-${i}`; }

    const [row] = await sql<any[]>`
      insert into public.events
        (slug, title, summary, content, location, starts_at, ends_at,
         capacity, status, hero_image_url, gallery_json)
      values
        (${final}, ${title}, ${summary}, ${content}, ${location},
         ${startsIso}, ${endsIso},
         ${capacity}, ${status}, ${hero}, ${sqlJson(gallery)})
      returning id, slug
    `;

    return NextResponse.json({ ok:true, id: row.id, slug: row.slug });
  } catch (e: any) {
    console.error('[admin/events POST]', e);
    const msg = String(e?.message ?? '');
    return NextResponse.json(
      { ok:false, error: msg || 'server_error' },
      { status: /unique|duplicate key/i.test(msg) ? 409 : 500 }
    );
  }
}
