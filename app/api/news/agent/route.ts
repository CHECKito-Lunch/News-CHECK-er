// app/api/news/agent/route.ts
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

const AGENT_BADGE_NAME = '⚡ Agent';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') || url.searchParams.get('limit') || '20', 10))
  );
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const supabase = await supabaseServer();

  // 1) Agent-Badge-ID ermitteln
  const { data: badgeRow, error: badgeErr } = await supabase
    .from('badges')
    .select('id')
    .eq('name', AGENT_BADGE_NAME)
    .maybeSingle();

  if (badgeErr) {
    return NextResponse.json({ error: badgeErr.message }, { status: 400 });
  }
  if (!badgeRow?.id) {
    // Kein Agent-Badge vorhanden ⇒ leere Liste zurückgeben (kein Fehler)
    return NextResponse.json({ data: [], page, pageSize, total: 0 });
  }

  // 2) Select wie in /api/news, aber mit erzwungenem Inner-Join auf post_badges + Filter auf Agent-Badge
  let selectStr = `
    id, slug, title, summary, content, priority, pinned_until,
    effective_from, status, created_at, updated_at,
    author_id,
    vendor:vendor_id ( id, name ),
    post_categories ( post_id, category:category_id ( id, name, color ) ),
    post_badges!inner ( post_id, badge:badge_id ( id, name, color, kind ) ),
    sources:post_sources ( url, label, sort_order )
  `;

  let query = supabase
    .from('posts')
    .select(selectStr, { count: 'exact' })
    .eq('status', 'published')
    .lte('effective_from', new Date().toISOString())
    .in('post_badges.badge_id', [badgeRow.id]) // <-- WICHTIG: Array mit IDs, NICHT der Query-Builder
    .order('pinned_until',   { ascending: false, nullsFirst: false })
    .order('effective_from', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows: PostRow[] = Array.isArray(data) ? (data as unknown as PostRow[]) : [];

  // 3) Autorennamen auflösen (wie in /api/news)
  const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter((v): v is string => !!v)));
  let nameByUserId = new Map<string, string>();

  if (authorIds.length) {
    const { data: usersRaw } = await supabase
      .from('app_users')
      .select('user_id,name')
      .in('user_id', authorIds);

    if (Array.isArray(usersRaw)) {
      const users = usersRaw as unknown as AppUserRow[];
      nameByUserId = new Map(users.map(u => [u.user_id, u.name ?? '']));
    }
  }

  const withAuthor: AugmentedPostRow[] = rows.map(r => ({
    ...r,
    author_name: r.author_id ? (nameByUserId.get(r.author_id) ?? null) : null,
  }));

  return NextResponse.json({
    data: withAuthor,
    page,
    pageSize,
    total: count ?? 0,
  });
}
