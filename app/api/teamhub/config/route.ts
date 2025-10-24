import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// GET: Lade die Team-Konfiguration
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

  // Authentifizierung prüfen
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Prüfe Team-Mitgliedschaft
  const { data: membership, error: memberError } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  if (memberError || !membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung für dieses Team' },
      { status: 403 }
    );
  }

  // Lade Konfiguration
  const { data: config, error } = await supabase
    .from('team_page_config')
    .select('*')
    .eq('team_id', teamId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = keine Zeile gefunden
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Default-Konfiguration, falls keine existiert
  const defaultConfig = {
    layout: {
      sections: [
        {
          id: 'main',
          widgets: [
            { type: 'announcement', config: { showPinned: true } },
            { type: 'threads', config: { limit: 10 } }
          ]
        },
        {
          id: 'sidebar',
          widgets: [
            { type: 'members', config: {} },
            { type: 'quick-links', config: {} }
          ]
        }
      ]
    },
    theme: {
      primary_color: '#3b82f6',
      show_badges: true
    }
  };

  return NextResponse.json({
    config: config || { ...defaultConfig, team_id: teamId }
  });
}

// PUT: Aktualisiere die Team-Konfiguration (nur Teamleiter)
export async function PUT(request: NextRequest) {
  const supabase = await supabaseServer();
  const body = await request.json();
  const { team_id, layout, theme } = body;

  if (!team_id) {
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

  // Prüfe Teamleiter-Status
  const { data: membership, error: memberError } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', team_id)
    .eq('user_id', user.id)
    .single();

  if (memberError || !membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Nur Teamleiter können die Konfiguration ändern' },
      { status: 403 }
    );
  }

  // Upsert Konfiguration
  const { data, error } = await supabase
    .from('team_page_config')
    .upsert({
      team_id,
      layout,
      theme,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'team_id'
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
