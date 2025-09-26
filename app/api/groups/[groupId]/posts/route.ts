// app/api/groups/[groupId]/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { q, isMember, isActiveGroup } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function GET(req: NextRequest, ctx: { params: { groupId: string } }) {
  try {
    const gid = Number(ctx.params.groupId);
    if (!Number.isFinite(gid) || gid <= 0) return bad('Ungültige Gruppen-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const active = await isActiveGroup(gid);
    if (!active) return bad('Unbekannte oder inaktive Gruppe', 404);

    const allowed = await isMember(String(me.id), gid);
    if (!allowed) return bad('Kein Zugriff auf diese Gruppe', 403);

    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
    const offset   = (page - 1) * pageSize;

    const { rows: items } = await q<any>`
      select p.id, p.slug, p.title, p.summary, p.created_at
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
