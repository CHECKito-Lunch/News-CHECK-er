import { NextResponse } from 'next/server';
import { q, isMember, isActiveGroup } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

export async function GET(req: Request, { params }: any) {
  try {
    const gid = Number(params?.groupId);
    if (!Number.isFinite(gid) || gid <= 0) return bad('Ungültige Gruppen-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    if (!(await isActiveGroup(gid))) return bad('Unbekannte oder inaktive Gruppe', 404);
    if (!(await isMember(String(me.id), gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
    const offset   = (page - 1) * pageSize;

    const rows = await q/*sql*/`
      SELECT p.id, p.slug, p.title, p.summary, p.created_at
        FROM group_posts p
       WHERE p.group_id = ${gid}
       ORDER BY p.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}
    `;

    return NextResponse.json({ ok: true, items: rows, page, pageSize });
  } catch (err) {
    console.error('[groups/:id/posts] GET error', err);
    return bad('Interner Fehler', 500);
  }
}
