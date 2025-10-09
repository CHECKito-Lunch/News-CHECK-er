// app/api/admin/users/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';
import { getAdminFromCookies } from '@/lib/admin-auth';

type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

type AppUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
};

type ErrorBody = { error: string };

const json = <T extends object>(d: T, status = 200) =>
  NextResponse.json<T>(d, { status });

/* ---------- kleine Helfer ---------- */
const isRole = (v: unknown): v is Role =>
  v === 'admin' || v === 'moderator' || v === 'teamleiter' || v === 'user';

/* ----------------------------- GET /api/admin/users ----------------------------- */
// Query: ?q=&page=&pageSize=
export async function GET(req: NextRequest) {
  const me = await getAdminFromCookies();
  if (!me) return json<ErrorBody>({ error: 'unauthorized' }, 401);

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '150')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const s = supabaseAdmin();
  let query = s
    .from(T.appUsers)
    .select('id,user_id,email,name,role,active,created_at,updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (q) {
    // Suche in Email oder Name
    query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return json<ErrorBody>({ error: error.message }, 500);

  const rows: AppUser[] = (data ?? []) as AppUser[];

  return json({
    data: rows,
    total: count ?? 0,
    page,
    pageSize,
  });
}

/* ----------------------------- POST /api/admin/users ----------------------------- */
// body: { email: string; name?: string; role?: Role; password?: string }
export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies();
  if (!me) return json<ErrorBody>({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({} as any));

  const email = String(body.email ?? '').trim().toLowerCase();
  const name  = (body.name ?? '').trim() || null;
  const role: Role = isRole(body.role) ? body.role : 'user';

  const password: string | undefined =
    typeof body.password === 'string' && body.password.length > 0
      ? body.password
      : undefined;

  if (!email) {
    return json<ErrorBody>({ error: 'E-Mail ist erforderlich.' }, 400);
  }

  // Nur @check24.de E-Mails zulassen
  if (!email.endsWith('@check24.de')) {
    return json<ErrorBody>({ error: 'Nur @check24.de E-Mails sind erlaubt.' }, 400);
  }

  if (password && password.length < 8) {
    return json<ErrorBody>({ error: 'Passwort muss mind. 8 Zeichen haben.' }, 400);
  }

  const insert: Partial<AppUser> & { password_hash?: string } = {
    email,
    name,
    role,
    active: false, // Neue User immer inaktiv
  };
  if (password) {
    insert.password_hash = await bcrypt.hash(password, 12);
  }

  const s = supabaseAdmin();

  // Vorab-Check auf vorhandene E-Mail → 409 statt 500
  const exists = await s
    .from(T.appUsers)
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (!exists.error && exists.data) {
    return json<ErrorBody>({ error: 'E-Mail bereits vorhanden.' }, 409);
  }

  const { data, error } = await s
    .from(T.appUsers)
    .insert(insert as any)
    .select('id,user_id')
    .single();

  if (error) {
    // Unique-Constraint im DB-Layer (Fallback)
    if ((error as any).code === '23505') {
      return json<ErrorBody>({ error: 'E-Mail bereits vorhanden.' }, 409);
    }
    return json<ErrorBody>({ error: error.message }, 500);
  }

  return json({ id: data.id });
}

/* ----------------------------- OPTIONS/HEAD ----------------------------- */
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }
export async function HEAD()    { return new NextResponse(null, { status: 200 }); }
