// app/api/news/admin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const s = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const post = body?.post ?? {};
  const categoryIds: number[] = Array.isArray(body?.categoryIds) ? body.categoryIds : [];
  const badgeIds: number[] = Array.isArray(body?.badgeIds) ? body.badgeIds : [];
  const sources: { url: string; label: string | null; sort_order: number | null }[] =
    Array.isArray(body?.sources) ? body.sources : [];
  const images: { path?: string | null; title?: string | null; sort_order?: number | null }[] =
    Array.isArray(body?.images) ? body.images : [];

  // Minimale Validierung
  const title = String(post?.title ?? '').trim();
  const slug  = String(post?.slug  ?? '').trim();
  if (!title || !slug) {
    return NextResponse.json({ ok: false, error: 'title_and_slug_required' }, { status: 400 });
  }

  // Slug-Kollision prüfen
  {
    const { data: existing, error } = await s.from('posts').select('id').eq('slug', slug).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (existing?.id) {
      return NextResponse.json({ ok: false, error: 'slug_exists' }, { status: 409 });
    }
  }

  // Post anlegen
  const insertPost = {
    title,
    slug,
    summary: post?.summary ?? null,
    content: post?.content ?? null, // HTML
    vendor_id: Number.isFinite(Number(post?.vendor_id)) ? Number(post.vendor_id) : null,
    status: ['draft', 'published', 'scheduled'].includes(post?.status) ? post.status : 'published',
    pinned_until: post?.pinned_until ?? null,
    effective_from: post?.effective_from ?? null,
  };

  const { data: created, error: errCreate } = await s
    .from('posts')
    .insert(insertPost)
    .select('id, slug')
    .single();

  if (errCreate || !created) {
    return NextResponse.json({ ok: false, error: errCreate?.message ?? 'create_failed' }, { status: 500 });
  }

  const postId = created.id as number;

  // Kategorien
  if (categoryIds.length) {
    try {
      await s.from('post_categories').insert(
        categoryIds.map((cid) => ({ post_id: postId, category_id: cid }))
      );
    } catch { /* ignore */ }
  }

  // Badges
  if (badgeIds.length) {
    try {
      await s.from('post_badges').insert(
        badgeIds.map((bid) => ({ post_id: postId, badge_id: bid }))
      );
    } catch { /* ignore */ }
  }

  // Quellen
  if (sources.length) {
    try {
      await s.from('post_sources').insert(
        sources
          .filter((sx) => sx?.url)
          .map((sx) => ({
            post_id: postId,
            url: sx.url,
            label: sx.label ?? null,
            sort_order: Number.isFinite(Number(sx.sort_order)) ? Number(sx.sort_order) : null,
          }))
      );
    } catch { /* ignore */ }
  }

  // >>> Bilder in post_images
  const imgs = images
    .map((im, i) => ({
      post_id: postId,
      path: im?.path ?? null,                      // Pfad im Storage
      title: (im?.title ?? null) as string | null, // DB-Spalte "title"
      sort_order: Number.isFinite(Number(im?.sort_order)) ? Number(im!.sort_order) : i,
    }))
    .filter((x) => !!x.path);

  if (imgs.length) {
    try {
      await s.from('post_images').insert(imgs);
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, id: postId, slug: created.slug });
}
