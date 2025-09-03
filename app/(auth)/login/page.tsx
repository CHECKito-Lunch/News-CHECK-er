'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseClient';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp?.get('from') || '/'; // <- wieder auf Startseite

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    const sb = supabaseBrowser();

    const { error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });

    if (error) {
      setBusy(false);
      setErr(error.message || 'Login fehlgeschlagen');
      return;
    }

    // Access Token holen und Handshake ausführen -> setzt auth + user_role Cookies
    const { data: sess } = await sb.auth.getSession();
    const access = sess?.session?.access_token;

    if (access) {
      try {
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}` },
          cache: 'no-store',
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `Login-Handshake fehlgeschlagen (${r.status})`);
        }
      } catch (e: any) {
        setBusy(false);
        setErr(e?.message || 'Login-Handshake fehlgeschlagen');
        return;
      }
    } else {
      setBusy(false);
      setErr('Keine Session erhalten.');
      return;
    }

    setBusy(false);
    router.replace(from || '/');
    router.refresh();
  }

  return (
    <div className="container max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold mb-4 text-center">Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full border px-3 py-2 rounded-lg bg-white dark:bg-white/10 dark:text-white"
          placeholder="E-Mail"
          type="email"
          autoComplete="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border px-3 py-2 rounded-lg bg-white dark:bg-white/10 dark:text-white"
          placeholder="Passwort"
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button
          disabled={busy}
          className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60"
        >
          {busy ? 'Anmelden…' : 'Einloggen'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        Noch kein Konto?{' '}
        <Link
          href="/register"
          className="text-blue-600 hover:underline font-medium"
        >
          Jetzt registrieren
        </Link>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="container max-w-md mx-auto py-12">Lade…</div>}>
      <LoginInner />
    </Suspense>
  );
}
