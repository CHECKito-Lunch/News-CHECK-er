// app/api/admin/events/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
   .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
   .slice(0, 80) || 'event';

// ---- robuste Body-Parser-Helfer ----
async function readBody(req: NextRequest): Promise<any> {
  const ct = req.headers.get('content-type') || '';
  // 1) JSON als Text lesen (einmaliger Stream) und parsen
  if (ct.includes('application/json')) {
    const raw = await req.text().catch(() => '');
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  // 2) Form-Varianten
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData().catch(() => null);
    if (!form) return {};
    const obj: Record<string, any> = {};
    for (const [k, v] of form.entries()) obj[k] = typeof v === 'string' ? v : v.name;
    return obj;
  }
  // 3) Fallback: Text -> JSON versuchen
  const raw = await req.text().catch(() => '');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookies();
  if (!admin) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 401 });

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
  } catch (e:any) {
    console.error('[admin/events GET]', e);
    return NextResponse.json({ ok:false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies();
  if (!admin) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 401 });

  // ⬇️ Body robust lesen
  const body: any = await readBody(req);

  // Felder normalisieren
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  // erlaubt auch startsAt oder starts_at
  const startsAtRaw = body?.starts_at ?? body?.startsAt ?? null;
  const endsAtRaw   = body?.ends_at   ?? body?.endsAt   ?? null;

  if (!title) {
    return NextResponse.json({ ok:false, error:'title_required' }, { status: 400 });
  }

  const starts_at = startsAtRaw ? new Date(startsAtRaw) : null;
  if (!starts_at || isNaN(starts_at.getTime())) {
    return NextResponse.json({ ok:false, error:'starts_at_required' }, { status: 400 });
  }

  const ends_at   = endsAtRaw ? new Date(endsAtRaw) : null;
  const summary   = typeof body?.summary  === 'string' ? body.summary  : null;
  const content   = typeof body?.content  === 'string' ? body.content  : null; // Markdown erlaubt
  const location  = typeof body?.location === 'string' ? body.location : null;
  const capacity  = Number.isFinite(Number(body?.capacity)) ? Number(body.capacity) : null;
  const status    = (body?.status ?? 'published') as string;
  const hero      = typeof body?.hero_image_url === 'string' ? body.hero_image_url : null;
  const gallery   = Array.isArray(body?.gallery) ? body.gallery.filter((u:string)=> typeof u === 'string') : [];

  try {
    const base = slugify(title);
    let final = base;

    const existing = await sql<{slug:string}[]>`
      select slug from public.events where slug like ${base + '%'}
    `;
    const taken = new Set(existing.map(r => r.slug));
    if (taken.has(final)) { let i = 2; while (taken.has(`${base}-${i}`)) i++; final = `${base}-${i}`; }

    const [row] = await sql<any[]>`
      insert into public.events
        (slug, title, summary, content, location, starts_at, ends_at,
         capacity, status, hero_image_url, gallery_json)
      values
        (${final}, ${title}, ${summary}, ${content}, ${location},
         ${starts_at.toISOString()}, ${ends_at ? ends_at.toISOString() : null},
         ${capacity}, ${status}, ${hero}, ${sqlJson(gallery)})
      returning id, slug
    `;

    return NextResponse.json({ ok:true, id: row.id, slug: row.slug });
  } catch (e:any) {
    console.error('[admin/events POST]', e);
    const msg = String(e?.message ?? '');
    return NextResponse.json(
      { ok:false, error: msg || 'server_error' },
      { status: /unique|duplicate key/i.test(msg) ? 409 : 500 }
    );
  }
}
