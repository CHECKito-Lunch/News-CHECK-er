import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// POST: Kommentar zu einem Thread hinzufügen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await supabaseServer();
  const threadId = params.id;
  const body = await request.json();
  const { content, parent_id = null } = body;

  if (!content || content.trim() === '') {
    return NextResponse.json(
      { error: 'content ist erforderlich' },
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

  // Hole Thread und prüfe ob er gesperrt ist
  const { data: thread } = await supabase
    .from('team_threads')
    .select('team_id, locked')
    .eq('id', threadId)
    .single();

  if (!thread) {
    return NextResponse.json(
      { error: 'Thread nicht gefunden' },
      { status: 404 }
    );
  }

  if (thread.locked) {
    return NextResponse.json(
      { error: 'Thread ist gesperrt' },
      { status: 403 }
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

  // Erstelle Kommentar
  const { data: comment, error } = await supabase
    .from('team_thread_comments')
    .insert({
      thread_id: threadId,
      user_id: user.id,
      content,
      parent_id
    })
    .select(`
      *,
      author:users!team_thread_comments_user_id_fkey(id, email, raw_user_meta_data)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update Thread updated_at
  await supabase
    .from('team_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId);

  // Erstelle Unread-Notifications für andere Mitglieder
  await createUnreadNotification(
    supabase,
    thread.team_id,
    user.id,
    'thread_comment',
    comment.id
  );

  return NextResponse.json({ data: comment }, { status: 201 });
}

// Helper: Unread-Notifications
async function createUnreadNotification(
  supabase: any,
  teamId: string,
  authorId: string,
  type: string,
  referenceId: number
) {
  const { data: members } = await supabase
    .from('team_memberships')
    .select('user_id')
    .eq('team_id', teamId)
    .neq('user_id', authorId);

  if (members && members.length > 0) {
    const unreadEntries = members.map(m => ({
      user_id: m.user_id,
      reference_type: type,
      reference_id: referenceId,
      created_at: new Date().toISOString()
    }));

    await supabase.from('unread').insert(unreadEntries);
  }
}
