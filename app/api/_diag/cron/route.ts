import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key')?.trim() || '';

  const envRaw = process.env.NEWS_AGENT_CRON_SECRET ?? '';
  const env = envRaw.trim();

  const hdr = req.headers.get('x-cron-auth')?.trim() || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  const authorized = !!env && (key === env || hdr === env || bearer === env);

  return NextResponse.json({
    hasNEWS_AGENT_CRON_SECRET: !!env,
    NEWS_AGENT_CRON_SECRET_len: env.length,
    received: {
      key_len: key.length,
      x_cron_auth_len: hdr.length,
      bearer_len: bearer.length,
    },
    authorized,
  });
}
