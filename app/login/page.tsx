// app/login/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container max-w-md mx-auto p-6">Lädt…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const sp = useSearchParams();               // ✅ steckt jetzt in <Suspense>
  const router = useRouter();
  const redirect = sp.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || 'Login fehlgeschlagen.');
        setPending(false);
        return;
      }
      router.push(redirect);
    } catch (e) {
      setErr('Netzwerkfehler.');
      setPending(false);
    }
  }

  // simple Styles
  const input =
    'w-full rounded-xl px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
    'shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
    'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
  const btn =
    'w-full px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50';

  return (
    <div className="container max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Login</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">E-Mail</label>
          <input
            type="email"
            autoComplete="username"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Passwort</label>
          <input
            type="password"
            autoComplete="current-password"
            className={input}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
            placeholder="••••••••"
          />
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button type="submit" disabled={pending} className={btn}>
          {pending ? 'Anmeldung…' : 'Einloggen'}
        </button>
      </form>

      <div className="mt-4 text-sm">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">Zur Startseite</Link>
      </div>
    </div>
  );
}