// lib/getUserFromRequest.ts
import type { NextRequest } from 'next/server';
import { supabaseServer } from './supabaseClient';

export async function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const sb = supabaseServer();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user; // { id, email?, user_metadata?, ... }
}
