/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: Alle Polls für ein Team
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  const status = searchParams.get('status'); // 'active', 'closed', 'all'

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

  // Query bauen
  let query = supabase
    .from('team_polls')
    .select(`
      *,
      creator:users!team_polls_created_by_fkey(id, email, raw_user_meta_data),
      options:team_poll_options(
        id,
        option_text,
        position,
        votes:team_poll_votes(count)
      ),
      total_votes:team_poll_votes(count),
      user_vote:team_poll_votes!inner(option_id)
    `)
    .eq('team_id', teamId)
    .eq('user_vote.user_id', user.id);

  // Status-Filter
  if (status === 'active') {
    query = query.eq('is_closed', false);
  } else if (status === 'closed') {
    query = query.eq('is_closed', true);
  }

  query = query.order('created_at', { ascending: false });

  const { data: polls, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transformiere Daten für einfachere Nutzung
  const transformedPolls = polls?.map(poll => ({
    ...poll,
    options: poll.options?.map((opt: any) => ({
      ...opt,
      vote_count: opt.votes[0]?.count || 0
    })),
    total_votes: poll.total_votes[0]?.count || 0,
    user_has_voted: poll.user_vote?.length > 0,
    user_voted_option: poll.user_vote?.[0]?.option_id
  }));

  return NextResponse.json({ polls: transformedPolls });
}

// POST: Neuen Poll erstellen
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const body = await request.json();
  const { 
    team_id, 
    question, 
    description,
    options, // Array von Strings: ["Option 1", "Option 2", ...]
    allow_multiple = false,
    closes_at 
  } = body;

  if (!team_id || !question || !options || options.length < 2) {
    return NextResponse.json(
      { error: 'team_id, question und mindestens 2 options sind erforderlich' },
      { status: 400 }
    );
  }

  const { data: { user }, error: authError } = await (await supabase).auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Prüfe Mitgliedschaft (oder nur Teamleiter, wenn gewünscht)
  const { data: membership } = await (await supabase)
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Optional: Nur Teamleiter dürfen Polls erstellen
  // if (!membership.is_teamleiter) {
  //   return NextResponse.json(
  //     { error: 'Nur Teamleiter können Umfragen erstellen' },
  //     { status: 403 }
  //   );
  // }

  // Poll erstellen
  const { data: poll, error: pollError } = await (await supabase)
    .from('team_polls')
    .insert({
      team_id,
      question,
      description,
      allow_multiple,
      closes_at,
      created_by: user.id
    })
    .select()
    .single();

  if (pollError) {
    return NextResponse.json({ error: pollError.message }, { status: 500 });
  }

  // Optionen erstellen
  const pollOptions = options.map((optionText: string, index: number) => ({
    poll_id: poll.id,
    option_text: optionText,
    position: index
  }));

  const { data: createdOptions, error: optionsError } = await (await supabase)
    .from('team_poll_options')
    .insert(pollOptions)
    .select();

  if (optionsError) {
    // Rollback: Lösche Poll
    await (await supabase).from('team_polls').delete().eq('id', poll.id);
    return NextResponse.json({ error: optionsError.message }, { status: 500 });
  }

  // Erstelle Unread-Notifications
  await createUnreadNotification(supabase, team_id, user.id, 'poll', poll.id);

  return NextResponse.json({
    data: {
      ...poll,
      options: createdOptions
    }
  }, { status: 201 });
}

// Helper
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
    const unreadEntries = members.map((m: { user_id: any; }) => ({
      user_id: m.user_id,
      reference_type: type,
      reference_id: referenceId,
      created_at: new Date().toISOString()
    }));

    await supabase.from('unread').insert(unreadEntries);
  }
}
