// app/api/absence/upcoming/route.ts
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

export const runtime = 'nodejs'; // wichtig, falls Auth-Helpers Edge nicht mögen

const ABSENCE_API = process.env.ABSENCE_API_URL!; // z.B. https://absence.internal/api

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // WICHTIG: Mehrfach-Parameter korrekt lesen
    const memberIds = url.searchParams.getAll('member_user_id');
    if (memberIds.length === 0) {
      return NextResponse.json({ error: 'Missing member_user_id' }, { status: 400 });
    }

    // Auth besorgen – je nach Setup:
    // Variante A: Token aus Cookie
    const authCookie = (await cookies()).get('AUTH_COOKIE')?.value;

    // Variante B: Authorization-Header vom Client durchreichen (falls ihr clientseitig fetch mit Bearer macht)
    const incomingAuth = (await headers()).get('authorization');

    const authHeader =
      incomingAuth?.startsWith('Bearer ')
        ? incomingAuth
        : authCookie
        ? `Bearer ${authCookie}`
        : null;

    if (!authHeader) {
      // Hier 401 zurückgeben, NICHT 500
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Upstream-URL mit allen IDs bauen
    const upstreamUrl = new URL('/upcoming', ABSENCE_API);
    for (const id of memberIds) upstreamUrl.searchParams.append('member_user_id', id);

    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    // Fehler sauber mappen – besonders 401/403 nicht als 500 verstecken
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => '');
      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: upstreamRes.status });
      }
      console.error('[absence/upcoming] Upstream error', upstreamRes.status, text);
      return NextResponse.json(
        { error: 'Upstream error', status: upstreamRes.status },
        { status: 502 }
      );
    }

    const data = await upstreamRes.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[absence/upcoming] Unhandled error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
