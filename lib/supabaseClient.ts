// lib/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// —— Browser: Singleton, um "Multiple GoTrueClient instances" zu vermeiden
let _browserClient: SupabaseClient | null = null;
export const supabaseBrowser = (): SupabaseClient => {
  if (!_browserClient) {
    if (!URL || !ANON) {
      // Keine Exceptions werfen, damit SSR nicht 500t — lieber loggen
      console.error('Supabase ENV fehlt: NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    _browserClient = createClient(URL, ANON);
  }
  return _browserClient;
};

// —— Server: Anon (RLS aktiv)
export const supabaseServer = (): SupabaseClient => {
  if (!URL || !ANON) {
    console.error('Supabase ENV fehlt (Server Anon): NEXT_PUBLIC_SUPABASE_URL/ANON');
  }
  return createClient(URL, ANON, { auth: { persistSession: false } });
};

// —— Server: Admin (RLS umgehen — nur serverseitig verwenden!)
export const supabaseAdmin = (): SupabaseClient => {
  if (!URL || !SERVICE) {
    console.error('Supabase ENV fehlt (Service): NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
};
