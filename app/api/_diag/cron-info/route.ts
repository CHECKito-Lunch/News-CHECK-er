import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const hasNEWS_AGENT_CRON_SECRET = !!(process.env.NEWS_AGENT_CRON_SECRET || '').trim();
  return NextResponse.json({ hasNEWS_AGENT_CRON_SECRET });
}
