'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const emailTrimmed = email.trim().toLowerCase();
    const nameTrimmed = name.trim();

    if (!emailTrimmed.endsWith('@check24.de')) {
      setMsg('Nur E-Mail-Adressen von @check24.de sind erlaubt.');
      return;
    }
    if (password.length < 8) {
      setMsg('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setLoading(true);

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailTrimmed, password, name: nameTrimmed }),
    });

    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || 'Fehler bei der Registrierung.');
    } else {
      setMsg('Erfolgreich registriert! Du wirst benachrichtigt, sobald dein Konto aktiviert wurde.');
      setEmail('');
      setName('');
      setPassword('');
    }

    setLoading(false);
  }

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-4 text-center">Registrieren</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Dein Name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border px-3 py-2 rounded-lg bg-white dark:bg-white/10 dark:text-white"
        />
        <input
          type="email"
          placeholder="E-Mail-Adresse (@check24.de)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border px-3 py-2 rounded-lg bg-white dark:bg-white/10 dark:text-white"
          required
        />
        <input
          type="password"
          placeholder="Passwort (mind. 8 Zeichen)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border px-3 py-2 rounded-lg bg-white dark:bg-white/10 dark:text-white"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60"
        >
          {loading ? 'Registriere…' : 'Registrieren'}
        </button>
        {msg && <p className="text-sm mt-2 text-center text-gray-700 dark:text-gray-200">{msg}</p>}
      </form>
    </main>
  );
}
