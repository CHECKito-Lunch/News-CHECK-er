/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: Alle Threads für ein Team
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const pinned = searchParams.get('pinned'); // 'true' oder null
  
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
    .from('team_threads')
    .select(`*`, { count: 'exact' })
    .eq('team_id', teamId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  // Filter für gepinnte Threads
  if (pinned === 'true') {
    query = query.eq('pinned', true);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data: threads, error, count } = await query;

  if (error) {
    console.error('[Threads GET] Error:', error);
    return NextResponse.json({ error: error.message, details: error }, { status: 500 });
  }

  return NextResponse.json({
    threads,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  });
}

// POST: Neuen Thread erstellen
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { team_id, title, content, pinned = false } = body;

  if (!team_id || !title) {
    return NextResponse.json(
      { error: 'team_id und title sind erforderlich' },
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

  // Nur Teamleiter dürfen Threads pinnen
  const canPin = membership.is_teamleiter && pinned;

  // Thread erstellen
  const { data, error } = await supabase
    .from('team_threads')
    .insert({
      team_id,
      title,
      content,
      author_id: user.id,
      pinned: canPin
    })
    .select(`
      *,
      author:users!team_threads_author_id_fkey(id, email, raw_user_meta_data)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Markiere als ungelesen für andere Team-Mitglieder
  await createUnreadNotification(supabase, team_id, user.id, 'thread', data.id);

  return NextResponse.json({ data }, { status: 201 });
}

// Helper: Unread-Notifications erstellen
async function createUnreadNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  authorId: string,
  type: string,
  referenceId: number
) {
  // Hole alle Team-Mitglieder außer dem Autor
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
