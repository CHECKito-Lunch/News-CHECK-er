/* eslint-disable @typescript-eslint/no-explicit-any */
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
    console.log('[group-posts/:id/comments GET] Start');
    
    const postId = Number(context?.params?.postId);
    console.log('[group-posts/:id/comments GET] postId:', postId);
    
    if (!Number.isFinite(postId) || postId <= 0) {
      console.log('[group-posts/:id/comments GET] Invalid postId');
      return bad('Ungültige Post-ID', 400);
    }

    const me = await getUserFromRequest(req);
    console.log('[group-posts/:id/comments GET] User:', JSON.stringify(me, null, 2));
    
    if (!me?.id) {
      console.log('[group-posts/:id/comments GET] User not authenticated');
      return bad('Nicht angemeldet', 401);
    }

    const gid = await getGroupIdForPost(postId);
    console.log('[group-posts/:id/comments GET] groupId:', gid);
    
    if (!gid) {
      console.log('[group-posts/:id/comments GET] Post not found');
      return bad('Post unbekannt', 404);
    }

    const isActive = await isActiveGroup(gid);
    console.log('[group-posts/:id/comments GET] isActiveGroup:', isActive);
    
    if (!isActive) {
      console.log('[group-posts/:id/comments GET] Group not active');
      return bad('Unbekannte oder inaktive Gruppe', 404);
    }

    const userId = String(me.id);
    console.log('[group-posts/:id/comments GET] Checking membership for userId:', userId, 'groupId:', gid);
    
    const memberCheck = await isMember(userId, gid);
    console.log('[group-posts/:id/comments GET] isMember result:', memberCheck);
    
    if (!memberCheck) {
      console.log('[group-posts/:id/comments GET] User is not a member of the group');
      return bad('Kein Zugriff auf diese Gruppe', 403);
    }

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

    console.log('[group-posts/:id/comments GET] Found comments:', items.length);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error('[group-posts/:id/comments] GET error', err);
    return bad('Interner Fehler', 500);
  }
}

/** POST: Kommentar anlegen */
export async function POST(req: Request, context: any) {
  try {
    console.log('[group-posts/:id/comments POST] Start');
    
    const postId = Number(context?.params?.postId);
    console.log('[group-posts/:id/comments POST] postId:', postId);
    
    if (!Number.isFinite(postId) || postId <= 0) {
      console.log('[group-posts/:id/comments POST] Invalid postId');
      return bad('Ungültige Post-ID', 400);
    }

    const me = await getUserFromRequest(req);
    console.log('[group-posts/:id/comments POST] User:', JSON.stringify(me, null, 2));
    
    if (!me?.id) {
      console.log('[group-posts/:id/comments POST] User not authenticated');
      return bad('Nicht angemeldet', 401);
    }

    const gid = await getGroupIdForPost(postId);
    console.log('[group-posts/:id/comments POST] groupId:', gid);
    
    if (!gid) {
      console.log('[group-posts/:id/comments POST] Post not found');
      return bad('Post unbekannt', 404);
    }

    const isActive = await isActiveGroup(gid);
    console.log('[group-posts/:id/comments POST] isActiveGroup:', isActive);
    
    if (!isActive) {
      console.log('[group-posts/:id/comments POST] Group not active');
      return bad('Unbekannte oder inaktive Gruppe', 404);
    }

    const userId = String(me.id);
    console.log('[group-posts/:id/comments POST] Checking membership for userId:', userId, 'groupId:', gid);
    
    const memberCheck = await isMember(userId, gid);
    console.log('[group-posts/:id/comments POST] isMember result:', memberCheck);
    
    if (!memberCheck) {
      console.log('[group-posts/:id/comments POST] User is not a member of the group');
      return bad('Kein Zugriff auf diese Gruppe', 403);
    }

    const body = await req.json().catch(() => ({}));
    const content = String(body?.content ?? '').trim();
    console.log('[group-posts/:id/comments POST] content length:', content.length);
    
    if (!content) {
      console.log('[group-posts/:id/comments POST] Empty content');
      return bad('Inhalt fehlt', 400);
    }

    const rows = await query<{ id: number }>`
      insert into group_post_comments (post_id, user_id, content)
      values (${postId}, ${userId}::uuid, ${content})
      returning id
    `;
    
    console.log('[group-posts/:id/comments POST] Comment created with id:', rows[0].id);
    return NextResponse.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[group-posts/:id/comments] POST error', err);
    return bad('Interner Fehler', 500);
  }
}

/** DELETE: eigenen Kommentar löschen (per ?id=) */
export async function DELETE(req: Request, context: any) {
  try {
    console.log('[group-posts/:id/comments DELETE] Start');
    
    const postId = Number(context?.params?.postId);
    const { searchParams } = new URL(req.url);
    const commentId = Number(searchParams.get('id') ?? '0');
    
    console.log('[group-posts/:id/comments DELETE] postId:', postId, 'commentId:', commentId);
    
    if (!Number.isFinite(postId) || !Number.isFinite(commentId) || commentId <= 0) {
      console.log('[group-posts/:id/comments DELETE] Invalid IDs');
      return bad('Ungültige IDs', 400);
    }

    const me = await getUserFromRequest(req);
    console.log('[group-posts/:id/comments DELETE] User:', JSON.stringify(me, null, 2));
    
    if (!me?.id) {
      console.log('[group-posts/:id/comments DELETE] User not authenticated');
      return bad('Nicht angemeldet', 401);
    }

    const gid = await getGroupIdForPost(postId);
    console.log('[group-posts/:id/comments DELETE] groupId:', gid);
    
    if (!gid) {
      console.log('[group-posts/:id/comments DELETE] Post not found');
      return bad('Post unbekannt', 404);
    }

    const userId = String(me.id);
    console.log('[group-posts/:id/comments DELETE] Checking membership for userId:', userId, 'groupId:', gid);
    
    const memberCheck = await isMember(userId, gid);
    console.log('[group-posts/:id/comments DELETE] isMember result:', memberCheck);
    
    if (!memberCheck) {
      console.log('[group-posts/:id/comments DELETE] User is not a member of the group');
      return bad('Kein Zugriff auf diese Gruppe', 403);
    }

    const owner = await query<{ user_id: string }>`
      select user_id from group_post_comments where id = ${commentId} and post_id = ${postId} limit 1
    `;
    
    console.log('[group-posts/:id/comments DELETE] Comment owner:', owner[0]?.user_id, 'Current user:', userId);
    
    if (!owner.length) {
      console.log('[group-posts/:id/comments DELETE] Comment not found');
      return bad('Kommentar nicht gefunden', 404);
    }
    
    if (owner[0].user_id !== userId) {
      console.log('[group-posts/:id/comments DELETE] User is not the comment owner');
      return bad('Nur eigene Kommentare können gelöscht werden', 403);
    }

    await query`delete from group_post_comments where id = ${commentId}`;
    console.log('[group-posts/:id/comments DELETE] Comment deleted successfully');
    
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[group-posts/:id/comments] DELETE error', err);
    return bad('Interner Fehler', 500);
  }
}
