import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// GET: Board mit allen Items
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await supabaseServer();
  const boardId = params.id;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert' },
      { status: 401 }
    );
  }

  // Hole Board
  const { data: board, error: boardError } = await supabase
    .from('team_boards')
    .select(`
      *,
      creator:users!team_boards_created_by_fkey(id, email, raw_user_meta_data)
    `)
    .eq('id', boardId)
    .single();

  if (boardError || !board) {
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

  // Hole alle Items
  const { data: items, error: itemsError } = await supabase
    .from('team_board_items')
    .select(`
      *,
      assigned_user:users!team_board_items_assigned_to_fkey(
        id, 
        email, 
        raw_user_meta_data
      ),
      creator:users!team_board_items_created_by_fkey(
        id, 
        email, 
        raw_user_meta_data
      )
    `)
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  if (itemsError) {
    return NextResponse.json(
      { error: itemsError.message },
      { status: 500 }
    );
  }

  // Gruppiere Items nach Spalten
  const itemsByColumn: Record<string, any[]> = {};
  board.columns.forEach((col: any) => {
    itemsByColumn[col.id] = [];
  });

  items?.forEach(item => {
    if (itemsByColumn[item.column_id]) {
      itemsByColumn[item.column_id].push(item);
    }
  });

  return NextResponse.json({
    board,
    items: itemsByColumn,
    allItems: items
  });
}

// PUT: Board aktualisieren (nur Teamleiter)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await supabaseServer();
  const boardId = params.id;
  const body = await request.json();
  const { name, description, columns } = body;

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

  // Prüfe Teamleiter-Status
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', board.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Nur Teamleiter können Boards bearbeiten' },
      { status: 403 }
    );
  }

  // Update-Objekt
  const updateData: any = { updated_at: new Date().toISOString() };
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (columns !== undefined) updateData.columns = columns;

  const { data, error } = await supabase
    .from('team_boards')
    .update(updateData)
    .eq('id', boardId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE: Board löschen (nur Teamleiter)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await supabaseServer();
  const boardId = params.id;

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

  // Prüfe Teamleiter-Status
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('is_teamleiter')
    .eq('team_id', board.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership?.is_teamleiter) {
    return NextResponse.json(
      { error: 'Nur Teamleiter können Boards löschen' },
      { status: 403 }
    );
  }

  // Lösche Board (Items werden durch CASCADE gelöscht)
  const { error } = await supabase
    .from('team_boards')
    .delete()
    .eq('id', boardId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
