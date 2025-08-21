import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // Service-Role für Admin-CRUD
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const q = (searchParams.get('q') ?? '').trim();

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // Passe die Select-Relationen an DEINE Tabellen/Views an
  let query = supabase
    .from('posts')
    .select(`
      id, title, slug, summary, content, status, priority, pinned_until, effective_from, vendor_id, updated_at,
      post_categories:post_categories(category:categories(id,name,color)),
      post_badges:post_badges(badge:badges(id,name,color,kind))
    `,
    { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (q) {
    // Suche über Titel oder Slug
    query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // in ein flaches Row-Format mappen (für UI)
  const rows = (data ?? []).map(p => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    summary: p.summary,
    content: p.content,
    status: p.status,
    priority: p.priority,
    pinned_until: p.pinned_until,
    effective_from: p.effective_from,
    vendor_id: p.vendor_id,
    updated_at: p.updated_at,
    categories: (p.post_categories ?? []).map((pc: any) => pc.category),
    badges: (p.post_badges ?? []).map((pb: any) => pb.badge),
  }));

  return NextResponse.json({ data: rows, total: count ?? 0 });
}
