// app/api/news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

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
  created_at: string;
  updated_at: string;
  author_id: string | null;
  vendor: { id: number; name: string } | null;
  post_categories: { post_id: number; category: { id: number; name: string; color: string | null } }[];
  post_badges:     { post_id: number; badge:    { id: number; name: string; color: string | null; kind: string | null } }[];
  sources:         { url: string; label: string | null; sort_order: number | null }[];
};

type AppUserRow = { user_id: string; name: string | null };
type AugmentedPostRow = PostRow & { author_name: string | null };

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const cat    = url.searchParams.getAll('category').map(Number).filter(Boolean);
  const badge  = url.searchParams.getAll('badge').map(Number).filter(Boolean);
  const vendor = url.searchParams.getAll('vendor').map(Number).filter(Boolean);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const supabase = await supabaseServer();

  // Basis-Select inkl. author_id (für spätere Namensauflösung)
  let selectStr = `
    id, slug, title, summary, content, priority, pinned_until,
    effective_from, status, created_at, updated_at,
    author_id,
    vendor:vendor_id ( id, name ),
    post_categories ( post_id, category:category_id ( id, name, color ) ),
    post_badges     ( post_id, badge:badge_id ( id, name, color, kind ) ),
    sources:post_sources ( url, label, sort_order )
  `;

  // Bei Filtern: inner join erzwingen
  if (cat.length)   selectStr = selectStr.replace('post_categories (', 'post_categories!inner(');
  if (badge.length) selectStr = selectStr.replace('post_badges     (', 'post_badges!inner(');

  let query = supabase
    .from('posts')
    .select(selectStr, { count: 'exact' })
    .eq('status', 'published')
    .lte('effective_from', new Date().toISOString())
    .order('pinned_until', { ascending: false, nullsFirst: false })
    .order('effective_from', { ascending: false })
    .range(from, to);

  if (q.length > 1) {
    // Falls FTS-Spalte vorhanden:
    query = query.textSearch('fts', q, { type: 'websearch', config: 'simple' });
    // Ohne FTS-Column:
    // query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,content.ilike.%${q}%`);
  }

  if (vendor.length) query = query.in('vendor_id', vendor);
  if (cat.length)    query = query.in('post_categories.category_id', cat);
  if (badge.length)  query = query.in('post_badges.badge_id', badge);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // <-- Wichtig: Ergebnis via unknown auf deinen Typ casten
  const rows: PostRow[] = Array.isArray(data) ? (data as unknown as PostRow[]) : [];

  // Autorennamen auflösen
  const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter((v): v is string => !!v)));
  let nameByUserId = new Map<string, string>();

  if (authorIds.length) {
    const { data: usersRaw, error: uErr } = await supabase
      .from('app_users')
      .select('user_id,name')
      .in('user_id', authorIds);

    if (!uErr && Array.isArray(usersRaw)) {
      const users = usersRaw as unknown as AppUserRow[];
      nameByUserId = new Map(users.map(u => [u.user_id, u.name ?? '']));
    }
  }

  const withAuthor: AugmentedPostRow[] = rows.map(r => ({
    ...r,
    author_name: r.author_id ? (nameByUserId.get(r.author_id) ?? null) : null,
  }));

  return NextResponse.json({ data: withAuthor, page, pageSize, total: count ?? 0 });
}
