import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getUserFromRequest } from '@/lib/getUserFromRequest';
import { T } from '@/lib/tables';

type Body = {
  post: {
    title: string;
    summary: string | null;
    content: string | null;
    slug: string | null;
    vendor_id: number | null;
    status: 'draft'|'scheduled'|'published';
    pinned_until: string | null;
    effective_from: string | null;
  };
  categoryIds?: number[];
  badgeIds?: number[];
  sources?: { url: string; label?: string | null; sort_order?: number }[];
};

export async function POST(req: NextRequest) {
  const s = supabaseAdmin();
  const { post, categoryIds = [], badgeIds = [], sources = [] } = (await req.json()) as Body;

  // Editor ermitteln
  const user = await getUserFromRequest();
  const editor_user_id = user?.id ?? null;

  // 1) Post
  const { data: created, error } = await s
    .from(T.posts)
    .insert({ ...post, author_id: editor_user_id })
    .select('id, slug')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const post_id = created.id as number;

  // 2) Joins
  if (categoryIds.length) {
    const rows = categoryIds.map((category_id) => ({ post_id, category_id }));
    const { error: e1 } = await s.from(T.postCategories).insert(rows);
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  if (badgeIds.length) {
    const rows = badgeIds.map((badge_id) => ({ post_id, badge_id }));
    const { error: e2 } = await s.from(T.postBadges).insert(rows);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  if (sources.length) {
    const rows = sources
      .filter((x) => x.url?.trim())
      .map((x, i) => ({ post_id, url: x.url.trim(), label: x.label ?? null, sort_order: x.sort_order ?? i }));
    const { error: e3 } = await s.from('post_sources').insert(rows);
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  }

  // 3) Revision „create“
  const editorName =
    editor_user_id
      ? (await s.from(T.appUsers).select('name').eq('user_id', editor_user_id).maybeSingle()).data?.name ?? null
      : null;

  await s.from('post_revisions').insert({
    post_id,
    editor_user_id,
    editor_name: editorName,
    action: 'create',
    changes: {
      fields: Object.entries(post).map(([key, val]) => ({ key, from: null, to: val })),
      categories: { added: categoryIds, removed: [] },
      badges: { added: badgeIds, removed: [] },
      sources: { added: sources.map((s) => s.url), removed: [] },
    },
  });

  return NextResponse.json({ id: post_id, slug: created.slug ?? post.slug ?? null });
}
