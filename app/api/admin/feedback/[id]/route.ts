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

export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const id = getIdFromUrl(req.url);
  if (!id) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  let b: any = {};
  try { b = await req.json(); } catch {}

  // Nur Felder updaten, die im Body vorhanden sind (undefined = ignorieren)
  const present = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  const channel         = present('channel')         ? (b.channel ?? null) : undefined;
  const rating_overall  = present('rating_overall')  ? (b.rating_overall ?? null) : undefined;
  const rating_friend   = present('rating_friend')   ? (b.rating_friend ?? null) : undefined;
  const rating_qual     = present('rating_qual')     ? (b.rating_qual ?? null) : undefined;
  const rating_offer    = present('rating_offer')    ? (b.rating_offer ?? null) : undefined;
  const comment_raw     = present('comment_raw')     ? (b.comment_raw ?? null) : undefined;
  const template_name   = present('template_name')   ? (b.template_name ?? null) : undefined;
  const reklamation     = present('reklamation')     ? (b.reklamation ?? null) : undefined;
  const resolved        = present('resolved')        ? (b.resolved ?? null) : undefined;
  const note            = present('note')            ? (b.note ?? null) : undefined;

  // Dynamisches UPDATE via COALESCE + Platzhalter
  await sql`
    update public.user_feedback set
      channel         = coalesce(${channel}::text,         channel),
      rating_overall  = coalesce(${rating_overall}::int,   rating_overall),
      rating_friend   = coalesce(${rating_friend}::int,    rating_friend),
      rating_qual     = coalesce(${rating_qual}::int,      rating_qual),
      rating_offer    = coalesce(${rating_offer}::int,     rating_offer),
      comment_raw     = coalesce(${comment_raw}::text,     comment_raw),
      template_name   = coalesce(${template_name}::text,   template_name),
      reklamation     = coalesce(${reklamation}::boolean,  reklamation),
      resolved        = coalesce(${resolved}::boolean,     resolved),
      note            = coalesce(${note}::text,            note)
    where id = ${id}
  `;

  return NextResponse.json({ ok:true });
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const id = getIdFromUrl(req.url);
  if (!id) return NextResponse.json({ ok:false, error:'bad_id' }, { status:400 });

  await sql`delete from public.user_feedback where id = ${id}`;
  return NextResponse.json({ ok:true });
}
