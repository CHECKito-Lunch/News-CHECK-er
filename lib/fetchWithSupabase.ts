// lib/fetchWithSupabase.ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Holt das aktuelle Access Token und hängt es als Bearer an. */
export async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers as any);
  if (session?.access_token) {
    headers.set('authorization', `Bearer ${session.access_token}`);
  }
  // Cookies mitschicken (falls du zusätzlich welche nutzt)
  return fetch(input as any, { ...init, headers, credentials: 'include', cache: 'no-store' });
}