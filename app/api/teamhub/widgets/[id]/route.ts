/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// PUT: Widget aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { id: widgetId } = await params;
  const body = await request.json();
  const { config, position, is_active } = body;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Widget und prüfe Team-Berechtigung
  const { data: widget } = await supabase
    .from('team_widgets')
    .select('team_id')
    .eq('id', widgetId)
    .single();

  if (!widget) {
    return NextResponse.json(
      { error: 'Widget nicht gefunden' },
      { status: 404 }
    );
  }

  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', widget.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Update Widget
  const updateData: any = {};
  if (config !== undefined) updateData.config = config;
  if (position !== undefined) updateData.position = position;
  if (is_active !== undefined) updateData.is_active = is_active;

  const { data, error } = await supabase
    .from('team_widgets')
    .update(updateData)
    .eq('id', widgetId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE: Widget löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { id: widgetId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Widget und prüfe Berechtigung
  const { data: widget } = await supabase
    .from('team_widgets')
    .select('team_id')
    .eq('id', widgetId)
    .single();

  if (!widget) {
    return NextResponse.json(
      { error: 'Widget nicht gefunden' },
      { status: 404 }
    );
  }

  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', widget.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('team_widgets')
    .delete()
    .eq('id', widgetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
