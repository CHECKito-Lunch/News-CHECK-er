/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/admin/groups/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

// Body robust lesen (JSON/Form/Fallback)
async function readBody(req: NextRequest): Promise<any> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const raw = await req.text().catch(() => '');
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData().catch(() => null);
    if (!form) return {};
    const obj: Record<string, any> = {};
    for (const [k, v] of form.entries()) obj[k] = typeof v === 'string' ? v : v.name;
    return obj;
  }
  const raw = await req.text().catch(() => '');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// GET /api/admin/groups  -> Liste (optional q-Filter)
export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookies(req);          // ✅ req übergeben
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  try {
    const rows = await sql<any[]>`
      select id, name, description, is_private, created_at
        from public.groups
       ${q ? sql`where name ilike ${'%' + q + '%'} or description ilike ${'%' + q + '%'}` : sql``}
       order by created_at desc
       limit 500
    `;
    return NextResponse.json({ ok:true, data: rows });
  } catch (e:any) {
    console.error('[admin/groups GET]', e);
    return NextResponse.json({ ok:false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}

// POST /api/admin/groups  -> anlegen/ändern (einfach: nur anlegen)
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req);          // ✅ req übergeben
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description =
    typeof body?.description === 'string' ? body.description : null;
  const is_private =
    typeof body?.is_private === 'boolean'
      ? body.is_private
      : /^(1|true|yes|on)$/i.test(String(body?.is_private ?? ''));

  if (!name) {
    return NextResponse.json({ ok:false, error:'name_required' }, { status: 400 });
  }

  try {
    const [row] = await sql<any[]>`
      insert into public.groups (name, description, is_private)
      values (${name}, ${description}, ${is_private})
      returning id, name, description, is_private
    `;
    return NextResponse.json({ ok:true, data: row });
  } catch (e:any) {
    console.error('[admin/groups POST]', e);
    const msg = String(e?.message ?? '');
    const status = /duplicate key|unique/i.test(msg) ? 409 : 500;
    return NextResponse.json({ ok:false, error: msg || 'server_error' }, { status });
  }
}
