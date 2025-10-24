import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// GET: Einzelnen Poll mit Details und Ergebnissen abrufen
export async function GET(
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

  // Hole Poll mit allen Details
  const { data: poll, error: pollError } = await supabase
    .from('team_polls')
    .select(`
      *,
      creator:users!team_polls_created_by_fkey(
        id, 
        email, 
        raw_user_meta_data
      )
    `)
    .eq('id', pollId)
    .single();

  if (pollError || !poll) {
    return NextResponse.json(
      { error: 'Poll nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Mitgliedschaft im Team
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

  // Hole alle Optionen mit Vote-Counts
  const { data: options, error: optionsError } = await supabase
    .from('team_poll_options')
    .select(`
      id,
      option_text,
      position,
      votes:team_poll_votes(count)
    `)
    .eq('poll_id', pollId)
    .order('position', { ascending: true });

  if (optionsError) {
    return NextResponse.json(
      { error: optionsError.message },
      { status: 500 }
    );
  }

  // Hole die Vote(s) des aktuellen Users
  const { data: userVotes } = await supabase
    .from('team_poll_votes')
    .select('option_id')
    .eq('poll_id', pollId)
    .eq('user_id', user.id);

  // Hole detaillierte Vote-Informationen für Teamleiter
  let detailedVotes = null;
  if (membership.is_teamleiter) {
    const { data: votes } = await supabase
      .from('team_poll_votes')
      .select(`
        id,
        option_id,
        created_at,
        voter:users!team_poll_votes_user_id_fkey(
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq('poll_id', pollId)
      .order('created_at', { ascending: false });

    detailedVotes = votes;
  }

  // Berechne Gesamtstimmen
  const totalVotes = options?.reduce(
    (sum, opt) => sum + (opt.votes[0]?.count || 0),
    0
  ) || 0;

  // Transformiere Optionen
  const transformedOptions = options?.map(opt => ({
    id: opt.id,
    option_text: opt.option_text,
    position: opt.position,
    vote_count: opt.votes[0]?.count || 0,
    percentage: totalVotes > 0 
      ? Math.round((opt.votes[0]?.count || 0) / totalVotes * 100) 
      : 0
  }));

  return NextResponse.json({
    poll: {
      ...poll,
      options: transformedOptions,
      total_votes: totalVotes,
      user_has_voted: userVotes && userVotes.length > 0,
      user_voted_options: userVotes?.map(v => v.option_id) || [],
      detailed_votes: detailedVotes // Nur für Teamleiter
    }
  });
}

// PUT: Poll aktualisieren (nur Ersteller oder Teamleiter)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { id: pollId } = await params;
  const body = await request.json();
  const { question, description, closes_at, is_closed } = body;

  const { data: { user }, error: authError } = await supabase
