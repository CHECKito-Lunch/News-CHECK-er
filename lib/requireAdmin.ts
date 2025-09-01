// lib/requireAdmin.ts
import { supabaseAdmin } from './supabaseAdmin';

const allow = (process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

export async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;

  const email = (data.user.email || '').toLowerCase();
  if (allow.length && !allow.includes(email)) return null;

  return data.user; // OK
}
