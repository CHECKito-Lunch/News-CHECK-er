import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Role = 'admin' | 'moderator' | 'user';
type AppUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

// GET /api/admin/users?q=&page=&pageSize=
export async function GET(req: Request) {
  const s = supabaseAdmin();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = s
    .from(T.appUsers)
    .select('id,email,name,role,active,created_at,updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (q) {
    // Suche in Email oder Name
    query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    total: count ?? 0,
  });
}

// POST /api/admin/users
// body: { email: string; name?: string; role?: Role; active?: boolean }
export async function POST(req: Request) {
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const email = String(body.email ?? '').trim().toLowerCase();
  const name = (body.name ?? '').trim() || null;
  const role: Role = ['admin', 'moderator', 'user'].includes(body.role) ? body.role : 'user';
  const active: boolean = body.active ?? true;

  if (!email) {
    return NextResponse.json({ error: 'E-Mail ist erforderlich.' }, { status: 400 });
  }

  const { data, error } = await s
    .from(T.appUsers)
    .insert({ email, name, role, active })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}