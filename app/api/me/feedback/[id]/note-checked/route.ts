// app/api/me/feedback/[id]/note-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireUser(req).catch(() => null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  let body:any = {};
  try { body = await req.json(); } catch {}
  const checked = !!body?.checked;

  // Sicherheit: nur eigene Feedbacks
  await sql`
    update public.user_feedback
       set note_checked = ${checked}
     where id = ${id} and user_id = ${Number(me.user?.id ?? me.user?.sub ?? me.sub)}
  `;

  return NextResponse.json({ ok:true, checked });
}
