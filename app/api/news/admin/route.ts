import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Body = {
  post: {
    title: string;
    summary: string | null;
    content: string | null;
    slug: string | null;
    vendor_id: number | null;
    status: 'draft'|'scheduled'|'published';
    priority: number | null;
    pinned_until: string | null;     // ISO
    effective_from: string | null;   // ISO
  };
  categoryIds?: number[];
  badgeIds?: number[];
};

export async function POST(req: Request) {
  const s = supabaseAdmin();
  const { post, categoryIds = [], badgeIds = [] } = (await req.json()) as Body;

  // 1) Post
  const { data: created, error } = await s
    .from(T.posts)
    .insert(post)
    .select('id, slug')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2) Joins
  if (categoryIds.length) {
    const rows = categoryIds.map(category_id => ({ post_id: created.id, category_id }));
    const { error: e1 } = await s.from(T.postCategories).insert(rows);
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  if (badgeIds.length) {
    const rows = badgeIds.map(badge_id => ({ post_id: created.id, badge_id }));
    const { error: e2 } = await s.from(T.postBadges).insert(rows);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  return NextResponse.json({ id: created.id, slug: created.slug ?? post.slug ?? null });
}
