/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// GET: Thread mit allen Kommentaren (verschachtelt)
export async function GET(
  request: NextRequest
) {
  const supabase = await supabaseServer();
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('id');

  if (!threadId) {
    return NextResponse.json(
      { error: 'thread id ist erforderlich' },
      { status: 400 }
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Thread
  const { data: thread, error: threadError } = await supabase
    .from('team_threads')
    .select(`
      *,
      author:users!team_threads_author_id_fkey(id, email, raw_user_meta_data)
    `)
    .eq('id', threadId)
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { error: 'Thread nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Mitgliedschaft
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', thread.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Hole alle Kommentare (flach)
  const { data: comments, error: commentsError } = await supabase
    .from('team_thread_comments')
    .select(`
      *,
      author:users!team_thread_comments_user_id_fkey(id, email, raw_user_meta_data)
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (commentsError) {
    return NextResponse.json(
      { error: commentsError.message },
      { status: 500 }
    );
  }

  // Baue verschachtelte Struktur
  const nestedComments = buildCommentTree(comments || []);

  // Markiere Thread als gelesen
  await supabase
    .from('unread')
    .delete()
    .eq('user_id', user.id)
    .eq('reference_type', 'thread')
    .eq('reference_id', threadId);

  return NextResponse.json({
    thread,
    comments: nestedComments,
    flatComments: comments || []
  });
}

// PUT: Thread aktualisieren (nur Autor oder Teamleiter)
export async function PUT(
  request: NextRequest
) {
  const supabase = await supabaseServer();
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('id');

  if (!threadId) {
    return NextResponse.json(
      { error: 'thread id ist erforderlich' },
      { status: 400 }
    );
  }
  const body = await request.json();
  const { title, content, pinned, locked } = body;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Thread
  const { data: thread } = await supabase
    .from('team_threads')
    .select('*, team_id, author_id')
    .eq('id', threadId)
    .single();

  if (!thread) {
    return NextResponse.json(
      { error: 'Thread nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Berechtigung
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', thread.team_id)
    .eq('user_id', user.id)
    .single();

  const isAuthor = thread.author_id === user.id;
  const isTeamLeader = membership?.is_teamleiter;

  if (!isAuthor && !isTeamLeader) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Update-Objekt bauen
  const updateData: any = { updated_at: new Date().toISOString() };
  if (title !== undefined && (isAuthor || isTeamLeader)) updateData.title = title;
  if (content !== undefined && (isAuthor || isTeamLeader)) updateData.content = content;
  if (pinned !== undefined && isTeamLeader) updateData.pinned = pinned;
  if (locked !== undefined && isTeamLeader) updateData.locked = locked;

  const { data, error } = await supabase
    .from('team_threads')
    .update(updateData)
    .eq('id', threadId)
    .select(`
      *,
      author:users!team_threads_author_id_fkey(id, email, raw_user_meta_data)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE: Thread löschen (nur Autor oder Teamleiter)
export async function DELETE(
  request: NextRequest
) {
  const supabase = await supabaseServer();
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('id');

  if (!threadId) {
    return NextResponse.json(
      { error: 'thread id ist erforderlich' },
      { status: 400 }
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Thread
  const { data: thread } = await supabase
    .from('team_threads')
    .select('team_id, author_id')
    .eq('id', threadId)
    .single();

  if (!thread) {
    return NextResponse.json(
      { error: 'Thread nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Berechtigung
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', thread.team_id)
    .eq('user_id', user.id)
    .single();

  const isAuthor = thread.author_id === user.id;
  const isTeamLeader = membership?.is_teamleiter;

  if (!isAuthor && !isTeamLeader) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Lösche Thread (Kommentare werden durch CASCADE gelöscht)
  const { error } = await supabase
    .from('team_threads')
    .delete()
    .eq('id', threadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Helper: Verschachtelte Kommentar-Struktur aufbauen
function buildCommentTree(comments: any[]): any[] {
  const commentMap = new Map();
  const roots: any[] = [];

  // Erstelle Map und initialisiere children
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, children: [] });
  });

  // Baue Baum auf
  comments.forEach(comment => {
    const node = commentMap.get(comment.id);
    if (comment.parent_id === null) {
      roots.push(node);
    } else {
      const parent = commentMap.get(comment.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent nicht gefunden -> mache es zum Root
        roots.push(node);
      }
    }
  });

  return roots;
}
