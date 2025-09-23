// app/api/admin/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function normalizeIso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(req: NextRequest) {
  const s = supabaseAdmin();

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = s
    .from('posts')
    .select(
      'id,title,slug,status,effective_from,vendor_id,author_id,updated_at,created_at',
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (q) {
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    query = query.or(`title.ilike.${like},slug.ilike.${like}`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Autorennamen auflösen
  const rows = data ?? [];
  const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter((v): v is string => !!v)));
  let nameById = new Map<string, string>();
  if (authorIds.length) {
    const { data: users } = await s.from('app_users').select('user_id,name').in('user_id', authorIds);
    if (users) nameById = new Map(users.map(u => [u.user_id, u.name ?? '']));
  }

  const withAuthor = rows.map(r => ({
    ...r,
    author_name: r.author_id ? (nameById.get(r.author_id) ?? null) : null,
  }));

  return NextResponse.json({ data: withAuthor, total: count ?? 0, page, pageSize });
}

/**
 * POST: neuen Post anlegen
 * Erwartet Body (aus deinem Editor):
 * {
 *   post: {
 *     title, summary, content, slug, vendor_id, status,
 *     pinned_until, effective_from
 *   },
 *   categoryIds?: number[],
 *   badgeIds?: number[],
 *   sources?: { url: string; label: string|null; sort_order: number }[],
 *   images?:  { path: string; title: string|null; sort_order: number }[]
 * }
 */
export async function POST(req: NextRequest) {
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({} as any));
  const post = body?.post ?? {};
  const categoryIds: number[] = Array.isArray(body?.categoryIds) ? body.categoryIds : [];
  const badgeIds: number[] = Array.isArray(body?.badgeIds) ? body.badgeIds : [];
  const sources: Array<{ url: string; label: string | null; sort_order: number }> =
    Array.isArray(body?.sources) ? body.sources : [];
  const images: Array<{ path?: string; title?: string | null; sort_order?: number }> =
    Array.isArray(body?.images) ? body.images : [];

  // 1) posts einfügen
  const { data: postData, error: postErr } = await s
    .from('posts')
    .insert([{
      title: String(post?.title ?? '').trim(),
      slug:  String(post?.slug  ?? '').trim(),
      summary: post?.summary ?? null,
      content: post?.content ?? null,
      vendor_id: post?.vendor_id ?? null,
      status: post?.status ?? 'draft',
      effective_from: normalizeIso(post?.effective_from),
      pinned_until:   normalizeIso(post?.pinned_until),
    }])
    .select('id, slug')
    .single();

  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }

  const postId = postData.id;

  // 2) Kategorien (optional)
  if (categoryIds.length) {
    const rows = categoryIds.map((cid: number) => ({ post_id: postId, category_id: cid }));
    const { error } = await s.from('post_categories').insert(rows);
    if (error) console.error('[admin/posts POST] post_categories insert', error);
  }

  // 3) Badges (optional)
  if (badgeIds.length) {
    const rows = badgeIds.map((bid: number) => ({ post_id: postId, badge_id: bid }));
    const { error } = await s.from('post_badges').insert(rows);
    if (error) console.error('[admin/posts POST] post_badges insert', error);
  }

  // 4) Quellen (optional)
  if (sources.length) {
    const rows = sources
      .filter(sx => typeof sx?.url === 'string' && sx.url.trim())
      .map(sx => ({
        post_id: postId,
        url: sx.url.trim(),
        label: (sx.label ?? null) as string | null,
        sort_order: Number.isFinite(sx.sort_order) ? sx.sort_order : 0,
      }));
    if (rows.length) {
      const { error } = await s.from('post_sources').insert(rows);
      if (error) console.error('[admin/posts POST] post_sources insert', error);
    }
  }

  // 5) Bilder → post_images (path, title, sort_order)
  if (images.length) {
    const rows = images
      .map((im, i) => ({
        post_id: postId,
        path: (im.path ?? '').toString().trim(),             // Pfad im Bucket (z.B. "news/2025/09/foo.jpg")
        title: (im.title ?? null) as string | null,          // optionale Bildunterschrift
        sort_order: Number.isFinite(im.sort_order) ? Number(im.sort_order) : i,
      }))
      .filter(r => !!r.path);

    if (rows.length) {
      const { error } = await s.from('post_images').insert(rows);
      if (error) console.error('[admin/posts POST] post_images insert', error);
    }
  }

  return NextResponse.json({ ok: true, id: postId, slug: postData.slug });
}
