// app/admin/_shared/auth.ts
'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import type { Role } from './types';

const sb = supabaseBrowser();
const isAdminRole = (r?: string | null) => r === 'admin' || r === 'moderator';

async function resolveRoleViaApi(): Promise<Role | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const role: string | undefined =
      j?.role ?? j?.data?.role ?? j?.profile?.role ?? j?.user?.role;
    return (role as Role) ?? null;
  } catch { return null; }
}

async function resolveRoleViaDb(email?: string | null, userId?: string | null): Promise<Role | null> {
  try {
    if (email) {
      const { data } = await sb.from('app_users').select('role').eq('email', email.toLowerCase()).maybeSingle();
      if (data?.role) return data.role as Role;
    }
  } catch {}
  try {
    if (userId) {
      const { data } = await sb.from('profiles').select('role').eq('user_id', userId).maybeSingle();
      if (data?.role) return data.role as Role;
    }
  } catch {}
  return null;
}

async function resolveSessionAndRole() {
  const { data } = await sb.auth.getUser();
  const user = data?.user ?? null;

  const apiRole = await resolveRoleViaApi();
  if (apiRole) return { user, role: apiRole as Role };

  const dbRole = await resolveRoleViaDb(user?.email ?? null, user?.id ?? null);
  return { user, role: (dbRole ?? null) as Role | null };
}

export function useAdminAuth() {
  const [loading, setLoading] = useState(true);
  const [sessionOK, setSessionOK] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { user, role } = await resolveSessionAndRole();
      if (!alive) return;
      setSessionOK(!!user);
      setIsAdmin(isAdminRole(role ?? undefined));
      setLoading(false);
    })();

    const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      setSessionOK(!!user);
      const apiRole = await resolveRoleViaApi();
      let role: Role | null = apiRole;
      if (!role) role = await resolveRoleViaDb(user?.email ?? null, user?.id ?? null);
      setIsAdmin(isAdminRole(role ?? undefined));
    });

    return () => { sub?.subscription?.unsubscribe?.(); alive = false; };
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    const { error } = await sb.auth.signInWithPassword({ email: userEmail.trim(), password: userPassword });
    if (error) { setAuthMsg(error.message || 'Login fehlgeschlagen.'); setSessionOK(false); setIsAdmin(false); return; }

    const { data: sess } = await sb.auth.getSession();
    const access = sess?.session?.access_token;
    if (access) { try { await fetch('/api/login', { method:'POST', headers:{ Authorization:`Bearer ${access}` } }); } catch {} }

    const { user, role } = await resolveSessionAndRole();
    const admin = isAdminRole(role ?? undefined);
    setIsAdmin(admin); setSessionOK(!!user);
    setAuthMsg(admin ? 'Erfolgreich angemeldet.' : 'Angemeldet – aber kein Admin-Zugriff.');
  }

  async function doLogout() {
    try { await fetch('/api/logout', { method:'POST' }); } catch {}
    await sb.auth.signOut();
    setSessionOK(false); setIsAdmin(false);
  }

  return { loading, sessionOK, isAdmin, authMsg, setAuthMsg, userEmail, setUserEmail, userPassword, setUserPassword, doLogin, doLogout };
}
