// app/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';

type Role = 'admin'|'moderator'|'user';
type Profile = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  hasPassword: boolean;
};

const inputClass =
  'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const btnPrimary =
  'px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

const btnBase =
  'px-3 py-2 rounded-xl text-sm font-medium transition border ' +
  'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
  'dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

const cardClass =
  'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 ' +
  'dark:bg-gray-900 dark:border-gray-800';

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // edit state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // messages
  const [msg, setMsg] = useState<string>('');
  const [err, setErr] = useState<string>('');

  // password
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [repPw, setRepPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/profile');
      const j = await r.json();
      if (r.ok) {
        setProfile(j.data);
        setName(j.data.name ?? '');
        setEmail(j.data.email);
      }
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    setMsg(''); setErr('');
    const r = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ name, email }),
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) { setErr(j.error || 'Speichern fehlgeschlagen.'); return; }
    setMsg('Gespeichert.');
    setProfile(p => p ? { ...p, name, email } : p);
  }

  async function changePassword() {
    setPwMsg(''); setPwErr('');
    if (newPw.length < 8) { setPwErr('Passwort muss mind. 8 Zeichen haben.'); return; }
    if (newPw !== repPw) { setPwErr('Passwörter stimmen nicht überein.'); return; }
    const r = await fetch('/api/profile/password', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ current: curPw || null, next: newPw }),
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) { setPwErr(j.error || 'Ändern fehlgeschlagen.'); return; }
    setPwMsg('Passwort aktualisiert.');
    setCurPw(''); setNewPw(''); setRepPw('');
  }

  if (loading) return <div className="container max-w-3xl mx-auto py-8">lädt…</div>;
  if (!profile) return <div className="container max-w-3xl mx-auto py-8">Nicht angemeldet.</div>;

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profil</h1>

      {/* Stammdaten */}
      <div className={cardClass + ' space-y-3'}>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="form-label">E-Mail</label>
            <input className={inputClass} value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Name</label>
            <input className={inputClass} value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Rolle</label>
            <input className={inputClass} value={profile.role} disabled />
            <div className="text-xs text-gray-500 mt-1">Rolle kann nicht geändert werden.</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveProfile} className={btnPrimary}>Speichern</button>
          {msg && <span className="text-sm text-green-600">{msg}</span>}
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </div>

      {/* Passwort */}
      <div className={cardClass + ' space-y-3'}>
        <h2 className="text-lg font-semibold">Passwort {profile.hasPassword ? 'ändern' : 'setzen'}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {profile.hasPassword && (
            <div>
              <label className="form-label">Aktuelles Passwort</label>
              <input type="password" className={inputClass} value={curPw} onChange={e=>setCurPw(e.target.value)} />
            </div>
          )}
          <div>
            <label className="form-label">Neues Passwort</label>
            <input type="password" className={inputClass} value={newPw} onChange={e=>setNewPw(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Wiederholen</label>
            <input type="password" className={inputClass} value={repPw} onChange={e=>setRepPw(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={changePassword} className={btnBase}>Passwort speichern</button>
          {pwMsg && <span className="text-sm text-green-600">{pwMsg}</span>}
          {pwErr && <span className="text-sm text-red-600">{pwErr}</span>}
        </div>
        <div className="text-xs text-gray-500">Mindestens 8 Zeichen.</div>
      </div>
    </div>
  );
}