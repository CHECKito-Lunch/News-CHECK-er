// app/api/groups/[groupId]/posts/route.ts
import { NextResponse } from 'next/server';
import { isActiveGroup, isMember, query } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

/** GET: Liste von Posts einer Gruppe (paged) */
export async function GET(req: Request, ctx: any) {
  try {
    const gid = Number(ctx?.params?.groupId);
    if (!Number.isFinite(gid) || gid <= 0) return bad('Ungültige Gruppen-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    if (!(await isActiveGroup(gid))) return bad('Unbekannte oder inaktive Gruppe', 404);
    if (!(await isMember(String(me.id), gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
    const offset   = (page - 1) * pageSize;

    const items = await query<{
      id: number;
      slug: string | null;
      title: string;
      summary: string | null;
      created_at: string;
      hero_image_url: string | null;
    }>`
      select p.id, p.slug, p.title, p.summary, p.created_at, p.hero_image_url
      from group_posts p
      where p.group_id = ${gid}
      order by p.created_at desc
      limit ${pageSize} offset ${offset}
    `;

    return NextResponse.json({ ok: true, items, page, pageSize });
  } catch (err) {
    console.error('[groups/:id/posts] GET error', err);
    return bad('Interner Fehler', 500);
  }
}

/** POST: neuen Post in der Gruppe erstellen */
export async function POST(req: Request, ctx: any) {
  try {
    const gid = Number(ctx?.params?.groupId);
    if (!Number.isFinite(gid) || gid <= 0) return bad('Ungültige Gruppen-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    if (!(await isActiveGroup(gid))) return bad('Unbekannte oder inaktive Gruppe', 404);
    if (!(await isMember(String(me.id), gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim();
    if (!title) return bad('Titel fehlt', 400);

    const summary        = body?.summary ?? null;
    const content        = body?.content ?? null;          // Markdown
    const hero_image_url = body?.hero_image_url ?? null;

    const rows = await query<{ id: number; slug: string }>`
      insert into group_posts (group_id, user_id, title, summary, content, hero_image_url)
      values (${gid}, ${String(me.id)}, ${title}, ${summary}, ${content}, ${hero_image_url})
      returning id, slug
    `;

    return NextResponse.json({ ok: true, id: rows[0].id, slug: rows[0].slug });
  } catch (err) {
    console.error('[groups/:id/posts] POST error', err);
    return bad('Interner Fehler', 500);
  }
}
