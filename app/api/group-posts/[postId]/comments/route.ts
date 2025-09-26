import { NextResponse } from 'next/server';
import { q, isMember } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

async function getGroupIdForPost(postId: number): Promise<number | null> {
  const rows = await q/*sql*/`
    SELECT group_id
      FROM group_posts
     WHERE id = ${postId}
     LIMIT 1
  `;
  return rows?.[0]?.group_id ?? null;
}

export async function GET(req: Request, { params }: any) {
  try {
    const postId = Number(params?.postId);
    if (!Number.isFinite(postId) || postId <= 0) return bad('Ungültige Post-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const groupId = await getGroupIdForPost(postId);
    if (!groupId) return bad('Post nicht gefunden', 404);

    if (!(await isMember(String(me.id), groupId))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const rows = await q/*sql*/`
      SELECT c.id, c.post_id, c.user_id, c.body, c.created_at
        FROM group_post_comments c
       WHERE c.post_id = ${postId}
       ORDER BY c.created_at ASC
    `;

    return NextResponse.json({ ok: true, items: rows });
  } catch (err) {
    console.error('[group-posts/:id/comments] GET error', err);
    return bad('Interner Fehler', 500);
  }
}

export async function POST(req: Request, { params }: any) {
  try {
    const postId = Number(params?.postId);
    if (!Number.isFinite(postId) || postId <= 0) return bad('Ungültige Post-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const groupId = await getGroupIdForPost(postId);
    if (!groupId) return bad('Post nicht gefunden', 404);

    if (!(await isMember(String(me.id), groupId))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? '').toString().trim();
    if (!text) return bad('Kommentar fehlt', 400);

    const rows = await q/*sql*/`
      INSERT INTO group_post_comments (post_id, user_id, body)
      VALUES (${postId}, ${String(me.id)}, ${text})
      RETURNING id, post_id, user_id, body, created_at
    `;

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[group-posts/:id/comments] POST error', err);
    return bad('Interner Fehler', 500);
  }
}
