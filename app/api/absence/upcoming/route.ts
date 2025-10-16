/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // benötigt für node-fetch/crypto etc.

const BASE = process.env.ABSENCE_BASE_URL ?? 'https://app.absence.io';

type TokenResp = { access_token: string; token_type: 'Bearer'; expires_in: number };

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 30) return cachedToken.token; // 30s Puffer

  const res = await fetch(`${BASE}/api/oauth/accesstoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.ABSENCE_CLIENT_ID,
      client_secret: process.env.ABSENCE_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`[token] ${res.status} ${txt}`);
  }
  const json = (await res.json()) as TokenResp;
  cachedToken = { token: json.access_token, exp: Math.floor(Date.now() / 1000) + json.expires_in };
  return json.access_token;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const memberIds = url.searchParams.getAll('member_user_id');
    if (memberIds.length === 0) {
      return NextResponse.json({ error: 'Missing member_user_id' }, { status: 400 });
    }

    // Beispiel: „upcoming absences“ via v2/absences POST-Query selbst bauen
    // (absence.io nutzt POST zum Listen, mit Filter & Sort)
    // Passe Filter an eure Definition von „upcoming“ an:
    const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const body = {
      limit: 100,
      filter: {
        'assignedToId': { $in: memberIds },
        // upcoming: start >= heute ODER aktuell laufend
        $or: [
          { start: { $gte: todayIso } },
          { end: { $gte: todayIso } },
        ],
      },
      sortBy: { start: 1 },
      relations: ['assignedToId'], // optional: User-Objekte auflösen
    };

    const token = await getToken();

    const absRes = await fetch(`${BASE}/api/v2/absences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (absRes.status === 401 || absRes.status === 403) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: absRes.status });
    }
    if (!absRes.ok) {
      const txt = await absRes.text().catch(() => '');
      return NextResponse.json({ error: 'Upstream error', status: absRes.status, details: txt }, { status: 502 });
    }

    const data = await absRes.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('[absence/upcoming GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
