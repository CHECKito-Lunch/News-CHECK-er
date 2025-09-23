// app/api/news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getUserFromRequest } from '@/lib/getUserFromRequest';
import { T } from '@/lib/tables';

type PostRow = {
  id: number;
  slug: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  priority: number | null;
  pinned_until: string | null;
  effective_from: string | null;
  status: 'draft' | 'scheduled' | 'published';
  created_at: string; updated_at: string; author_id: string | null;
  vendor: { id: number; name: string } | null;
  post_categories: { post_id: number; category: { id: number; name: string; color: string | null } }[];
  post_badges:     { post_id: number; badge:    { id: number; name: string; color: string | null; kind: string | null } }[];
  sources:         { url: string; label: string | null; sort_order: number | null }[];
  images:          { path: string; title: string | null; sort_order: number | null }[];
};

type AppUserRow = { user_id: string; name: string | null };

/** Rückgabe-Typ mit aufgelösten Bild-URLs */
type AugmentedPostRow = Omit<PostRow, 'images'> & {
  author_name: string | null;
  images: { url: string; caption: string | null; sort_order: number | null }[];
};

const AGENT_BADGE_NAME = '⚡ Agent';
const UPLOAD_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET || 'uploads';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const cat    = url.searchParams.getAll('category').map(Number).filter(Boolean);
  const badge  = url.searchParams.getAll('badge').map(Number).filter(Boolean);
  const vendor = url.searchParams.getAll('vendor').map(Number).filter(Boolean);
  const agentFlag         = url.searchParams.get('agent') === '1';
  const badgeNameParam    = (url.searchParams.get('badgeName') || '').trim();
  const categoryNameParam = (url.searchParams.get('categoryName') || '').trim();
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const supabase = await supabaseServer();

  const resolvedBadgeIds: number[] = [...badge];
  const resolvedCategoryIds: number[] = [...cat];

  if (agentFlag) {
    const { data: b } = await supabase.from('badges').select('id').eq('name', AGENT_BADGE_NAME).maybeSingle();
    if (b?.id) resolvedBadgeIds.push(b.id);
  }
  if (badgeNameParam) {
    const { data: b } = await supabase.from('badges').select('id').ilike('name', badgeNameParam).maybeSingle();
    if (b?.id) resolvedBadgeIds.push(b.id);
  }
  if (categoryNameParam) {
    const { data: c } = await supabase.from('categories').select('id').ilike('name', categoryNameParam).maybeSingle();
    if (c?.id) resolvedCategoryIds.push(c.id);
  }

  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
  const badgeFilterIds    = uniq(resolvedBadgeIds);
  const categoryFilterIds = uniq(resolvedCategoryIds);

  let selectStr = `
    id, slug, title, summary, content, priority, pinned_until,
    effective_from, status, created_at, updated_at,
    author_id,
    vendor:vendor_id ( id, name ),
    post_categories ( post_id, category:category_id ( id, name, color ) ),
    post_badges     ( post_id, badge:badge_id ( id, name, color, kind ) ),
    sources:post_sources ( url, label, sort_order ),
    images:post_images ( path, title, sort_order )
  `;
  if (categoryFilterIds.length) selectStr = selectStr.replace('post_categories (', 'post_categories!inner(');
  if (badgeFilterIds.length)    selectStr = selectStr.replace('post_badges     (', 'post_badges!inner(');

  const nowISO = new Date().toISOString();
  let query = supabase
    .from('posts')
    .select(selectStr, { count: 'exact' })
    .eq('status', 'published')
    .or(`effective_from.is.null,effective_from.lte.${nowISO}`)
    .order('pinned_until',   { ascending: false, nullsFirst: false })
    .order('effective_from', { ascending: false })
    .range(from, to);

  if (q.length > 1) {
    const pat = q.replace(/[%_]/g, ' ').trim();
    query = query.or(`title.ilike.%${pat}%,summary.ilike.%${pat}%,content.ilike.%${pat}%`);
  }
  if (vendor.length)            query = query.in('vendor_id', vendor);
  if (categoryFilterIds.length) query = query.in('post_categories.category_id', categoryFilterIds);
  if (badgeFilterIds.length)    query = query.in('post_badges.badge_id', badgeFilterIds);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows: PostRow[] = Array.isArray(data) ? (data as any) : [];

  // Autorennamen auflösen
  const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter((v): v is string => !!v)));
  let nameByUserId = new Map<string, string>();
  if (authorIds.length) {
    const { data: usersRaw } = await supabase.from('app_users').select('user_id,name').in('user_id', authorIds);
    if (Array.isArray(usersRaw)) nameByUserId = new Map((usersRaw as AppUserRow[]).map(u => [u.user_id, u.name ?? '']));
  }

  // Storage Public-URLs auflösen
  const storage = supabase.storage.from(UPLOAD_BUCKET);

  const withAuthor: AugmentedPostRow[] = rows.map(r => {
    const sorted = (r.images || []).slice().sort((a,b)=>(a.sort_order ?? 0) - (b.sort_order ?? 0));
    const images = sorted
      .map(im => {
        const url = im?.path ? storage.getPublicUrl(im.path).data.publicUrl : null;
        return url ? { url, caption: im.title ?? null, sort_order: im.sort_order ?? null } : null;
      })
      .filter((x): x is { url: string; caption: string | null; sort_order: number | null } => !!x);

    return {
      ...r,
      images,
      author_name: r.author_id ? (nameByUserId.get(r.author_id) ?? null) : null,
    };
  });

  return NextResponse.json({ data: withAuthor, page, pageSize, total: count ?? 0 });
}

