// app/login/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseClient';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp?.get('from') || '/';

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });

    setBusy(false);

    if (error) {
      setErr(error.message || 'Login fehlgeschlagen');
      return;
    }

    // Session ist via Supabase-Cookies aktiv → weiterleiten & neu rendern
    router.replace(from || '/');
    router.refresh();
  }

  return (
    <div className="container max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold mb-4">Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full border px-3 py-2 rounded"
          placeholder="E-Mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border px-3 py-2 rounded"
          placeholder="Passwort"
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button
          disabled={busy}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {busy ? 'Anmelden…' : 'Einloggen'}
        </button>
      </form>
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