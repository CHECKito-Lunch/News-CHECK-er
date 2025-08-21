import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,    // Service-Role
  { auth: { persistSession: false } }
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, title, slug, summary, content, status, priority, pinned_until, effective_from, vendor_id, updated_at,
      post_categories:post_categories(category:categories(id,name,color)),
      post_badges:post_badges(badge:badges(id,name,color,kind))
    `)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = {
    id: data.id,
    title: data.title,
    slug: data.slug,
    summary: data.summary,
    content: data.content,
    status: data.status,
    priority: data.priority,
    pinned_until: data.pinned_until,
    effective_from: data.effective_from,
    vendor_id: data.vendor_id,
    updated_at: data.updated_at,
    categories: (data.post_categories ?? []).map((pc: any) => pc.category),
    badges: (data.post_badges ?? []).map((pb: any) => pb.badge),
  };

  return NextResponse.json({ data: row });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();

  const { post, categoryIds, badgeIds } = body as {
    post: {
      title: string; summary: string|null; content: string|null; slug: string|null;
      vendor_id: number|null; status: 'draft'|'scheduled'|'published';
      priority: number|null; pinned_until: string|null; effective_from: string|null;
    };
    categoryIds: number[];
    badgeIds: number[];
  };

  // 1) Update Post
  const { error: upErr } = await supabase.from('posts').update(post).eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // 2) Join-Tabellen neu setzen (löschen & einsetzen)
  // Passe Tabellennamen/Spalten ggf. an deine DB an
  await supabase.from('post_categories').delete().eq('post_id', id);
  if (categoryIds?.length) {
    await supabase.from('post_categories').upsert(
      categoryIds.map(cid => ({ post_id: id, category_id: cid }))
    );
  }

  await supabase.from('post_badges').delete().eq('post_id', id);
  if (badgeIds?.length) {
    await supabase.from('post_badges').upsert(
      badgeIds.map(bid => ({ post_id: id, badge_id: bid }))
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);

  // Reihenfolge: zuerst Join-Daten, dann Post
  await supabase.from('post_categories').delete().eq('post_id', id);
  await supabase.from('post_badges').delete().eq('post_id', id);

  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
