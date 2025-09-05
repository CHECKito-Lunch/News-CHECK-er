// app/admin/users/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminTabs from '../_shared/AdminTabs';

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
  'dark:bg:white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

const btnPrimary =
  'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

export default function UsersAdminPage() {
  // Liste / Suche
  const [users, setUsers] = useState<AppUser[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  // Formularzustand (Neu/Update)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fEmail, setFEmail] = useState('');
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState<Role>('user');
  const [fActive, setFActive] = useState(true);
  const [fPassword, setFPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

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
  }, [q, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setFEmail('');
    setFName('');
    setFRole('user');
    setFActive(true);
    setFPassword('');
    setMsg('');
  }

  async function save() {
    setSaving(true);
    setMsg('');

    const creating = editingId === null;

    if (!fEmail.trim()) {
      setMsg('E-Mail ist erforderlich.');
      setSaving(false);
      return;
    }
    if (creating && fPassword.length < 8) {
      setMsg('Passwort ist erforderlich (mindestens 8 Zeichen).');
      setSaving(false);
      return;
    }

    const payload: any = {
      email: fEmail.trim(),
      name: fName.trim() || null,
      role: fRole,
      active: fActive,
    };
    if (creating) payload.password = fPassword;

    try {
      const url = creating ? '/api/admin/users' : `/api/admin/users/${editingId}`;
      const method = creating ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Fehler beim Speichern');

      setMsg(creating ? 'Benutzer angelegt.' : 'Aktualisiert.');
      await load();
      if (creating) resetForm();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function startEdit(id: number) {
    setMsg('');
    const u = users.find((x) => x.id === id);
    if (!u) return;
    setEditingId(u.id);
    setFEmail(u.email);
    setFName(u.name ?? '');
    setFRole(u.role);
    setFActive(u.active);
    setFPassword('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteUser(id: number) {
    if (!confirm('Diesen Benutzer löschen?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
      if (editingId === id) resetForm();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Löschen fehlgeschlagen');
    }
  }

  async function setPasswordForUser(user: AppUser) {
    const pwd = prompt(`Neues Passwort für ${user.email} (mind. 8 Zeichen):`);
    if (!pwd) return;
    if (pwd.length < 8) {
      alert('Mindestens 8 Zeichen.');
      return;
    }
    const res = await fetch(`/api/admin/users/${user.id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Passwort setzen fehlgeschlagen');
      return;
    }
    alert('Passwort aktualisiert.');
  }

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Benutzerverwaltung
        </h1>
        <AdminTabs />
  
      </div>

      {/* Formular */}
      <div className={cardClass + ' space-y-3'}>
        <h2 className="text-lg font-semibold">
          {editingId ? `Benutzer bearbeiten (ID: ${editingId})` : 'Neuen Benutzer anlegen'}
        </h2>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">E-Mail</label>
            <input
              value={fEmail}
              onChange={(e) => setFEmail(e.target.value)}
              className={inputClass}
              placeholder="name@firma.de"
              type="email"
            />
          </div>
          <div>
            <label className="form-label">Name</label>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              className={inputClass}
              placeholder="optional"
            />
          </div>
          <div>
            <label className="form-label">Rolle</label>
            <select
              value={fRole}
              onChange={(e) => setFRole(e.target.value as Role)}
              className={inputClass}
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={fActive}
              onChange={(e) => setFActive(e.target.checked)}
            />
            <label htmlFor="active" className="text-sm">
              Aktiv
            </label>
          </div>
          {editingId === null && (
            <div className="md:col-span-2">
              <label className="form-label">Initiales Passwort</label>
              <input
                type="password"
                value={fPassword}
                onChange={(e) => setFPassword(e.target.value)}
                className={inputClass}
                placeholder="mind. 8 Zeichen"
              />
            </div>
          )}
          <div className="flex gap-2 md:col-span-3">
            <button
              disabled={!fEmail || saving}
              onClick={save}
              className={btnPrimary}
              type="button"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button onClick={resetForm} className={btnBase} type="button">
              Neu
            </button>
          </div>
        </div>
        {msg && <div className="text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
      </div>

      {/* Liste */}
      <div className={cardClass + ' space-y-3'}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Benutzer</h2>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  load();
                }
              }}
              className={inputClass + ' w-64'}
              placeholder="Suche E-Mail/Name…"
            />
            <button className={btnBase} onClick={() => { setPage(1); load(); }}>
              Suchen
            </button>
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
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 font-medium truncate max-w-[28ch]">{u.email}</td>
                      <td className="px-3 py-2 truncate max-w-[22ch]">{u.name ?? '—'}</td>
                      <td className="px-3 py-2">{u.role}</td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={u.active}
                          onChange={async (e) => {
                            const newActive = e.target.checked;
                            const res = await fetch(`/api/admin/users/${u.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ active: newActive }),
                            });
                            if (res.ok) {
                              setUsers((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, active: newActive } : x))
                              );
                            } else {
                              const j = await res.json().catch(() => ({}));
                              alert(j.error ?? 'Aktualisierung fehlgeschlagen');
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button className={btnBase} onClick={() => startEdit(u.id)}>
                          Bearbeiten
                        </button>
                        <button className={btnBase} onClick={() => deleteUser(u.id)}>
                          Löschen
                        </button>
                        <button className={btnBase} onClick={() => setPasswordForUser(u)}>
                          Passwort
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-3">
              <div className="text-sm text-gray-500">
                Seite {page} von {pages}
              </div>
              <div className="flex gap-2">
                <button
                  className={btnBase}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Zurück
                </button>
                <button
                  className={btnBase}
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Weiter →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
