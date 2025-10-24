/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: Alle Boards für ein Team
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    return NextResponse.json(
      { error: 'team_id ist erforderlich' },
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

  // Prüfe Mitgliedschaft
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Hole alle Boards
  const { data: boards, error } = await supabase
    .from('team_boards')
    .select(`*`)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Boards GET] Error:', error);
    return NextResponse.json({ error: error.message, details: error }, { status: 500 });
  }

  return NextResponse.json({ boards: boards || [] });
}

// POST: Neues Board erstellen (nur Teamleiter)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { team_id, name, description, columns } = body;

  if (!team_id || !name) {
    return NextResponse.json(
      { error: 'team_id und name sind erforderlich' },
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

  // Prüfe Teamleiter-Status
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Nur Teamleiter können Boards erstellen' },
      { status: 403 }
    );
  }

  // Default-Spalten, falls nicht angegeben
  const defaultColumns = [
    { id: 'backlog', name: 'Backlog', position: 0 },
    { id: 'todo', name: 'To Do', position: 1 },
    { id: 'in_progress', name: 'In Progress', position: 2 },
    { id: 'review', name: 'Review', position: 3 },
    { id: 'done', name: 'Done', position: 4 }
  ];

  // Board erstellen
  const { data, error } = await supabase
    .from('team_boards')
    .insert({
      team_id,
      name,
      description,
      columns: columns || defaultColumns,
      created_by: user.id
    })
    .select(`
      *,
      creator:users!team_boards_created_by_fkey(id, email, raw_user_meta_data)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Unread-Notification
  await createUnreadNotification(supabase, team_id, user.id, 'board', data.id);

  return NextResponse.json({ data }, { status: 201 });
}

// Helper
async function createUnreadNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
    const unreadEntries = members.map((m) => ({
      user_id: m.user_id,
      reference_type: type,
      reference_id: referenceId,
      created_at: new Date().toISOString()
    }));

    await supabase.from('unread').insert(unreadEntries);
  }
}
