// app/api/bo/[q]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Optional: per ENV übersteuerbar
const BACKOFFICE_BASE =
  process.env.BACKOFFICE_BASE ?? 'https://backoffice.reisen.check24.de';

const isDigits = (s: string) => /^[0-9]+$/.test(s);
const isSha256Hex = (s: string) => /^[0-9a-f]{64}$/i.test(s);

export async function GET(req: NextRequest, ctx: any) {
  try {
    const rawParam = (ctx?.params?.q ?? '') as string;
    const raw = decodeURIComponent(rawParam.trim());
    if (!raw) {
      return NextResponse.json({ ok: false, error: 'missing_parameter' }, { status: 400 });
    }

    // 1) Klar-Buchungsnummer -> sofort weiterleiten
    if (isDigits(raw)) {
      const target = `${BACKOFFICE_BASE}/booking/search/?booking_number=${raw}`;
      return NextResponse.redirect(target, { status: 302 });
    }

    // 2) Hash -> Nummer aus DB entschlüsseln und weiterleiten
    if (isSha256Hex(raw)) {
      // Wir speichern beim Import:
      // - booking_number_hash (hex, sha256)
      // - booking_number_enc  (pgp_sym_encrypt)
      // Hier: Schlüssel aus Postgres-Setting lesen (keine ENV nötig).
      const rows = await sql<{ booking_number: string }[]>`
        select pgp_sym_decrypt(
                 booking_number_enc,
                 current_setting('app.secrets.booking_key', true)
               ) as booking_number
        from public.user_feedback
        where booking_number_hash = ${raw}
        limit 1
      `;
      const bn = rows?.[0]?.booking_number?.trim();

      if (bn && isDigits(bn)) {
        const target = `${BACKOFFICE_BASE}/booking/search/?booking_number=${bn}`;
        return NextResponse.redirect(target, { status: 302 });
      }
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    // 3) Fallback: ungültiges Format
    return NextResponse.json({ ok: false, error: 'invalid_format' }, { status: 400 });
  } catch (e) {
    console.error('[bo redirect]', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
