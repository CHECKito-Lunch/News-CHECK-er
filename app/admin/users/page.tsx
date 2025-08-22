// app/admin/users/page.tsx
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
  // Liste / Suche
  const [users, setUsers] = useState<AppUser[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  // Formularzustand (Neu/Update) — analog Admin-Posts
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fEmail, setFEmail] = useState('');
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState<Role>('user');
  const [fActive, setFActive] = useState(true);
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

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEditingId(null);
    setFEmail('');
    setFName('');
    setFRole('user');
    setFActive(true);
    setMsg('');
  }

  async function save() {
    setSaving(true);
    setMsg('');
    const payload = {
      email: fEmail.trim(),
      name: fName.trim() || null,
      role: fRole,
      active: fActive,
    };

    try {
      const url = editingId ? `/api/admin/users/${editingId}` : '/api/admin/users';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Fehler beim Speichern');

      setMsg(editingId ? 'Aktualisiert.' : 'Benutzer angelegt.');
      await load();
      if (!editingId) resetForm(); // nach Neuanlage Formular leeren
    } catch (e: any) {
      setMsg(e?.message ?? 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function startEdit(id: number) {
    setMsg('');
    // optionaler Detail-Request — falls du eine GET-Route hast:
    // const r = await fetch(`/api/admin/users/${id}`);
    // const j = await r.json();
    // const u: AppUser = j.data;
    // Falls du keine GET-Detailroute hast, holen wir die Daten aus der Liste:
    const u = users.find(x => x.id === id);
    if (!u) return;
    setEditingId(u.id);
    setFEmail(u.email);
    setFName(u.name ?? '');
    setFRole(u.role);
    setFActive(u.active);
    // Scroll zum Formular (UX)
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

  return (
    <div className="container max-w-5xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Benutzerverwaltung</h1>
      </div>

      {/* Formular analog Admin-Seite (Neu/Update über eine Form) */}
      <div className={cardClass + ' space-y-3'}>
        <h2 className="text-lg font-semibold">
          {editingId ? `Benutzer bearbeiten (ID: ${editingId})` : 'Neuen Benutzer anlegen'}
        </h2>

        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">E-Mail</label>
            <input
              value={fEmail}
              onChange={e => setFEmail(e.target.value)}
              className={inputClass}
              placeholder="name@firma.de"
            />
          </div>
          <div>
            <label className="form-label">Name</label>
            <input
              value={fName}
              onChange={e => setFName(e.target.value)}
              className={inputClass}
              placeholder="optional"
            />
          </div>
          <div>
            <label className="form-label">Rolle</label>
            <select value={fRole} onChange={e => setFRole(e.target.value as Role)} className={inputClass}>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={fActive} onChange={e => setFActive(e.target.checked)} />
            <label htmlFor="active" className="text-sm">Aktiv</label>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!fEmail || saving}
              onClick={save}
              className={btnPrimary}
              type="button"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              onClick={resetForm}
              className={btnBase}
              type="button"
            >
              Neu
            </button>
          </div>
        </div>

        {msg && <div className="text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
      </div>

      {/* Liste / Suche */}
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
                      <td className="px-3 py-2 font-medium truncate max-w-[28ch]">{u.email}</td>
                      <td className="px-3 py-2 truncate max-w-[22ch]">{u.name ?? '—'}</td>
                      <td className="px-3 py-2">{u.role}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs">{u.active ? 'aktiv' : 'inaktiv'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(u.id)}
                            className="px-2 py-1 rounded border dark:border-gray-700"
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(u.id)}
                            className="px-2 py-1 rounded bg-red-600 text-white"
                          >
                            Löschen
                          </button>
                        </div>
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