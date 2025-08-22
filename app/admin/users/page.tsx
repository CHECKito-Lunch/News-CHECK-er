'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Role = 'admin' | 'moderator' | 'user';

type AppUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

const inputClass =
  'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const cardClass =
  'card p-4 rounded-2xl shadow-sm bg-white border border-gray-200 ' +
  'dark:bg-gray-900 dark:border-gray-800';

const btnBase =
  'px-3 py-2 rounded-lg text-sm font-medium transition border ' +
  'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
  'dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

const btnPrimary =
  'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

export default function UsersAdminPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  // Create form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [active, setActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string>('');

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const res = await fetch(`/api/admin/users?${params.toString()}`);
    const json = await res.json();
    setUsers(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  async function createUser() {
    setCreating(true);
    setMessage('');
    try {
      const body = { email, name, role, active };
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Fehler beim Anlegen');
      setEmail(''); setName(''); setRole('user'); setActive(true);
      await load();
      setMessage('Benutzer angelegt.');
    } catch (e: any) {
      setMessage(e?.message ?? 'Fehler');
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(id: number, patch: Partial<AppUser>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await load();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Update fehlgeschlagen');
    }
  }

  async function deleteUser(id: number) {
    if (!confirm('Diesen Benutzer löschen?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="container max-w-5xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Benutzerverwaltung</h1>
      </div>

      {/* Create */}
      <div className={cardClass + ' space-y-3'}>
        <h2 className="text-lg font-semibold">Neuen Benutzer anlegen</h2>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">E-Mail</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="name@firma.de" />
          </div>
          <div>
            <label className="form-label">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="optional" />
          </div>
          <div>
            <label className="form-label">Rolle</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)} className={inputClass}>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            <label htmlFor="active" className="text-sm">Aktiv</label>
          </div>
          <div>
            <button
              disabled={!email || creating}
              onClick={createUser}
              className={btnPrimary}
            >
              {creating ? 'Anlegen…' : 'Anlegen'}
            </button>
          </div>
        </div>
        {message && <div className="text-sm text-gray-600 dark:text-gray-300">{message}</div>}
      </div>

      {/* List/Search */}
      <div className={cardClass + ' space-y-3'}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Benutzer</h2>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(); } }}
              className={inputClass + ' w-64'}
              placeholder="Suche E-Mail/Name…"
            />
            <button className={btnBase} onClick={() => { setPage(1); load(); }}>Suchen</button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                  <tr>
                    <th className="px-3 py-2">E-Mail</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Rolle</th>
                    <th className="px-3 py-2">Aktiv</th>
                    <th className="px-3 py-2">Erstellt</th>
                    <th className="px-3 py-2 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 font-medium">{u.email}</td>
                      <td className="px-3 py-2">
                        <input
                          className="w-56 rounded border px-2 py-1 bg-transparent dark:border-gray-700"
                          value={u.name ?? ''}
                          onChange={e => updateUser(u.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={u.role}
                          onChange={e => updateUser(u.id, { role: e.target.value as Role })}
                          className="rounded border px-2 py-1 bg-transparent dark:border-gray-700"
                        >
                          <option value="user">User</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={u.active}
                            onChange={e => updateUser(u.id, { active: e.target.checked })}
                          />
                          <span className="text-xs">{u.active ? 'aktiv' : 'inaktiv'}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={() => deleteUser(u.id)}>
                          Löschen
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        Keine Einträge.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3">
              <div className="text-xs text-gray-500">{total} Einträge</div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded border disabled:opacity-50"
                >
                  Zurück
                </button>
                <span className="text-sm">Seite {page} / {pages}</span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded border disabled:opacity-50"
                >
                  Weiter
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
