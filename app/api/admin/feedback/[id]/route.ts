// app/api/admin/feedback/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

function getIdFromUrl(url: string): number | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const id = Number(parts[parts.length - 1]);
    return Number.isFinite(id) ? id : null;
  } catch { return null; }
}


// helper: macht aus undefined => null
const nn = <T>(v: T | undefined | null): T | null => (v === undefined ? null : v);

export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const id = getIdFromUrl(req.url);
  if (!id) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  let b: any = {};
  try { b = await req.json(); } catch {}

  // 💡 Wichtig: überall nn() verwenden → niemals undefined in SQL!
  const channel         = nn<string>(b.channel);
  const rating_overall  = nn<number>(b.rating_overall);
  const rating_friend   = nn<number>(b.rating_friend);
  const rating_qual     = nn<number>(b.rating_qual);
  const rating_offer    = nn<number>(b.rating_offer);
  const comment_raw     = nn<string>(b.comment_raw);
  const template_name   = nn<string>(b.template_name);
  const reklamation     = nn<boolean>(b.reklamation);
  const resolved        = nn<boolean>(b.resolved);
  const note            = nn<string>(b.note);

  await sql`
    update public.user_feedback set
      channel        = coalesce(${channel}::text,        channel),
      rating_overall = coalesce(${rating_overall}::int,  rating_overall),
      rating_friend  = coalesce(${rating_friend}::int,   rating_friend),
      rating_qual    = coalesce(${rating_qual}::int,     rating_qual),
      rating_offer   = coalesce(${rating_offer}::int,    rating_offer),
      comment_raw    = coalesce(${comment_raw}::text,    comment_raw),
      template_name  = coalesce(${template_name}::text,  template_name),
      reklamation    = coalesce(${reklamation}::boolean, reklamation),
      resolved       = coalesce(${resolved}::boolean,    resolved),
      note           = coalesce(${note}::text,           note)
    where id = ${id}
  `;

  return NextResponse.json({ ok:true });
}