// app/api/group-posts/[postId]/comments/route.ts
import { NextResponse } from 'next/server';
import { isActiveGroup, isMember, query } from '@/lib/groups';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

/** ermittelt die group_id zu einem Post (Sicherheitscheck) */
async function getGroupIdForPost(postId: number): Promise<number | null> {
  const rows = await query<{ group_id: number }>`
    select group_id from group_posts where id = ${postId} limit 1
  `;
  return rows[0]?.group_id ?? null;
}

/** GET: Kommentare lesen */
export async function GET(req: Request, context: any) {
  try {
    const postId = Number(context?.params?.postId);
    if (!Number.isFinite(postId) || postId <= 0) return bad('Ungültige Post-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const gid = await getGroupIdForPost(postId);
    if (!gid) return bad('Post unbekannt', 404);

    if (!(await isActiveGroup(gid))) return bad('Unbekannte oder inaktive Gruppe', 404);
    if (!(await isMember(String(me.id), gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const items = await query<{
      id: number;
      post_id: number;
      user_id: string;
      content: string;
      created_at: string;
    }>`
      select id, post_id, user_id, content, created_at
      from group_post_comments
      where post_id = ${postId}
      order by created_at asc
    `;

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error('[group-posts/:id/comments] GET error', err);
    return bad('Interner Fehler', 500);
  }
}

/** POST: Kommentar anlegen */
export async function POST(req: Request, context: any) {
  try {
    const postId = Number(context?.params?.postId);
    if (!Number.isFinite(postId) || postId <= 0) return bad('Ungültige Post-ID', 400);

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const gid = await getGroupIdForPost(postId);
    if (!gid) return bad('Post unbekannt', 404);

    if (!(await isActiveGroup(gid))) return bad('Unbekannte oder inaktive Gruppe', 404);
    if (!(await isMember(String(me.id), gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const body = await req.json().catch(() => ({}));
    const content = String(body?.content ?? '').trim();
    if (!content) return bad('Inhalt fehlt', 400);

    const rows = await query<{ id: number }>`
      insert into group_post_comments (post_id, user_id, content)
      values (${postId}, ${String(me.id)}, ${content})
      returning id
    `;
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[group-posts/:id/comments] POST error', err);
    return bad('Interner Fehler', 500);
  }
}

/** DELETE: eigenen Kommentar löschen (per ?id=) */
export async function DELETE(req: Request, context: any) {
  try {
    const postId = Number(context?.params?.postId);
    const { searchParams } = new URL(req.url);
    const commentId = Number(searchParams.get('id') ?? '0');
    if (!Number.isFinite(postId) || !Number.isFinite(commentId) || commentId <= 0) {
      return bad('Ungültige IDs', 400);
    }

    const me = await getUserFromRequest(req);
    if (!me?.id) return bad('Nicht angemeldet', 401);

    const gid = await getGroupIdForPost(postId);
    if (!gid) return bad('Post unbekannt', 404);
    if (!(await isMember(String(me.id), gid))) return bad('Kein Zugriff auf diese Gruppe', 403);

    const owner = await query<{ user_id: string }>`
      select user_id from group_post_comments where id = ${commentId} and post_id = ${postId} limit 1
    `;
    if (!owner.length) return bad('Kommentar nicht gefunden', 404);
    if (owner[0].user_id !== String(me.id)) return bad('Nur eigene Kommentare können gelöscht werden', 403);

    await query`delete from group_post_comments where id = ${commentId}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[group-posts/:id/comments] DELETE error', err);
    return bad('Interner Fehler', 500);
  }
}
