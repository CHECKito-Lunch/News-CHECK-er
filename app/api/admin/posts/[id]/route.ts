// app/api/admin/posts/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// -------- GET /api/admin/posts/:id ------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('posts_view')
    .select(`
      id, title, slug, summary, content, status,
      pinned_until, effective_from, vendor_id,
      created_at, updated_at, author_name,
      categories:post_categories ( category:categories ( id, name, color ) ),
      badges:post_badges ( badge:badges ( id, name, color, kind ) ),
      sources:post_sources ( url, label, sort_order )
    `)
    .eq('id', postId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const categories = (data?.categories ?? []).map((c: any) => c.category);
  const badges = (data?.badges ?? []).map((b: any) => b.badge);

  return NextResponse.json({ data: { ...data, categories, badges } });
}

// -------- PATCH /api/admin/posts/:id ----------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body?.post) return NextResponse.json({ error: 'Missing payload' }, { status: 400 });

  const db = supabaseAdmin();

  // 1) Post-Felder
  const { error: upErr } = await db.from('posts').update(body.post).eq('id', postId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // 2) Relationen
  if (Array.isArray(body.categoryIds)) {
    await db.from('post_categories').delete().eq('post_id', postId);
    if (body.categoryIds.length) {
      const rows = body.categoryIds.map((cid: number) => ({ post_id: postId, category_id: cid }));
      await db.from('post_categories').insert(rows);
    }
  }

  if (Array.isArray(body.badgeIds)) {
    await db.from('post_badges').delete().eq('post_id', postId);
    if (body.badgeIds.length) {
      const rows = body.badgeIds.map((bid: number) => ({ post_id: postId, badge_id: bid }));
      await db.from('post_badges').insert(rows);
    }
  }

  if (Array.isArray(body.sources)) {
    await db.from('post_sources').delete().eq('post_id', postId);
    if (body.sources.length) {
      const rows = body.sources.map((s: any) => ({ post_id: postId, ...s }));
      await db.from('post_sources').insert(rows);
    }
  }

  return NextResponse.json({ ok: true, id: postId });
}

// -------- DELETE /api/admin/posts/:id ---------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = supabaseAdmin();
  // Reihenfolge: erst Relationen, dann Haupttabelle (wenn kein FK CASCADE)
  await db.from('post_sources').delete().eq('post_id', postId);
  await db.from('post_badges').delete().eq('post_id', postId);
  await db.from('post_categories').delete().eq('post_id', postId);

  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// Optional:
// export const dynamic = 'force-dynamic';
