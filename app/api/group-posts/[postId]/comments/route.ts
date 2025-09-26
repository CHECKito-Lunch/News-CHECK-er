// app/api/group-posts/[postId]/comments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { q, pool, isMember } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

async function getGroupIdForPost(postId: number): Promise<number | null> {
  const res = await q<{ group_id: number }>`
    SELECT group_id FROM group_posts WHERE id = ${postId} LIMIT 1
  `;
  return res.rows[0]?.group_id ?? null;
}

export async function GET(req: NextRequest, ctx: { params: { postId: string } }) {
  try {
    const postId = Number(ctx.params.postId);
    if (!Number.isFinite(postId) || postId <= 0) return bad('Ungültige Post-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const groupId = await getGroupIdForPost(postId);
    if (!groupId) return bad('Post nicht gefunden', 404);

    const allowed = await isMember(String(me.id), groupId);
    if (!allowed) return bad('Kein Zugriff auf diese Gruppe', 403);

    const { rows: items } = await pool.query(`
      SELECT c.id, c.post_id, c.user_id, c.body, c.created_at
      FROM group_post_comments c
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `, [postId]);

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error('[group-posts/:id/comments] GET error', err);
    return bad('Interner Fehler', 500);
  }
}

export async function POST(req: NextRequest, ctx: { params: { postId: string } }) {
  try {
    const postId = Number(ctx.params.postId);
    if (!Number.isFinite(postId) || postId <= 0) return bad('Ungültige Post-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const groupId = await getGroupIdForPost(postId);
    if (!groupId) return bad('Post nicht gefunden', 404);

    const allowed = await isMember(String(me.id), groupId);
    if (!allowed) return bad('Kein Zugriff auf diese Gruppe', 403);

    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? '').toString().trim();
    if (!text) return bad('Kommentar fehlt', 400);

    const { rows } = await pool.query(`
      INSERT INTO group_post_comments (post_id, user_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, post_id, user_id, body, created_at
    `, [postId, String(me.id), text]);

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[group-posts/:id/comments] POST error', err);
    return bad('Interner Fehler', 500);
  }
}
