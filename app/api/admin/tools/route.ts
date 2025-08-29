import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type NewTool = { title: string; href: string; icon?: string | null; sort?: number };

// GET /api/admin/tools?q=&page=&pageSize=
export async function GET(req: Request) {
  const s = supabaseAdmin();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '50')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = s
    .from(T.tools)
    .select('id,title,icon,href,sort', { count: 'exact' })
    .order('sort', { ascending: true })
    .order('title', { ascending: true })
    .range(from, to);

  if (q) query = query.or(`title.ilike.%${q}%,href.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count ?? 0 });
}

// POST /api/admin/tools
// body: { title, href, icon?, sort? }
export async function POST(req: Request) {
  const s = supabaseAdmin();
  const body: NewTool = await req.json().catch(() => ({} as any));

  const title = String(body?.title ?? '').trim();
  const href  = String(body?.href ?? '').trim();
  const icon  = body?.icon != null ? String(body.icon) : null;
  const sort  = Number.isFinite(Number(body?.sort)) ? Number(body.sort) : 0;

  if (!title) return NextResponse.json({ error: 'title ist erforderlich.' }, { status: 400 });
  if (!href)  return NextResponse.json({ error: 'href ist erforderlich.' }, { status: 400 });

  const { data, error } = await s.from(T.tools).insert({ title, href, icon, sort }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
