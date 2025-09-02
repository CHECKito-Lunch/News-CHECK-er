// lib/requireAdmin.ts
import { supabaseAdmin } from './supabaseAdmin';

const allow = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin(req: Request) {
  const authHeader =
    req.headers.get('authorization') ??
    req.headers.get('Authorization') ??
    '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  if (!token) return null;

  const sb = supabaseAdmin(); // 👈 Instanz erzeugen
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;

  const email = (data.user.email ?? '').toLowerCase();
  if (allow.length && !allow.includes(email)) return null;

  return data.user; // ok
}
