// app/api/admin/vendor-groups/[id]/members/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

// Kleine Hilfsfunktion: Context → ID
function parseId(ctx: any): number | null {
  const idStr = ctx?.params?.id as string | undefined;
  const idNum = Number(idStr);
  return Number.isFinite(idNum) ? idNum : null;
}

// GET: Mitglieder einer Gruppe holen -> { vendorIds: number[] }
export async function GET(_req: Request, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.vendorGroupMembers)
    .select('vendor_id')
    .eq('group_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vendorIds = (data ?? []).map(r => r.vendor_id as number);
  return NextResponse.json({ vendorIds });
}

/**
 * POST: Mitglieder einer Gruppe setzen/überschreiben
 * Body: { vendorIds: number[] }
 * Vorgehen: Bestehende löschen, neue eintragen (idempotent, einfach).
 */
export async function POST(req: Request, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { vendorIds } = (await req.json()) as { vendorIds?: number[] };
  if (!Array.isArray(vendorIds)) {
    return NextResponse.json({ error: 'vendorIds must be an array' }, { status: 400 });
  }

  const s = supabaseAdmin();

  // erst alle Mitglieder der Gruppe entfernen
  const { error: delErr } = await s
    .from(T.vendorGroupMembers)
    .delete()
    .eq('group_id', id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // dann neu setzen (falls leer, ist die Gruppe danach leer – ok)
  if (vendorIds.length > 0) {
    const rows = vendorIds.map(vendorId => ({ group_id: id, vendor_id: vendorId }));
    const { error: upErr } = await s.from(T.vendorGroupMembers).upsert(rows);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
