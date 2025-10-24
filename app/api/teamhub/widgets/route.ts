import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// GET: Alle Widgets für ein Team abrufen
export async function GET(request: NextRequest) {
  const supabase = await supabaseServer();
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

  // Lade aktive Widgets
  const { data: widgets, error } = await supabase
    .from('team_widgets')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ widgets });
}

// POST: Neues Widget erstellen (nur Teamleiter)
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const body = await request.json();
  const { team_id, widget_type, config, position } = body;

  if (!team_id || !widget_type || !config) {
    return NextResponse.json(
      { error: 'team_id, widget_type und config sind erforderlich' },
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
      { error: 'Nur Teamleiter können Widgets hinzufügen' },
      { status: 403 }
    );
  }

  // Widget erstellen
  const { data, error } = await supabase
    .from('team_widgets')
    .insert({
      team_id,
      widget_type,
      config,
      position: position || 0,
      created_by: user.id
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
