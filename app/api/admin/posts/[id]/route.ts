// app/api/admin/posts/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service-Role (nur Server!)
  { auth: { persistSession: false } }
);

type Category = { id: number; name: string; color: string | null };
type Badge    = { id: number; name: string; color: string | null; kind: string | null };

type PostCategoryRow = { category: Category };
type PostBadgeRow    = { badge: Badge };

// Hilfsfunktion: Context → ID
function parseId(ctx: any): number | null {
  const idStr = ctx?.params?.id as string | undefined;
  const idNum = Number(idStr);
  return Number.isFinite(idNum) ? idNum : null;
}

// GET /api/admin/posts/[id]
export async function GET(_req: Request, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, title, slug, summary, content, status, priority, pinned_until, effective_from, vendor_id, updated_at, created_at,
      post_categories:post_categories(category:categories(id,name,color)),
      post_badges:post_badges(badge:badges(id,name,color,kind))
    `)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = {
    id: data.id,
    title: data.title,
    slug: data.slug,
    summary: data.summary,
    content: data.content,
    status: data.status as 'draft' | 'scheduled' | 'published',
    priority: data.priority,
    pinned_until: data.pinned_until,
    effective_from: data.effective_from,
    vendor_id: data.vendor_id,
    updated_at: data.updated_at,
    created_at: (data as { created_at?: string | null }).created_at ?? null,
    categories: (data.post_categories ?? ([] as PostCategoryRow[])).map((pc) => pc.category),
    badges:     (data.post_badges     ?? ([] as PostBadgeRow[])).map((pb) => pb.badge),
  };

  return NextResponse.json({ data: row });
}

// PATCH /api/admin/posts/[id]
export async function PATCH(req: Request, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json();
  const { post, categoryIds, badgeIds } = body as {
    post: {
      title: string;
      summary: string | null;
      content: string | null;
      slug: string | null;
      vendor_id: number | null;
      status: 'draft' | 'scheduled' | 'published';
      priority: number | null;
      pinned_until: string | null;
      effective_from: string | null;
    };
    categoryIds: number[];
    badgeIds: number[];
  };

  // 1) Post aktualisieren
  const { error: upErr } = await supabase.from('posts').update(post).eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // 2) Joins neu setzen
  const { error: delCatErr } = await supabase.from('post_categories').delete().eq('post_id', id);
  if (delCatErr) return NextResponse.json({ error: delCatErr.message }, { status: 500 });

  if (categoryIds?.length) {
    const { error: upCatErr } = await supabase
      .from('post_categories')
      .upsert(categoryIds.map((cid) => ({ post_id: id, category_id: cid })));
    if (upCatErr) return NextResponse.json({ error: upCatErr.message }, { status: 500 });
  }

  const { error: delBadgeErr } = await supabase.from('post_badges').delete().eq('post_id', id);
  if (delBadgeErr) return NextResponse.json({ error: delBadgeErr.message }, { status: 500 });

  if (badgeIds?.length) {
    const { error: upBadgeErr } = await supabase
      .from('post_badges')
      .upsert(badgeIds.map((bid) => ({ post_id: id, badge_id: bid })));
    if (upBadgeErr) return NextResponse.json({ error: upBadgeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/posts/[id]
export async function DELETE(_req: Request, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // erst Joins, dann Post
  const { error: delCatErr } = await supabase.from('post_categories').delete().eq('post_id', id);
  if (delCatErr) return NextResponse.json({ error: delCatErr.message }, { status: 500 });

  const { error: delBadgeErr } = await supabase.from('post_badges').delete().eq('post_id', id);
  if (delBadgeErr) return NextResponse.json({ error: delBadgeErr.message }, { status: 500 });

  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
