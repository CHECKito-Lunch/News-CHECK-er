import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// POST: Poll schließen (nur Ersteller oder Teamleiter)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { id: pollId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Poll
  const { data: poll } = await supabase
    .from('team_polls')
    .select('team_id, created_by, is_closed')
    .eq('id', pollId)
    .single();

  if (!poll) {
    return NextResponse.json(
      { error: 'Poll nicht gefunden' },
      { status: 404 }
    );
  }

  if (poll.is_closed) {
    return NextResponse.json(
      { error: 'Poll ist bereits geschlossen' },
      { status: 400 }
    );
  }

  // Prüfe Berechtigung
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', poll.team_id)
    .eq('user_id', user.id)
    .single();

  const isCreator = poll.created_by === user.id;
  const isTeamLeader = membership?.is_teamleiter;

  if (!isCreator && !isTeamLeader) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Schließe Poll
  const { data, error } = await supabase
    .from('team_polls')
    .update({
      is_closed: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', pollId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    message: 'Poll erfolgreich geschlossen'
  });
}

// DELETE: Poll wieder öffnen (nur Teamleiter)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { id: pollId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Poll
  const { data: poll } = await supabase
    .from('team_polls')
    .select('team_id, created_by, is_closed')
    .eq('id', pollId)
    .single();

  if (!poll) {
    return NextResponse.json(
      { error: 'Poll nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Berechtigung (nur Teamleiter)
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', poll.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Nur Teamleiter können Polls wieder öffnen' },
      { status: 403 }
    );
  }

  // Öffne Poll wieder
  const { data, error } = await supabase
    .from('team_polls')
    .update({
      is_closed: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', pollId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    message: 'Poll wieder geöffnet'
  });
}
