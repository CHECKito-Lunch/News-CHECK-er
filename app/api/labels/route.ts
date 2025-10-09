// app/api/labels/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = '/api/teamhub/labels';
  return fetch(url.toString(), { headers: { cookie: req.headers.get('cookie') ?? '' } });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = '/api/teamhub/labels';
  return fetch(url.toString(), {
    method: 'POST',
    headers: { cookie: req.headers.get('cookie') ?? '', 'content-type': 'application/json' },
    body: await req.text(),
  });
}
