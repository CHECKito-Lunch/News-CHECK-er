// lib/fetchWithSupabase.ts
'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true }});

export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const token   = session?.access_token ?? null;
  const userId  = session?.user?.id ?? null;
  const role    = (session?.user?.user_metadata?.role as string | undefined) ?? undefined;

  const headers = new Headers(init.headers ?? {});
  if (token)  headers.set('authorization', `Bearer ${token}`);
  if (userId) headers.set('x-user-id', userId);         // <- wichtig für requireUser()
  if (role)   headers.set('x-user-role', role);         // optional
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  return fetch(input, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'same-origin', // Cookies (falls vorhanden) mit senden
  });
}
