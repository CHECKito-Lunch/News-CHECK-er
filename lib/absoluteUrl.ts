export function getServerBaseUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : 'http://localhost:3000';
}