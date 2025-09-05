// app/api/_diag/cron/route.ts
import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cronSecret';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const hasNews = !!process.env.NEWS_AGENT_CRON_SECRET?.trim();
  const hasCron = !!process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || null;
  const hdr = req.headers.get('x-cron-auth') || null;
  const auth = req.headers.get('authorization') || null;

  return NextResponse.json({
    routeVersion: 'diag-v1',
    hasNEWS_AGENT_CRON_SECRET: hasNews,
    hasCRON_SECRET: hasCron,
    provided: { key, 'x-cron-auth': hdr, authorization: auth },
    authorized: isCronAuthorized(req)
  });
}
