// app/api/admin/checkiade/widgets/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

// rekursiv undefined entfernen (für JSONB)
const stripUndefined = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** PATCH /api/admin/checkiade/widgets/[id] */
export async function PATCH(req: Request, context: any) {
  const admin = await getAdminFromCookies();
  if (!admin) return json({ ok: false, error: 'forbidden' }, 401);

  const id = String(context?.params?.id ?? '');
  if (!id) return json({ ok: false, error: 'id_required' }, 400);

  const body = await req.json().catch(() => ({} as any));

  // nur setzen, wenn wirklich übergeben (sonst NULL → COALESCE)
  const name =
    body?.name === undefined
      ? null
      : typeof body?.name === 'string'
      ? body.name.trim()
      : null;

  const isPublic =
    body?.is_public === undefined ? null : Boolean(body.is_public);

  const configArg =
    body?.config === undefined ? null : stripUndefined(body.config);

  const configParam =
    configArg === null
      ? null
      : (typeof sqlJson === 'function' ? sqlJson(configArg) : JSON.stringify(configArg));

  if (name === null && isPublic === null && configParam === null) {
    return json({ ok: false, error: 'nothing_to_update' }, 400);
  }

  try {
    const [row] = await sql<any[]>/*sql*/`
      update public.checkiade_widgets
         set name       = coalesce(${name}, name),
             is_public  = coalesce(${isPublic}, is_public),
             config     = coalesce(${configParam}::jsonb, config),
             updated_at = now()
       where id = ${id}
       returning id, name, config, is_public, created_by, created_at, updated_at
    `;
    if (!row) return json({ ok: false, error: 'not_found' }, 404);
    return json({ ok: true, item: row });
  } catch (e: any) {
    console.error('[widgets PATCH]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}

/** DELETE /api/admin/checkiade/widgets/[id] */
export async function DELETE(_req: Request, context: any) {
  const admin = await getAdminFromCookies();
  if (!admin) return json({ ok: false, error: 'forbidden' }, 401);

  const id = String(context?.params?.id ?? '');
  if (!id) return json({ ok: false, error: 'id_required' }, 400);

  try {
    await sql/*sql*/`
      delete from public.checkiade_widgets
       where id = ${id}
    `;
    return json({ ok: true, deleted: 1 });
  } catch (e: any) {
    console.error('[widgets DELETE]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}

/** (optional) HEAD/OPTIONS für Robustheit */
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }
export async function HEAD()    { return new NextResponse(null, { status: 200 }); }
