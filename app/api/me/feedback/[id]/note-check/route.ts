// app/api/me/feedback/[id]/note-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

// 2. Argument NICHT streng typisieren -> Next prüft nur Form, nicht TS-Typ
export async function POST(req: NextRequest, context: any) {
  const me = await requireUser(req).catch(() => null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const idStr = context?.params?.id;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const checked = !!body?.checked;

  // UUID aus dem Auth-Objekt holen
  const userUuid =
    (me as any)?.user?.user_id ??
    (me as any)?.user?.sub ??
    (me as any)?.sub ??
    null;

  if (!userUuid) {
    return NextResponse.json({ ok:false, error:'no_user_uuid' }, { status:400 });
  }

  await sql`
    update public.user_feedback
       set note_checked = ${checked}
     where id = ${id}
       and user_id = ${userUuid}::uuid
  `;

  return NextResponse.json({ ok:true, checked });
}
