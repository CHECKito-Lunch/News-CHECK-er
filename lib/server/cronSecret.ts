// lib/server/cronSecret.ts
function getSecrets(): string[] {
  const vals = [
    process.env.NEWS_AGENT_CRON_SECRET,
    process.env.CRON_SECRET,              // fallback, for compatibility
  ]
    .filter(Boolean)
    .map(s => String(s).trim())
    .filter(s => s.length > 0);

  return Array.from(new Set(vals)); // unique
}

export function isCronAuthorized(req: Request) {
  const secrets = getSecrets();
  if (secrets.length === 0) return false;

  const h = req.headers;

  // a) Custom header
  const viaHeader = (h.get('x-cron-auth') || '').trim();

  // b) Bearer
  const bearer = (h.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  // c) Query param
  const key = new URL(req.url).searchParams.get('key')?.trim() || '';

  return secrets.includes(viaHeader) || secrets.includes(bearer) || secrets.includes(key);
}

export function getDryFlag(req: Request) {
  return new URL(req.url).searchParams.get('dry') === '1';
}
export function getForceFlag(req: Request) {
  return new URL(req.url).searchParams.get('force') === '1';
}
