/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// PUT: Item aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: { boardId: string; itemId: string } }
) {
  const supabase = createClient();
  const { boardId, itemId } = params;
  const body = await request.json();
  const {
    title,
    description,
    assigned_to,
    priority,
    due_date,
    tags,
    column_id
  } = body;

  const { data: { user }, error: authError } = await (await supabase).auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Item
  const { data: item } = await (await supabase)
    .from('team_board_items')
    .select('board_id')
    .eq('id', itemId)
    .eq('board_id', boardId)
    .single();

  if (!item) {
    return NextResponse.json(
      { error: 'Item nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Berechtigung über Board
  const { data: board } = await (await supabase)
    .from('team_boards')
    .select('team_id')
    .eq('id', boardId)
    .single();

  const { data: membership } = await (await supabase)
    .from('team_memberships')
    .select('*')
    .eq('team_id', board?.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Update-Objekt
  const updateData: any = { updated_at: new Date().toISOString() };
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
  if (priority !== undefined) updateData.priority = priority;
  if (due_date !== undefined) updateData.due_date = due_date;
  if (tags !== undefined) updateData.tags = tags;
  if (column_id !== undefined) updateData.column_id = column_id;

  const { data, error } = await (await supabase)
    .from('team_board_items')
    .update(updateData)
    .eq('id', itemId)
    .select(`
      *,
      assigned_user:auth.users!team_board_items_assigned_to_fkey(
        id, email, raw_user_meta_data
      ),
      creator:auth.users!team_board_items_created_by_fkey(
        id, email, raw_user_meta_data
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE: Item löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: { boardId: string; itemId: string } }
) {
  const supabase = await createClient();
  const { boardId, itemId } = params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Item
  const { data: item } = await supabase
    .from('team_board_items')
    .select('board_id, created_by')
    .eq('id', itemId)
    .eq('board_id', boardId)
    .single();

  if (!item) {
    return NextResponse.json(
      { error: 'Item nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Berechtigung
  const { data: board } = await supabase
    .from('team_boards')
    .select('team_id')
    .eq('id', boardId)
    .single();

  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', board?.team_id)
    .eq('user_id', user.id)
    .single();

  // Nur Ersteller oder Teamleiter können löschen
  const isCreator = item.created_by === user.id;
  const isTeamLeader = membership?.is_teamleiter;

  if (!isCreator && !isTeamLeader) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('team_board_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
