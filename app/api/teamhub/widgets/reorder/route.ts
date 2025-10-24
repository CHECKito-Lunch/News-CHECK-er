/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// POST: Widget-Reihenfolge aktualisieren
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const body = await request.json();
  const { widgets } = body;

  if (!Array.isArray(widgets) || widgets.length === 0) {
    return NextResponse.json(
      { error: 'widgets Array ist erforderlich' },
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

  // Hole erstes Widget, um team_id zu bekommen
  const { data: firstWidget } = await supabase
    .from('team_widgets')
    .select('team_id')
    .eq('id', widgets[0].id)
    .single();

  if (!firstWidget) {
    return NextResponse.json(
      { error: 'Widget nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Teamleiter-Status
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', firstWidget.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Nur Teamleiter können Widget-Reihenfolge ändern' },
      { status: 403 }
    );
  }

  // Update positions
  try {
    const updates = widgets.map((w: any) =>
      supabase
        .from('team_widgets')
        .update({ position: w.position })
        .eq('id', w.id)
        .eq('team_id', firstWidget.team_id) // Sicherheit: nur eigene Team-Widgets
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Fehler beim Aktualisieren' },
      { status: 500 }
    );
  }
}
