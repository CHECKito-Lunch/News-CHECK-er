'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminTabs from '../shared/AdminTabs';

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

type Group = {
  id: number;
  name: string;
  description?: string | null;
  memberCount?: number;
  is_active?: boolean;
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
  // ---------- Users ----------
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

  // ---------- Groups ----------
  const [groups, setGroups] = useState<Group[]>([]);
  const [gQ, setGQ] = useState('');
  const [gLoading, setGLoading] = useState(false);
  const [gMsg, setGMsg] = useState('');
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gSaving, setGSaving] = useState(false);
  const [gEditingId, setGEditingId] = useState<number | null>(null);

  // Dialog: User → Gruppen zuweisen
  const [assignOpen, setAssignOpen] = useState<null | { user: AppUser; groupIds: number[] }>(null);

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
    setFPassword('');
    setMsg('');
  }

  async function save() {
    setSaving(true); setMsg('');
    const creating = editingId === null;

    if (!fEmail.trim()) { setMsg('E-Mail ist erforderlich.'); setSaving(false); return; }
    if (creating && fPassword.length < 8) { setMsg('Passwort ist erforderlich (mindestens 8 Zeichen).'); setSaving(false); return; }

    const payload: any = { email: fEmail.trim(), name: fName.trim() || null, role: fRole, active: fActive };
    if (creating) payload.password = fPassword;

    try {
      const url = creating ? '/api/admin/users' : `/api/admin/users/${editingId}`;
      const method = creating ? 'POST' : 'PATCH';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Fehler beim Speichern');
      setMsg(creating ? 'Benutzer angelegt.' : 'Aktualisiert.');
      await load();
      if (creating) resetForm();
    } catch (e: any) {
      setMsg(e?.message ?? 'Fehler');
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
    if (pwd.length < 8) { alert('Mindestens 8 Zeichen.'); return; }
    const res = await fetch(`/api/admin/users/${user.id}/password`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd })
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Passwort setzen fehlgeschlagen'); return; }
    alert('Passwort aktualisiert.');
  }

  // ---------- Gruppen-Calls ----------
  const loadGroups = useCallback(async () => {
    setGLoading(true);
    const r = await fetch('/api/admin/groups');
    const j = await r.json().catch(() => ({}));
    setGroups(Array.isArray(j.data) ? j.data : []);
    setGLoading(false);
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  function resetGroupForm() {
    setGEditingId(null); setGName(''); setGDesc(''); setGMsg('');
  }

  async function saveGroup() {
    setGSaving(true); setGMsg('');
    try {
      const creating = gEditingId === null;
      const url = creating ? '/api/admin/groups' : `/api/admin/groups/${gEditingId}`;
      const method = creating ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gName.trim(), description: gDesc.trim() || null })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Fehler beim Speichern');
      setGMsg(creating ? 'Gruppe angelegt.' : 'Aktualisiert.');
      await loadGroups();
      if (creating) resetGroupForm();
    } catch (e: any) {
      setGMsg(e?.message ?? 'Fehler');
    } finally {
      setGSaving(false);
    }
  }

  async function deleteGroup(id: number) {
    if (!confirm('Diese Gruppe löschen? (Mitgliedschaften werden entfernt)')) return;
    const r = await fetch(`/api/admin/groups/${id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error ?? 'Löschen fehlgeschlagen'); return; }
    await loadGroups();
  }

  // Dialog öffnen: Gruppen eines Users laden
  async function openAssign(u: AppUser) {
    const r = await fetch(`/api/admin/users/${u.id}/groups`);
    const j = await r.json().catch(() => ({}));
    const ids: number[] = Array.isArray(j.groupIds) ? j.groupIds : [];
    setAssignOpen({ user: u, groupIds: ids });
  }

  async function saveAssign() {
    if (!assignOpen) return;
    const ids = assignOpen.groupIds;
    const r = await fetch(`/api/admin/users/${assignOpen.user.id}/groups`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupIds: ids })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error ?? 'Zuweisung fehlgeschlagen'); return; }
    setAssignOpen(null);
    // optional: groups neu laden, falls MemberCount sich ändert
    loadGroups();
  }

  // Filter für Gruppenliste
  const gFiltered = useMemo(() => {
    const q = gQ.trim().toLowerCase();
    return !q ? groups : groups.filter(g => g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q));
  }, [gQ, groups]);

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Benutzerverwaltung</h1>
        <AdminTabs />
      </div>

      {/* ---------- Benutzer-Formular ---------- */}
      <div className={cardClass + ' space-y-3'}>
        <h2 className="text-lg font-semibold">
          {editingId ? `Benutzer bearbeiten (ID: ${editingId})` : 'Neuen Benutzer anlegen'}
        </h2>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">E-Mail</label>
            <input value={fEmail} onChange={(e) => setFEmail(e.target.value)} className={inputClass} placeholder="name@firma.de" type="email" />
          </div>
          <div>
            <label className="form-label">Name</label>
            <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputClass} placeholder="optional" />
          </div>
          <div>
            <label className="form-label">Rolle</label>
            <select value={fRole} onChange={(e) => setFRole(e.target.value as Role)} className={inputClass}>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} />
            <label htmlFor="active" className="text-sm">Aktiv</label>
          </div>
          {editingId === null && (
            <div className="md:col-span-2">
              <label className="form-label">Initiales Passwort</label>
              <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} className={inputClass} placeholder="mind. 8 Zeichen" />
            </div>
          )}
          <div className="flex gap-2 md:col-span-3">
            <button disabled={!fEmail || saving} onClick={save} className={btnPrimary} type="button">{saving ? 'Speichern…' : 'Speichern'}</button>
            <button onClick={resetForm} className={btnBase} type="button">Neu</button>
          </div>
        </div>
        {msg && <div className="text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
      </div>

      {/* ---------- Benutzer-Liste ---------- */}
      <div className={cardClass + ' space-y-3'}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Benutzer</h2>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
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
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ active: newActive }),
                            });
                            if (res.ok) {
                              setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: newActive } : x)));
                            } else {
                              const j = await res.json().catch(() => ({}));
                              alert(j.error ?? 'Aktualisierung fehlgeschlagen');
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-500">{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button className={btnBase} onClick={() => startEdit(u.id)}>Bearbeiten</button>
                        <button className={btnBase} onClick={() => deleteUser(u.id)}>Löschen</button>
                        <button className={btnBase} onClick={() => setPasswordForUser(u)}>Passwort</button>
                        <button className={btnBase} onClick={() => openAssign(u)}>Gruppen</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-3">
              <div className="text-sm text-gray-500">Seite {page} von {pages}</div>
              <div className="flex gap-2">
                <button className={btnBase} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Zurück</button>
                <button className={btnBase} disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Weiter →</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------- Gruppenverwaltung ---------- */}
      <div className={cardClass + ' space-y-4'}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Gruppen</h2>
          <input className={inputClass + ' w-64'} placeholder="Gruppen suchen…" value={gQ} onChange={(e) => setGQ(e.target.value)} />
        </div>

        {/* Formular Gruppe */}
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">Name</label>
            <input value={gName} onChange={(e) => setGName(e.target.value)} className={inputClass} placeholder="z.B. Vertrieb, Redaktion…" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Beschreibung</label>
            <input value={gDesc} onChange={(e) => setGDesc(e.target.value)} className={inputClass} placeholder="optional" />
          </div>
          <div className="flex gap-2 md:col-span-1">
            <button className={btnPrimary} disabled={!gName || gSaving} onClick={saveGroup}>
              {gSaving ? 'Speichern…' : (gEditingId ? 'Gruppe speichern' : 'Gruppe anlegen')}
            </button>
            <button className={btnBase} onClick={resetGroupForm}>Neu</button>
          </div>
        </div>
        {gMsg && <div className="text-sm text-gray-600 dark:text-gray-300">{gMsg}</div>}

        {/* Liste Gruppen */}
        {gLoading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Beschreibung</th>
                  <th className="px-3 py-2">Mitglieder</th>
                  <th className="px-3 py-2">Aktiv</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {gFiltered.map(g => (
                  <tr key={g.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 font-medium">{g.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{g.description ?? '—'}</td>
                    <td className="px-3 py-2">{typeof g.memberCount === 'number' ? g.memberCount : '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={g.is_active !== false}
                        onChange={async (e) => {
                          const is_active = e.target.checked;
                          const r = await fetch(`/api/admin/groups/${g.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_active })
                          });
                          if (r.ok) {
                            setGroups(prev => prev.map(x => x.id === g.id ? { ...x, is_active } : x));
                          } else {
                            const j = await r.json().catch(() => ({}));
                            alert(j.error ?? 'Aktualisierung fehlgeschlagen');
                          }
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        className={btnBase}
                        onClick={() => { setGEditingId(g.id); setGName(g.name); setGDesc(g.description ?? ''); }}
                      >
                        Bearbeiten
                      </button>
                      <button className={btnBase} onClick={() => deleteGroup(g.id)}>Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Dialog: Gruppen zuweisen ---------- */}
      {assignOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAssignOpen(null)} />
          <div className="absolute inset-x-0 top-20 mx-auto max-w-2xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                Gruppen für <span className="font-mono">{assignOpen.user.email}</span>
              </h3>
              <button className={btnBase} onClick={() => setAssignOpen(null)}>Schließen</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {groups.map(g => {
                const checked = assignOpen.groupIds.includes(g.id);
                return (
                  <label key={g.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm cursor-pointer
                    ${checked
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/20'
                    }`}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={checked}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setAssignOpen(prev => prev && {
                          ...prev,
                          groupIds: on
                            ? Array.from(new Set([...prev.groupIds, g.id]))
                            : prev.groupIds.filter(id => id !== g.id)
                        });
                      }}
                    />
                    <span className="font-medium">{g.name}</span>
                    {typeof g.memberCount === 'number' && (
                      <span className={`text-xs inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full
                        ${checked ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                        {g.memberCount}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button className={btnBase} onClick={() => setAssignOpen(null)}>Abbrechen</button>
              <button className={btnPrimary} onClick={saveAssign}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
