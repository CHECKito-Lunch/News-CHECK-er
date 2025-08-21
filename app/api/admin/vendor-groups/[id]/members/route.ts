import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const groupId = Number(params.id);
  const { vendor_id } = await req.json();
  const { error } = await s.from(T.vendorGroupMembers).insert({ group_id: groupId, vendor_id: Number(vendor_id) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const s = supabaseAdmin();
  const groupId = Number(params.id);
  const { vendor_id } = await req.json();
  const { error } = await s.from(T.vendorGroupMembers).delete().eq('group_id', groupId).eq('vendor_id', Number(vendor_id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
