export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.code === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.code });

    const id = Number(ctx?.params?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });

    const b = await req.json().catch(() => ({}));
    const galleryJson: string | null =
      Array.isArray(b?.gallery) ? JSON.stringify(b.gallery) :
      (typeof b?.gallery_json === 'string' ? b.gallery_json : null);
    const cap = Number.isFinite(+b?.capacity) ? +b.capacity : null;

    await sql`
      update public.events
      set title          = coalesce(${b?.title}, title),
          slug           = coalesce(${b?.slug}, slug),
          summary        = ${b?.summary ?? null},
          content        = ${b?.content ?? null},
          location       = ${b?.location ?? null},
          starts_at      = ${b?.starts_at ?? null},
          ends_at        = ${b?.ends_at ?? null},
          capacity       = ${cap},
          status         = coalesce(${b?.status}, status),
          hero_image_url = ${b?.hero_image_url ?? null},
          gallery_json   = ${galleryJson}
      where id = ${id}
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.code === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.code });

    const id = Number(ctx?.params?.id);
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });

    await sql`delete from public.events where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
