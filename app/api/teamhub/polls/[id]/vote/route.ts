import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// POST: Abstimmen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await supabaseServer();
  const pollId = params.id;
  const body = await request.json();
  const { option_ids } = body; // Array für Multiple-Choice, sonst [single_id]

  if (!option_ids || !Array.isArray(option_ids) || option_ids.length === 0) {
    return NextResponse.json(
      { error: 'option_ids ist erforderlich' },
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

  // Hole Poll
  const { data: poll, error: pollError } = await supabase
    .from('team_polls')
    .select('*, team_id, allow_multiple, is_closed')
    .eq('id', pollId)
    .single();

  if (pollError || !poll) {
    return NextResponse.json(
      { error: 'Poll nicht gefunden' },
      { status: 404 }
    );
  }

  if (poll.is_closed) {
    return NextResponse.json(
      { error: 'Poll ist geschlossen' },
      { status: 400 }
    );
  }

  // Prüfe ob closes_at abgelaufen ist
  if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
    return NextResponse.json(
      { error: 'Poll ist abgelaufen' },
      { status: 400 }
    );
  }

  // Prüfe Mitgliedschaft
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', poll.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Prüfe Multiple-Choice
  if (!poll.allow_multiple && option_ids.length > 1) {
    return NextResponse.json(
      { error: 'Nur eine Option erlaubt' },
      { status: 400 }
    );
  }

  // Prüfe ob User schon abgestimmt hat
  const { data: existingVotes } = await supabase
    .from('team_poll_votes')
    .select('*')
    .eq('poll_id', pollId)
    .eq('user_id', user.id);

  if (existingVotes && existingVotes.length > 0) {
    // Lösche alte Votes (User kann Meinung ändern)
    await supabase
      .from('team_poll_votes')
      .delete()
      .eq('poll_id', pollId)
      .eq('user_id', user.id);
  }

  // Erstelle neue Votes
  const votes = option_ids.map((optionId: number) => ({
    poll_id: parseInt(pollId),
    option_id: optionId,
    user_id: user.id
  }));

  const { data: newVotes, error: voteError } = await supabase
    .from('team_poll_votes')
    .insert(votes)
    .select();

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 500 });
  }

  return NextResponse.json({ data: newVotes });
}

// DELETE: Vote zurückziehen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await supabaseServer();
  const pollId = params.id;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  const { error } = await supabase
    .from('team_poll_votes')
    .delete()
    .eq('poll_id', pollId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
