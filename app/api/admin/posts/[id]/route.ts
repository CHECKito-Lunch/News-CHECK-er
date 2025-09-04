// app/api/admin/posts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Hilfsfunktion zur ID-Prüfung
function toId(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SELECT_DETAIL = `
  id, title, slug, summary, content, status, pinned_until, effective_from,
  vendor_id, author_id, created_at, updated_at,
  post_categories:post_categories ( category:category_id ( id, name, color ) ),
  post_badges:post_badges ( badge:badge_id ( id, name, color, kind ) ),
  sources:post_sources ( url, label, sort_order )
`;

// ✅ GET /api/admin/posts/[id]
export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const id = toId(context.params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  const s = supabaseAdmin();
  const { data, error } = await s.from('posts').select(SELECT_DETAIL).eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let author_name: string | null = null;
  if (data.author_id) {
    const { data: u } = await s.from('app_users').select('name').eq('user_id', data.author_id).maybeSingle();
    author_name = u?.name ?? null;
  }

  const categories = (data.post_categories ?? []).map((pc: any) => pc?.category).filter(Boolean);
  const badges = (data.post_badges ?? []).map((pb: any) => pb?.badge).filter(Boolean);

  return NextResponse.json({
    data: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      summary: data.summary,
      content: data.content,
      status: data.status,
      pinned_until: data.pinned_until,
      effective_from: data.effective_from,
      vendor_id: data.vendor_id,
      author_name,
      created_at: data.created_at,
      updated_at: data.updated_at,
      categories,
      badges,
      sources: data.sources ?? [],
    },
  });
}

// ✅ PATCH /api/admin/posts/[id]
export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const id = toId(context.params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  type Body = {
    post?: Partial<{
      title: string; summary: string | null; content: string | null; slug: string | null;
      status: 'draft' | 'scheduled' | 'published';
      pinned_until: string | null; effective_from: string | null; vendor_id: number | null;
      author_id?: string | null;
    }>;
    categoryIds?: number[];
    badgeIds?: number[];
    sources?: Array<{ url: string; label?: string | null; sort_order?: number | null }>;
  };

  const body = (await req.json().catch(() => ({}))) as Body;
  const s = supabaseAdmin();

  if (body.post && Object.keys(body.post).length) {
    const { error: e1 } = await s.from('posts').update(body.post).eq('id', id);
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  }

  if (Array.isArray(body.categoryIds)) {
    const { error } = await s.from('post_categories').delete().eq('post_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.categoryIds.length) {
      const rows = body.categoryIds.map(cid => ({ post_id: id, category_id: cid }));
      const { error: insErr } = await s.from('post_categories').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.badgeIds)) {
    const { error } = await s.from('post_badges').delete().eq('post_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (body.badgeIds.length) {
      const rows = body.badgeIds.map(bid => ({ post_id: id, badge_id: bid }));
      const { error: insErr } = await s.from('post_badges').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.sources)) {
    const { error } = await s.from('post_sources').delete().eq('post_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = body.sources
      .filter(x => x?.url && String(x.url).trim())
      .map((x, i) => ({
        post_id: id,
        url: String(x.url).trim(),
        label: x.label ?? null,
        sort_order: x.sort_order ?? i,
      }));
    if (rows.length) {
      const { error: insErr } = await s.from('post_sources').insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id });
}

// ✅ DELETE /api/admin/posts/[id]
export async function DELETE(_req: NextRequest, context: { params: { id: string } }) {
  const id = toId(context.params.id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  const s = supabaseAdmin();
  await s.from('post_sources').delete().eq('post_id', id);
  await s.from('post_badges').delete().eq('post_id', id);
  await s.from('post_categories').delete().eq('post_id', id);

  const { error } = await s.from('posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
