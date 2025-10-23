/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

function getTeamId(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const id = Number(parts[parts.length - 1]);
    return Number.isFinite(id) ? id : null;
  } catch { 
    return null; 
  }
}

/** Prüft ob User Admin, Moderator oder Teamleiter ist */
function hasAdminRights(role: string): boolean {
  return role === 'admin' || role === 'moderator' || role === 'teamleiter';
}

export async function PATCH(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const id = getTeamId(req.url);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'bad_id' }, { status: 400 });
  }

  let body: any = {};
  try { 
    body = await req.json(); 
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const name = (body?.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });
  }

  try {
    await sql/*sql*/`update public.teams set name = ${name} where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[PATCH /api/admin/teams/:id] update failed:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'db_error',
      details: e?.message 
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const me = await getAdminFromCookies(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Teamleiter haben Admin-Rechte
  if (!hasAdminRights(me.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const id = getTeamId(req.url);
  if (!id) {
    return NextResponse.json({ ok: false, error: 'bad_id' }, { status: 400 });
  }

  try {
    await sql/*sql*/`delete from public.teams where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[DELETE /api/admin/teams/:id] delete failed:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'db_error',
      details: e?.message 
    }, { status: 500 });
  }
}
