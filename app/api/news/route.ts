// app/api/news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

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

  const supabase = supabaseServer();

  // Basisselekt inkl. author_id (für spätere Namensauflösung)
  let selectStr = `
    id, slug, title, summary, content, priority, pinned_until,
    effective_from, status, created_at, updated_at,
    author_id,
    vendor:vendor_id ( id, name ),
    post_categories ( post_id, category:category_id ( id, name, color ) ),
    post_badges     ( post_id, badge:badge_id ( id, name, color, kind ) ),
    sources:post_sources ( url, label, sort_order )
  `;

  // Falls nach Kategorien/Badges gefiltert wird: inner join erzwingen
  if (cat.length)   selectStr = selectStr.replace('post_categories (', 'post_categories!inner(');
  if (badge.length) selectStr = selectStr.replace('post_badges     (', 'post_badges!inner(');

  let query = supabase
    .from('posts')
    .select(selectStr, { count: 'exact' })
    // Veröffentlichungslogik ggf. aktivieren, falls keine RLS regelt:
    // .eq('status', 'published')
    // .lte('effective_from', new Date().toISOString())
    .order('pinned_until', { ascending: false, nullsFirst: false })
    .order('effective_from', { ascending: false })
    .range(from, to);

  // Volltext/ILike-Suche
  if (q.length > 1) {
    // Wenn du eine TSVECTOR-Spalte "fts" hast:
    query = query.textSearch('fts', q, { type: 'websearch', config: 'simple' });
    // Falls KEIN fts vorhanden, stattdessen:
    // query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,content.ilike.%${q}%`);
  }

  if (vendor.length) query = query.in('vendor_id', vendor);

  // Filter auf Join-Spalten – funktioniert zusammen mit !inner oben
  if (cat.length)   query = query.in('post_categories.category_id', cat);
  if (badge.length) query = query.in('post_badges.badge_id', badge);

  const { data, error, count } = await query;

  if (error) {
    console.error('[news:list] select error', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ---- Autorennamen auflösen (sekundäre Query gegen app_users) ----
  const rows = (data ?? []) as Array<{
    id: number;
    author_id: string | null;
    [k: string]: any;
  }>;

  const authorIds = Array.from(
    new Set(rows.map(r => r.author_id).filter((v): v is string => !!v))
  );

  let nameByUserId = new Map<string, string>();
  if (authorIds.length) {
    const { data: users, error: uErr } = await supabase
      .from('app_users')
      .select('user_id,name')
      .in('user_id', authorIds);

    if (uErr) {
      console.error('[news:list] app_users error', uErr);
    } else if (users) {
      nameByUserId = new Map(
        users.map((u: { user_id: string; name: string | null }) => [u.user_id, u.name ?? ''])
      );
    }
  }

  const withAuthor = rows.map(r => ({
    ...r,
    author_name: r.author_id ? (nameByUserId.get(r.author_id) ?? null) : null,
  }));

  return NextResponse.json({ data: withAuthor, page, pageSize, total: count ?? 0 });
}
