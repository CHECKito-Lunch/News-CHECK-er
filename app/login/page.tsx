// app/login/page.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginInner() {
  const r = useRouter();
  const sp = useSearchParams();
  const from = sp?.get('from') || '/';
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string|undefined>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    if (!res.ok) {
      const j = await res.json().catch(()=>({}));
      setErr(j.error || 'Login fehlgeschlagen');
      return;
    }
    // Cookies sind gesetzt → App informieren & navigieren
    window.dispatchEvent(new Event('auth-changed'));
    r.replace(from || '/');
    r.refresh();
  }

  return (
    <div className="container max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold mb-4">Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="w-full border px-3 py-2 rounded" placeholder="E-Mail"
               value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border px-3 py-2 rounded" placeholder="Passwort" type="password"
               value={pw} onChange={e=>setPw(e.target.value)} />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="px-4 py-2 rounded bg-blue-600 text-white">Einloggen</button>
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