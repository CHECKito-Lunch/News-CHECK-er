// app/api/admin/badges/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// ID sicher aus der URL (/api/admin/badges/[id]) lesen
function getId(req: NextRequest): number {
  const last = req.nextUrl.pathname.split('/').pop() || '';
  const id = Number(last);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid id');
  return id;
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v.trim());
}

export async function PATCH(req: NextRequest) {
  try {
    const id = getId(req);
    const raw = (await req.json().catch(() => ({}))) as {
      name?: unknown; color?: unknown; kind?: unknown;
    };

    const patch: Record<string, unknown> = {};

    if (typeof raw.name === 'string') {
      const v = raw.name.trim();
      if (!v) return NextResponse.json({ error: 'name darf nicht leer sein.' }, { status: 400 });
      patch.name = v;
    }
    if (raw.color !== undefined) {
      if (raw.color === null || raw.color === '') {
        patch.color = null;
      } else if (isHexColor(raw.color)) {
        const s = String(raw.color).trim();
        patch.color = s.startsWith('#') ? s : `#${s}`;
      } else {
        return NextResponse.json({ error: 'color muss ein 6-stelliger Hex-Wert sein.' }, { status: 400 });
      }
    }
    if (raw.kind !== undefined) {
      patch.kind = raw.kind === null || raw.kind === '' ? null : String(raw.kind);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { error } = await db.from(T.badges).update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = getId(req);
    const db = supabaseAdmin();

    const { error } = await db.from(T.badges).delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
