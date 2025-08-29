import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Category = { id: number; name: string; color: string | null };
type Badge    = { id: number; name: string; color: string | null; kind: string | null };
type Source   = { url: string; label: string | null; sort_order: number | null };

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
      id, title, slug, summary, content, status, pinned_until, effective_from, vendor_id, updated_at, created_at, author_id,
      post_categories:post_categories(category:categories(id,name,color)),
      post_badges:post_badges(badge:badges(id,name,color,kind)),
      post_sources:post_sources(url,label,sort_order)
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
    pinned_until: data.pinned_until,
    effective_from: data.effective_from,
    vendor_id: data.vendor_id,
    updated_at: data.updated_at,
    created_at: data.created_at,
    author_id: data.author_id as string | null,
    categories: (data.post_categories ?? []).flatMap((pc: any) => Array.isArray(pc.category) ? pc.category : [pc.category]),
    badges:     (data.post_badges ?? []).flatMap((pb: any) => Array.isArray(pb.badge) ? pb.badge : [pb.badge]),
    sources:    (data.post_sources ?? []).map((s: Source) => ({ url: s.url, label: s.label, sort_order: s.sort_order ?? 0 })),
  };

  return NextResponse.json({ data: row });
}

// PATCH /api/admin/posts/[id]
export async function PATCH(req: NextRequest, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const user = await getUserFromRequest(req);
  const editor_user_id = user?.id ?? null;

  const body = await req.json();
  const { post, categoryIds = [], badgeIds = [], sources = [] as { url: string; label?: string|null; sort_order?: number }[] } = body as any;

  // ALTEN Zustand laden (für Diff)
  const { data: before, error: be } = await supabase
    .from('posts')
    .select(`
      id, title, summary, content, slug, vendor_id, status, pinned_until, effective_from,
      post_categories:post_categories(category_id),
      post_badges:post_badges(badge_id),
      post_sources:post_sources(url,label,sort_order)
    `)
    .eq('id', id)
    .single();
  if (be) return NextResponse.json({ error: be.message }, { status: 500 });

  // 1) Post aktualisieren
  const { error: upErr } = await supabase.from('posts').update(post).eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // 2) Kategorien/Badges/Sources ersetzen (simple replace)
  await supabase.from('post_categories').delete().eq('post_id', id);
  if (categoryIds.length) {
    await supabase.from('post_categories').insert(categoryIds.map((cid: number) => ({ post_id: id, category_id: cid })));
  }

  await supabase.from('post_badges').delete().eq('post_id', id);
  if (badgeIds.length) {
    await supabase.from('post_badges').insert(badgeIds.map((bid: number) => ({ post_id: id, badge_id: bid })));
  }

  await supabase.from('post_sources').delete().eq('post_id', id);
  if (sources.length) {
    const rows = sources
      .filter((x) => x.url?.trim())
      .map((x, i) => ({ post_id: id, url: x.url.trim(), label: x.label ?? null, sort_order: x.sort_order ?? i }));
    await supabase.from('post_sources').insert(rows);
  }

  // 3) Diff berechnen und Revision schreiben
  function arrNum(a: any[]): number[] { return (a ?? []).map((x) => Number(x)); }
  const beforeCats = arrNum((before?.post_categories ?? []).map((c: any) => c.category_id));
  const beforeBadg = arrNum((before?.post_badges    ?? []).map((b: any) => b.badge_id));
  const beforeSrcs = new Set<string>((before?.post_sources ?? []).map((s: any) => s.url));

  const afterCats = new Set<number>(categoryIds);
  const afterBadg = new Set<number>(badgeIds);
  const afterSrcs = new Set<string>(sources.map((s: any) => (s.url ?? '').trim()).filter(Boolean));

  const addedCats   = [...afterCats].filter((x) => !beforeCats.includes(x));
  const removedCats = beforeCats.filter((x) => !afterCats.has(x));
  const addedBadg   = [...afterBadg].filter((x) => !beforeBadg.includes(x));
  const removedBadg = beforeBadg.filter((x) => !afterBadg.has(x));
  const addedSrcs   = [...afterSrcs].filter((u) => !beforeSrcs.has(u));
  const removedSrcs = [...beforeSrcs].filter((u) => !afterSrcs.has(u));

  const fieldKeys = ['title','summary','content','slug','vendor_id','status','pinned_until','effective_from'] as const;
  const fieldsDiff = fieldKeys
    .map((k) => ({ key: k, from: (before as any)?.[k] ?? null, to: (post as any)?.[k] ?? null }))
    .filter((d) => String(d.from ?? '') !== String(d.to ?? ''));

  const editorName =
    editor_user_id
      ? (await supabase.from('app_users').select('name').eq('user_id', editor_user_id).maybeSingle()).data?.name ?? null
      : null;

  await supabase.from('post_revisions').insert({
    post_id: id,
    editor_user_id,
    editor_name: editorName,
    action: 'update',
    changes: {
      fields: fieldsDiff,
      categories: { added: addedCats, removed: removedCats },
      badges: { added: addedBadg, removed: removedBadg },
      sources: { added: addedSrcs, removed: removedSrcs },
    },
  });

  return NextResponse.json({ ok: true });
}
