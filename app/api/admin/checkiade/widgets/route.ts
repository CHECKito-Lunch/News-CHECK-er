/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/admin/checkiade/widgets/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

// robust body reader (wie bei events)
async function readBody(req: NextRequest): Promise<any> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const raw = await req.text().catch(()=>''); try { return raw?JSON.parse(raw):{}; } catch { return {}; }
  }
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const fd = await req.formData().catch(()=>null); if(!fd) return {};
    const obj:Record<string,any>={}; for(const [k,v] of fd.entries()) obj[k]=typeof v==='string'?v:v.name; return obj;
  }
  const raw = await req.text().catch(()=> ''); try { return raw?JSON.parse(raw):{}; } catch { return {}; }
}

// entfernt rekursiv undefined
const stripUndefined = <T,>(x:T):T => JSON.parse(JSON.stringify(x)) as T;

// UUID-Check (einfach/pragmatisch)
// UUID-Check (einfach/pragmatisch)
const isUuid = (s: unknown) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

// versucht aus admin eine user-id zu bestimmen; erweitert um session.sub
async function resolveCreatorId(admin: any): Promise<string | null> {
  // 🔎 alle üblichen Stellen durchprobieren
  const candidates = [
    admin?.id,
    admin?.user_id,
    admin?.uid,
    admin?.userId,
    admin?.session?.sub,     // ⬅️ das haben wir in deinem Log!
    admin?.session?.userId,
    admin?.session?.uid,
  ].filter(Boolean);

  for (const c of candidates) {
    if (isUuid(c)) return String(c);
  }

  // Fallback via Email, wenn vorhanden
  const email: string | undefined = admin?.email ?? admin?.user?.email ?? admin?.session?.email ?? undefined;
  if (!email) return null;

  try {
    // ggf. Tabelle/Spaltennamen anpassen
    const rows = await sql<any[]>`
      select id from public.users where email = ${email} limit 1
    `;
    const id = rows?.[0]?.id;
    return isUuid(id) ? String(id) : null;
  } catch {
    return null;
  }
}
export async function GET(req: NextRequest) {
  // 🔎 Cookies & Headers debuggen
  console.log('[widgets GET dbg] cookie header length:', (req.headers.get('cookie') || '').length);
  console.log('[widgets GET dbg] ua:', req.headers.get('user-agent'));

  const admin = await getAdminFromCookies(req);
  console.log('[widgets GET dbg] admin raw:', admin);

  if (!admin) return json({ ok:false, error:'forbidden' }, 401);

  try {
    const rows = await sql<any[]>`
      select id, name, config, is_public, created_by, created_at, updated_at
        from public.checkiade_widgets
       order by created_at desc
       limit 500
    `;
    return json({ ok:true, items: rows });
  } catch (e:any) {
    console.error('[widgets GET error]', e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}

export async function POST(req: NextRequest) {
  // 🔎 Cookies & Headers debuggen
  console.log('[widgets POST dbg] cookie header length:', (req.headers.get('cookie') || '').length);
  console.log('[widgets POST dbg] origin:', req.headers.get('origin'));
  console.log('[widgets POST dbg] referer:', req.headers.get('referer'));
  console.log('[widgets POST dbg] ua:', req.headers.get('user-agent'));

  const admin = await getAdminFromCookies(req);
  console.log('[widgets POST dbg] admin raw:', admin);

  const creatorId = await resolveCreatorId(admin);
  console.log('[widgets POST dbg] resolvedCreatorId:', creatorId);

  if (!admin)       return json({ ok:false, error:'forbidden' }, 401);
  if (!creatorId)   return json({ ok:false, error:'missing_creator_id' }, 401);

  const body = await readBody(req);
  console.log('[widgets POST dbg] body raw:', body);

  const nameRaw   = typeof body?.name === 'string' ? body.name : null;
  const name      = nameRaw?.trim() || null;
  const isPublic  = body?.is_public == null ? true : !!body.is_public;
  const rawConfig = body?.config;
  if (rawConfig == null) return json({ ok:false, error:'config_required' }, 400);

  const configClean = stripUndefined(rawConfig);
  const configParam = typeof sqlJson === 'function' ? sqlJson(configClean) : JSON.stringify(configClean);

  // 🔎 Insert-Parameter loggen (ohne riesige JSON-Wände)
  console.log('[widgets POST dbg] insert params:', {
    creatorId,
    isPublic,
    name,
    configType: typeof configClean,
    configKeys: configClean && typeof configClean === 'object' ? Object.keys(configClean).slice(0, 20) : null,
  });

  try {
    const [row] = await sql<any[]>`
      insert into public.checkiade_widgets (created_by, is_public, config, name)
      values (${creatorId}, ${isPublic}, ${configParam}::jsonb, ${name})
      returning id, name, config, is_public, created_by, created_at, updated_at
    `;
    return json({ ok:true, item: row });
  } catch (e:any) {
    console.error('[widgets POST error]', e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}