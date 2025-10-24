/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// POST: Neues Item erstellen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: boardId } = await params;
  const body = await request.json();
  const {
    column_id,
    title,
    description,
    assigned_to,
    priority = 'medium',
    due_date,
    tags = []
  } = body;

  if (!column_id || !title) {
    return NextResponse.json(
      { error: 'column_id und title sind erforderlich' },
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

  // Hole Board
  const { data: board } = await supabase
    .from('team_boards')
    .select('team_id, columns')
    .eq('id', boardId)
    .single();

  if (!board) {
    return NextResponse.json(
      { error: 'Board nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe ob column_id existiert
  const columnExists = board.columns.some((col: any) => col.id === column_id);
  if (!columnExists) {
    return NextResponse.json(
      { error: 'Ungültige column_id' },
      { status: 400 }
    );
  }

  // Prüfe Mitgliedschaft
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', board.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Hole die maximale Position in dieser Spalte
  const { data: maxPosItem } = await supabase
    .from('team_board_items')
    .select('position')
    .eq('board_id', boardId)
    .eq('column_id', column_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const newPosition = (maxPosItem?.position || 0) + 1000;

  // Erstelle Item
  const { data: item, error } = await supabase
    .from('team_board_items')
    .insert({
      board_id: boardId,
      column_id,
      title,
      description,
      assigned_to,
      priority,
      due_date,
      tags,
      position: newPosition,
      created_by: user.id
    })
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

  return NextResponse.json({ data: item }, { status: 201 });
}

// PATCH: Item aktualisieren (Drag & Drop)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: boardId } = await params;
  const body = await request.json();
  const { items } = body; // Array von {id, column_id, position}

  if (!items || !Array.isArray(items)) {
    return NextResponse.json(
      { error: 'items Array ist erforderlich' },
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

  // Hole Board
  const { data: board } = await supabase
    .from('team_boards')
    .select('team_id')
    .eq('id', boardId)
    .single();

  if (!board) {
    return NextResponse.json(
      { error: 'Board nicht gefunden' },
      { status: 404 }
    );
  }

  // Prüfe Mitgliedschaft
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('team_id', board.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Keine Berechtigung' },
      { status: 403 }
    );
  }

  // Batch-Update für alle Items
  const updatePromises = items.map((item: any) =>
    supabase
      .from('team_board_items')
      .update({
        column_id: item.column_id,
        position: item.position,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id)
      .eq('board_id', boardId)
  );

  const results = await Promise.all(updatePromises);
  
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren einiger Items' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