type Body = {
  post: {
    title: string; summary: string | null; content: string | null; slug: string | null;
    vendor_id: number | null; status: 'draft'|'scheduled'|'published';
    pinned_until: string | null; effective_from: string | null;
  };
  categoryIds?: number[];
  badgeIds?: number[];
  sources?: { url: string; label?: string | null; sort_order?: number }[];
  images?:  { path: string; title?: string | null; sort_order?: number }[];
};

export async function POST(req: NextRequest) {
  const s = supabaseAdmin();
  const { post, categoryIds = [], badgeIds = [], sources = [], images = [] } = (await req.json()) as Body;

  const user = await getUserFromRequest();
  const editor_user_id = user?.id ?? null;

  const { data: created, error } = await s
    .from(T.posts)
    .insert({ ...post, author_id: editor_user_id })
    .select('id, slug')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const post_id = created.id as number;

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
    const rows = sources.filter(x=>x.url?.trim()).map((x,i)=>({ post_id, url:x.url.trim(), label:x.label ?? null, sort_order:x.sort_order ?? i }));
    const { error: e3 } = await s.from('post_sources').insert(rows);
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  }
  if (images.length) {
    const rows = images
      .filter(x=>x.path?.trim())
      .map((x,i)=>({ post_id, path:x.path.trim(), title:x.title ?? null, sort_order:x.sort_order ?? i }));
    const { error: e4 } = await s.from('post_images').insert(rows);
    if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });
  }

  // Revision
  const editorName =
    editor_user_id
      ? (await s.from(T.appUsers).select('name').eq('user_id', editor_user_id).maybeSingle()).data?.name ?? null
      : null;

  await s.from('post_revisions').insert({
    post_id, editor_user_id, editor_name: editorName, action: 'create',
    changes: {
      fields: Object.entries(post).map(([key, val]) => ({ key, from: null, to: val })),
      categories: { added: categoryIds, removed: [] },
      badges: { added: badgeIds, removed: [] },
      sources: { added: sources.map(s => s.url), removed: [] },
      images:  { added: images.map(i => i.path), removed: [] }
    },
  });

  return NextResponse.json({ id: post_id, slug: created.slug ?? post.slug ?? null });
}