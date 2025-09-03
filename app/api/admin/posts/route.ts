// app/api/admin/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const s = supabaseAdmin();

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = s
    .from('posts')
    .select(
      'id,title,slug,status,effective_from,vendor_id,author_id,updated_at,created_at',
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (q) {
    const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    query = query.or(`title.ilike.${like},slug.ilike.${like}`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Autorennamen auflösen
  const rows = data ?? [];
  const authorIds = Array.from(new Set(rows.map(r => r.author_id).filter((v): v is string => !!v)));
  let nameById = new Map<string, string>();
  if (authorIds.length) {
    const { data: users } = await s.from('app_users').select('user_id,name').in('user_id', authorIds);
    if (users) nameById = new Map(users.map(u => [u.user_id, u.name ?? '']));
  }

  const withAuthor = rows.map(r => ({
    ...r,
    author_name: r.author_id ? (nameById.get(r.author_id) ?? null) : null,
  }));

  return NextResponse.json({ data: withAuthor, total: count ?? 0, page, pageSize });
}
