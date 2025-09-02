// lib/getUserFromRequest.ts
import { supabaseServer } from '@/lib/supabase-server';

export async function getUserFromRequest() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return user ?? null;
}
