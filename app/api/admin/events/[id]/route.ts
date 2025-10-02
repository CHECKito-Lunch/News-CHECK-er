// app/api/admin/events/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

function normalizeIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /Z$|[+-]\d{2}:\d{2}$/.test(v)) return v; // already tz-aware
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const idStr = parts[parts.length - 1];
    const id = Number(idStr);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

// Body robust lesen (JSON, Form, Fallback)
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

export async function PATCH(req: NextRequest) {
  if (!(await getAdminFromCookies(req))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 401 });
  }

  const id = extractId(req.url);
  if (id === null) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const b: any = await readBody(req);

  // Eingaben normalisieren; null = Feld unverändert (via COALESCE)
  const fields = {
    title: typeof b.title === 'string' ? b.title : null,
    summary: typeof b.summary === 'string' ? b.summary : null,
    content: typeof b.content === 'string' ? b.content : null,
    location: typeof b.location === 'string' ? b.location : null,

    // akzeptiert starts_at/startsAt, ends_at/endsAt; lokale Zeiten → ISO/UTC
    starts_at: normalizeIso(b?.starts_at ?? b?.startsAt),
    ends_at: normalizeIso(b?.ends_at ?? b?.endsAt),

    // int >= 0 oder null
    capacity:
      b?.capacity === '' || b?.capacity == null
        ? null
        : Number.isFinite(Number(b.capacity))
          ? Math.max(0, Math.trunc(Number(b.capacity)))
          : null,

    // nur erlaubte Status; sonst Feld unverändert lassen
    status: ['draft', 'published', 'cancelled'].includes(b?.status) ? b.status : null,

    hero_image_url: typeof b.hero_image_url === 'string' ? b.hero_image_url : null,

    // Galerie: Array<string> ODER JSON-String in gallery_json
    gallery_json: (() => {
      if (Array.isArray(b?.gallery)) {
        return sqlJson(b.gallery.filter((u: any) => typeof u === 'string'));
      }
      if (typeof b?.gallery_json === 'string') {
        try {
          const arr = JSON.parse(b.gallery_json);
          if (Array.isArray(arr)) {
            return sqlJson(arr.filter((u: any) => typeof u === 'string'));
          }
        } catch { /* ignore */ }
      }
      return null;
    })(),
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
  if (!(await getAdminFromCookies(req))) {
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
