// app/api/news/admin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type ImagePayload = { path: string; title: string | null; sort_order: number | null };

function safeDate(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function POST(req: NextRequest) {
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({} as any));

  const post = body?.post ?? {};
  const images: ImagePayload[] = Array.isArray(body?.images) ? body.images : [];

  // Status/Effektives Datum normalisieren
  const insertPost = {
    title:        String(post.title ?? '').trim(),
    slug:         String(post.slug ?? '').trim(),
    summary:      post.summary ?? null,
    content:      post.content ?? null,          // HTML
    vendor_id:    post.vendor_id ?? null,        // muss in vendors existieren oder null
    status:       (post.status ?? 'published') as 'draft'|'scheduled'|'published',
    pinned_until: safeDate(post.pinned_until),
    effective_from: safeDate(post.effective_from),
  };

  if (!insertPost.title || !insertPost.slug) {
    return NextResponse.json({ ok:false, error:'title_or_slug_missing' }, { status: 400 });
  }

  const { data: created, error: errPost } = await s
    .from('posts')
    .insert(insertPost)
    .select('id, slug')
    .single();

  if (errPost || !created) {
    return NextResponse.json({ ok:false, error: errPost?.message ?? 'insert_failed' }, { status: 500 });
  }

  // --------- Galerie speichern ---------
  if (images.length) {
    const rows = images
      .filter(im => typeof im?.path === 'string' && im.path.trim() !== '')
      .map((im, i) => ({
        post_id:   created.id,
        path:      im.path.trim(),
        title:     (im.title ?? null),
        sort_order: Number.isFinite(im.sort_order as number) ? im.sort_order : i,
      }));

    if (rows.length) {
      const { error: errImgs } = await s.from('post_images').insert(rows);
      if (errImgs) {
        // nicht hart abbrechen – aber melden
        console.error('[post_images insert]', errImgs.message);
      }
    }
  }

  return NextResponse.json({ ok:true, id: created.id, slug: created.slug });
}

export async function PATCH(req: NextRequest) {
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({} as any));

  const id = Number(req.nextUrl.pathname.split('/').pop()); // /api/news/admin/:id (oder passe an deine Route an)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok:false, error:'invalid_id' }, { status: 400 });
  }

  const post = body?.post ?? {};
  const images: ImagePayload[] = Array.isArray(body?.images) ? body.images : [];

  const updatePost = {
    title:          post.title ?? undefined,
    slug:           post.slug ?? undefined,
    summary:        post.summary ?? undefined,
    content:        post.content ?? undefined,
    vendor_id:      post.vendor_id ?? undefined,
    status:         post.status ?? undefined,
    pinned_until:   safeDate(post.pinned_until) ?? undefined,
    effective_from: safeDate(post.effective_from) ?? undefined,
  };

  const { error: errUpd } = await s.from('posts').update(updatePost).eq('id', id);
  if (errUpd) {
    return NextResponse.json({ ok:false, error: errUpd.message }, { status: 500 });
  }

  // --------- Galerie neu setzen: löschen & neu einfügen ---------
  // (alternativ: diff/UPSERT – hier simplest reliable)
  const { error: errDel } = await s.from('post_images').delete().eq('post_id', id);
  if (errDel) console.error('[post_images delete]', errDel.message);

  if (images.length) {
    const rows = images
      .filter(im => typeof im?.path === 'string' && im.path.trim() !== '')
      .map((im, i) => ({
        post_id:   id,
        path:      im.path.trim(),
        title:     (im.title ?? null),
        sort_order: Number.isFinite(im.sort_order as number) ? im.sort_order : i,
      }));

    if (rows.length) {
      const { error: errIns } = await s.from('post_images').insert(rows);
      if (errIns) console.error('[post_images insert]', errIns.message);
    }
  }

  return NextResponse.json({ ok:true, id });
}
