/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/groups/[groupId]/posts/route.ts
import { NextResponse } from 'next/server';
import { isActiveGroup, isMember, query } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

/** GET: Liste von Posts einer Gruppe (paged) */
export async function GET(req: Request, { params }: any) {
  try {
    const gid = Number(params.groupId);
    if (!Number.isFinite(gid) || gid <= 0) return bad('Ungültige Gruppen-ID', 400);

    const me = await getUserFromRequest(req);
    console.log('[groups/:id/posts GET] me:', JSON.stringify(me, null, 2));
    
    if (!me?.id) return bad('Nicht angemeldet', 401);

    // Verwende die UUID (me.id oder me.sub)
    const userId = String(me.id);
    console.log('[groups/:id/posts GET] userId:', userId, 'groupId:', gid);

    if (!(await isActiveGroup(gid))) {
      console.log('[groups/:id/posts GET] group not active');
      return bad('Unbekannte oder inaktive Gruppe', 404);
    }
    
    const memberCheck = await isMember(userId, gid);
    console.log('[groups/:id/posts GET] isMember result:', memberCheck);
    
    if (!memberCheck) {
      return bad('Kein Zugriff auf diese Gruppe', 403);
    }

    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
    const offset   = (page - 1) * pageSize;

    const items = await query<{
      id: number;
      slug: string | null;
      title: string;
      summary: string | null;
      content: string | null;
      created_at: string;
      hero_image_url: string | null;
    }>`
      select p.id, p.slug, p.title, p.summary, p.content, p.created_at, p.hero_image_url
      from group_posts p
      where p.group_id = ${gid}
      order by p.created_at desc
      limit ${pageSize} offset ${offset}
    `;

    return NextResponse.json({ ok: true, items, data: items, page, pageSize });
  } catch (err) {
    console.error('[groups/:id/posts] GET error', err);
    return bad('Interner Fehler', 500);
  }
}

/** POST: neuen Post in der Gruppe erstellen */
export async function POST(req: Request, { params }: any) {
  try {
    const gid = Number(params.groupId);
    if (!Number.isFinite(gid) || gid <= 0) return bad('Ungültige Gruppen-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const userId = String(me.id);

    if (!(await isActiveGroup(gid))) return bad('Unbekannte oder inaktive Gruppe', 404);
    if (!(await isMember(userId, gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim();
    if (!title) return bad('Titel fehlt', 400);

    const summary        = body?.summary ?? null;
    const content        = body?.content ?? null;
    const hero_image_url = body?.hero_image_url ?? null;

    const rows = await query<{ id: number; slug: string }>`
      insert into group_posts (group_id, user_id, title, summary, content, hero_image_url)
      values (${gid}, ${userId}::uuid, ${title}, ${summary}, ${content}, ${hero_image_url})
      returning id, slug
    `;

    return NextResponse.json({ ok: true, id: rows[0].id, slug: rows[0].slug });
  } catch (err) {
    console.error('[groups/:id/posts] POST error', err);
    return bad('Interner Fehler', 500);
  }
}
