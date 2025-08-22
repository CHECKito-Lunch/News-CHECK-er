'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const inputClass =
  'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const btnPrimary =
  'px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') || '/admin';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Login fehlgeschlagen.');
      router.push(redirect);
    } catch (err:any) {
      setMsg(err.message || 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm p-6 rounded-2xl border bg-white dark:bg-gray-900 dark:border-gray-800 space-y-4">
        <h1 className="text-xl font-semibold">Anmelden</h1>
        <div>
          <label className="form-label">E-Mail</label>
          <input className={inputClass} value={email} onChange={e=>setEmail(e.target.value)} placeholder="du@firma.de" />
        </div>
        <div>
          <label className="form-label">Zugangscode</label>
          <input className={inputClass} value={code} onChange={e=>setCode(e.target.value)} placeholder="Code" type="password" />
        </div>
        <button disabled={!email || !code || loading} className={btnPrimary} type="submit">
          {loading ? 'Anmelden…' : 'Anmelden'}
        </button>
        {msg && <div className="text-sm text-red-600">{msg}</div>}
      </form>
    </div>
  );
}
