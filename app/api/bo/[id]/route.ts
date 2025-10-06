// app/api/bo/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const BO_BASE = 'https://backoffice.reisen.check24.de/booking/search/';
const isHex64 = (s: string) => /^[0-9a-f]{64}$/i.test(s);
const onlyDigits = (s: string) => s.replace(/\D+/g, '');

export async function GET(req: NextRequest) {
  // Admin-Check
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // param aus der URL ziehen (ohne zweiten Funktions-Parameter)
  const pathname = req.nextUrl?.pathname || new URL(req.url).pathname;
  const rawParam = pathname.split('/').pop() || '';
  const raw = decodeURIComponent(rawParam).trim();
  if (!raw) return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });

  // 1) Keine Hash-Form → direkt mit booking_number weiterleiten
  if (!isHex64(raw)) {
    const booking = onlyDigits(raw);
    if (!booking) return NextResponse.json({ ok: false, error: 'invalid_booking_number' }, { status: 400 });

    const url = new URL(BO_BASE);
    url.searchParams.set('booking_number', booking);
    return NextResponse.redirect(url.toString(), { status: 302 });
  }

  // 2) Hash → entschlüsseln & weiterleiten
  const BOOKING_KEY = process.env.BOOKING_KEY;
  if (!BOOKING_KEY) {
    return NextResponse.json({ ok: false, error: 'booking_key_missing_env' }, { status: 500 });
  }

  const rows = await sql<{ booking_number: string | null }[]>`
    select pgp_sym_decrypt(booking_number_enc, ${BOOKING_KEY}) as booking_number
    from public.user_feedback
    where booking_number_hash = ${raw}
    limit 1
  `;

  const booking = rows[0]?.booking_number ? onlyDigits(rows[0].booking_number) : '';
  if (!booking) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const url = new URL(BO_BASE);
  url.searchParams.set('booking_number', booking);
  return NextResponse.redirect(url.toString(), { status: 302 });
}
