import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const cat = url.searchParams.getAll('category').map(Number).filter(Boolean);
  const badge = url.searchParams.getAll('badge').map(Number).filter(Boolean);
  const vendor = url.searchParams.getAll('vendor').map(Number).filter(Boolean);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '20', 10), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = supabaseServer();

  let selectStr = `
    id, slug, title, summary, content, priority, pinned_until,
    effective_from, effective_to, status, created_at, updated_at,
    vendor:vendor_id ( id, name ),
    post_categories(post_id, category:category_id ( id, name, color )),
    post_badges(post_id, badge:badge_id ( id, name, color, kind ))
  `;

  // bei aktivem Filter inner join erzwingen
  if (cat.length) selectStr = selectStr.replace('post_categories(', 'post_categories!inner(');
  if (badge.length) selectStr = selectStr.replace('post_badges(', 'post_badges!inner(');

  let query = supabase
    .from('posts')
    .select(selectStr, { count: 'exact' })
    // RLS filtert bereits auf veröffentlichte/effectiv gültige Beiträge
    .order('pinned_until', { ascending: false, nullsFirst: false })
    .order('priority', { ascending: false })
    .order('effective_from', { ascending: false })
    .range(from, to);

  if (q && q.length > 1) {
    query = query.textSearch('fts', q, { type: 'websearch', config: 'simple' });
  }
  if (vendor.length) query = query.in('vendor_id', vendor);
  if (cat.length) query = query.in('post_categories.category_id', cat);
  if (badge.length) query = query.in('post_badges.badge_id', badge);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data, page, pageSize, total: count ?? 0 });
}