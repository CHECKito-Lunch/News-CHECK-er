import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function GET(req: NextRequest) {
  const s = supabaseAdmin();

  // Query-Param sicher auslesen ohne new URL(...)
  const withMembers = req.nextUrl.searchParams.get('withMembers');

  const { data: groups, error } = await s
    .from(T.vendorGroups)
    .select('id,name')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // nur Gruppenliste
  if (!withMembers) {
    return NextResponse.json({ data: groups });
  }

  // Gruppen inkl. Mitglieder
  const { data: m, error: e2 } = await s
    .from(T.vendorGroupMembers)
    .select('group_id,vendor_id');

  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  const byGroup = new Map<number, number[]>();
  (m ?? []).forEach(row => {
    const arr = byGroup.get(row.group_id) ?? [];
    arr.push(row.vendor_id);
    byGroup.set(row.group_id, arr);
  });

  return NextResponse.json({
    data: (groups ?? []).map(g => ({ ...g, members: byGroup.get(g.id) ?? [] })),
  });
}

export async function POST(req: NextRequest) {
  const s = supabaseAdmin();
  const { name } = await req.json();

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const { data, error } = await s
    .from(T.vendorGroups)
    .insert({ name })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
