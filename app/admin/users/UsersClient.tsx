/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/fetchWithSupabase';

type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

type AppUser = {
  id: number;
  user_id: string | null;
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
  is_private?: boolean;
  has_password?: boolean;
};

type Team = {
  id: number;
  name: string;
  memberCount?: number;
  created_at?: string | null;
};

const inputClass = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const cardClass = 'card p-4 rounded-2xl shadow-sm bg-white border border-gray-200 ' +
  'dark:bg-gray-900 dark:border-gray-800';

const btnBase = 'px-3 py-2 rounded-lg text-sm font-medium transition border ' +
  'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
  'dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

const btnPrimary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

/* ========= Pretty Switch ========= */
function Switch({ checked, onChange, label, className = '' }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`}>
      {label && <span className="text-sm">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
        }`}
      >
        <span
          className={`h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

/* ========= TEAM MODAL ========= */
function TeamModal({
  open,
  onClose,
  team,
  allUsers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  team: Team | null;
  allUsers: AppUser[];
  onSaved: () => void;
}) {
  const creating = !team;
  const [name, setName] = useState(team?.name ?? '');
  const [saving, setSaving] = useState(false);

  const usersByUuid = useMemo(() => {
    const m = new Map<string, AppUser>();
    for (const u of allUsers) if (u.user_id) m.set(u.user_id, u);
    return m;
  }, [allUsers]);

  const [memberUuids, setMemberUuids] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? '');
    setMemberUuids([]);
    setLeaders({});
    setFilter('');
    if (team?.id) {
      (async () => {
        setLoadingMembers(true);
        try {
          const r = await authedFetch(`/api/admin/teams/${team.id}/members`);
          const j = await r.json().catch(() => ({}));
          const arr: any[] = Array.isArray(j?.members) ? j.members : [];
          const uuids = arr.map((m) => String(m.user_id)).filter(Boolean);
          const lf: Record<string, boolean> = {};
          for (const m of arr) {
            const uid = String(m?.user_id ?? '');
            if (uid) lf[uid] = !!m?.is_teamleiter;
          }
          setMemberUuids(uuids);
          setLeaders(lf);
        } finally {
          setLoadingMembers(false);
        }
      })();
    }
  }, [open, team]);

  const available = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return allUsers
      .filter(u => u.user_id && !memberUuids.includes(u.user_id))
      .filter(u => {
        if (!f) return true;
        const hay = `${u.email} ${u.name ?? ''}`.toLowerCase();
        return hay.includes(f);
      });
  }, [allUsers, memberUuids, filter]);

  const selected = useMemo(
    () => memberUuids.map(uuid => usersByUuid.get(uuid)).filter((x): x is AppUser => !!x),
    [memberUuids, usersByUuid]
  );

  function add(uuid: string) {
    setMemberUuids(prev => (prev.includes(uuid) ? prev : [...prev, uuid]));
  }

  function remove(uuid: string) {
    setMemberUuids(prev => prev.filter(x => x !== uuid));
    setLeaders(prev => {
      const { [uuid]: _drop, ...rest } = prev;
      return rest;
    });
  }

  async function save() {
    if (!name.trim()) {
      alert('Name ist erforderlich.');
      return;
    }
    setSaving(true);
    try {
      let teamId = team?.id ?? null;
      if (!teamId) {
        const r = await authedFetch('/api/admin/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'Team anlegen fehlgeschlagen.');
        teamId = j?.id ?? j?.data?.id;
      } else {
        const r = await authedFetch(`/api/admin/teams/${teamId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'Team speichern fehlgeschlagen.');
      }

      if (teamId) {
        const members = memberUuids.map(uuid => ({
          user_id: uuid,
          is_teamleiter: !!leaders[uuid]
        }));
        const r2 = await authedFetch(`/api/admin/teams/${teamId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ members }),
        });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j2?.error || 'Mitglieder konnten nicht gespeichert werden.');
      }

      onSaved();
      onClose();
    } catch (e: any) {
      alert(e?.message ?? 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-8 mx-auto max-w-5xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {creating ? 'Neues Team' : `Team bearbeiten: ${team?.name}`}
          </div>
          <div className="flex gap-2">
            <button className={btnBase} onClick={onClose}>Schließen</button>
            <button className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div>
              <label className="form-label">Name</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="text-sm text-gray-500">
              Tipp: Teamleiter markieren mit dem ★-Button in der Mitgliederliste.
            </p>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Mitglieder ({selected.length})</div>
              <input
                className={inputClass + ' max-w-[220px]'}
                placeholder="Benutzer suchen…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3">
                <div className="text-sm mb-2 text-gray-500">Verfügbar</div>
                <div className="max-h-[260px] overflow-auto grid gap-2">
                  {loadingMembers && <div className="text-sm text-gray-500">lädt…</div>}
                  {!loadingMembers && available.map(u => (
                    <button
                      key={u.id}
                      onClick={() => u.user_id && add(u.user_id)}
                      className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/20"
                    >
                      <span className="truncate">
                        <span className="font-medium">{u.name ?? u.email}</span>
                        {u.name ? <span className="text-gray-500 ml-2">{u.email}</span> : null}
                      </span>
                      <span className="text-xs text-gray-500">hinzufügen</span>
                    </button>
                  ))}
                  {!loadingMembers && available.length === 0 && (
                    <div className="text-sm text-gray-500">Keine Treffer.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 dark:border-blue-900 p-3 bg-blue-50/40 dark:bg-blue-900/10">
                <div className="text-sm mb-2 text-gray-500">Mitglied im Team</div>
                <div className="max-h-[260px] overflow-auto grid gap-2">
                  {selected.map(u => {
                    const uuid = u.user_id!;
                    const isLeader = !!leaders[uuid];
                    return (
                      <div
                        key={uuid ?? `x-${u.id}`}
                        className="flex items-center justify-between rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-white/10 px-3 py-2"
                      >
                        <span className="truncate flex items-center gap-2">
                          <button
                            type="button"
                            title={isLeader ? 'Teamleiter' : 'Als Teamleiter ernennen'}
                            onClick={() => setLeaders(prev => ({ ...prev, [uuid]: !prev[uuid] }))}
                            className={'text-lg leading-none ' +
                              (isLeader ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300')}
                          >
                            ★
                          </button>
                          <span>
                            <span className="font-medium">{u.name ?? u.email}</span>
                            {u.name ? <span className="text-gray-500 ml-2">{u.email}</span> : null}
                          </span>
                          {isLeader && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                              Teamleiter
                            </span>
                          )}
                        </span>
                        <button className="text-xs underline" onClick={() => uuid && remove(uuid)}>
                          entfernen
                        </button>
                      </div>
                    );
                  })}
                  {selected.length === 0 && <div className="text-sm text-gray-500">Noch keine Mitglieder.</div>}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ========= GRUPPEN-MODAL ========= */
function GroupModal({
  open,
  onClose,
  group,
  allUsers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  group: Group | null;
  allUsers: AppUser[];
  onSaved: () => void;
}) {
  const creating = !group;
  const [name, setName] = useState(group?.name ?? '');
  const [desc, setDesc] = useState(group?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(!!group?.is_private);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const usersByUuid = useMemo(() => {
    const m = new Map<string, AppUser>();
    for (const u of allUsers) if (u.user_id) m.set(u.user_id, u);
    return m;
  }, [allUsers]);

  const [memberUuids, setMemberUuids] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setDesc(group?.description ?? '');
    setIsPrivate(!!group?.is_private);
    setPassword('');
    setMemberUuids([]);
    setFilter('');
    if (group?.id) {
      (async () => {
        setLoadingMembers(true);
        try {
          const r = await authedFetch(`/api/admin/groups/${group.id}/members`);
          const j = await r.json().catch(() => ({}));
          const uuids: string[] = Array.isArray(j?.members)
            ? j.members.map((m: any) => String(m.user_id)).filter(Boolean)
            : [];
          setMemberUuids(uuids);
        } finally {
          setLoadingMembers(false);
        }
      })();
    }
  }, [open, group]);

  const available = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return allUsers
      .filter(u => u.user_id && !memberUuids.includes(u.user_id))
      .filter(u => {
        if (!f) return true;
        const hay = `${u.email} ${u.name ?? ''}`.toLowerCase();
        return hay.includes(f);
      });
  }, [allUsers, memberUuids, filter]);

  const selected = useMemo(
    () => memberUuids.map(uuid => usersByUuid.get(uuid)).filter((x): x is AppUser => !!x),
    [memberUuids, usersByUuid]
  );

  function add(uuid: string) {
    setMemberUuids(prev => (prev.includes(uuid) ? prev : [...prev, uuid]));
  }

  function remove(uuid: string) {
    setMemberUuids(prev => prev.filter(x => x !== uuid));
  }

  async function save() {
    if (!name.trim()) {
      alert('Name ist erforderlich.');
      return;
    }
    setSaving(true);
    try {
      let groupId = group?.id ?? null;
      {
        const url = creating ? '/api/admin/groups' : `/api/admin/groups/${groupId}`;
        const method = creating ? 'POST' : 'PATCH';
        const body: any = {
          name: name.trim(),
          description: desc.trim() || null,
          is_private: isPrivate,
        };
        if (password.trim()) body.password = password.trim();

        const r = await authedFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'Speichern fehlgeschlagen.');
        if (creating) groupId = j?.id ?? j?.data?.id;
      }

      if (groupId) {
        const r2 = await authedFetch(`/api/admin/groups/${groupId}/members`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: memberUuids }),
        });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j2?.error || 'Mitglieder konnten nicht gespeichert werden.');
      }

      onSaved();
      onClose();
    } catch (e: any) {
      alert(e?.message ?? 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-8 mx-auto max-w-5xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {creating ? 'Neue Gruppe' : `Gruppe bearbeiten: ${group?.name}`}
          </div>
          <div className="flex gap-2">
            <button className={btnBase} onClick={onClose}>Schließen</button>
            <button className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-6">
          <section className="space-y-3">
            <div>
              <label className="form-label">Name</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Beschreibung</label>
              <input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <Switch checked={isPrivate} onChange={setIsPrivate} label="Privat (nur Einladung/Passwort)" />
            <div>
              <label className="form-label">Passwort (optional)</label>
              <input
                className={inputClass}
                type="password"
                placeholder="leer lassen = unverändert"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Mitglieder ({selected.length})</div>
              <input
                className={inputClass + ' max-w-[220px]'}
                placeholder="Benutzer suchen…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3">
                <div className="text-sm mb-2 text-gray-500">Verfügbar</div>
                <div className="max-h-[260px] overflow-auto grid gap-2">
                  {loadingMembers && <div className="text-sm text-gray-500">lädt…</div>}
                  {!loadingMembers && available.map(u => (
                    <button
                      key={u.id}
                      onClick={() => u.user_id && add(u.user_id)}
                      className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/20"
                    >
                      <span className="truncate">
                        <span className="font-medium">{u.name ?? u.email}</span>
                        {u.name ? <span className="text-gray-500 ml-2">{u.email}</span> : null}
                      </span>
                      <span className="text-xs text-gray-500">hinzufügen</span>
                    </button>
                  ))}
                  {!loadingMembers && available.length === 0 && (
                    <div className="text-sm text-gray-500">Keine Treffer.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 dark:border-blue-900 p-3 bg-blue-50/40 dark:bg-blue-900/10">
                <div className="text-sm mb-2 text-gray-500">Mitglied in Gruppe</div>
                <div className="max-h-[260px] overflow-auto grid gap-2">
                  {selected.map(u => {
                    const uuid = u.user_id!;
                    return (
                      <div
                        key={uuid ?? `x-${u.id}`}
                        className="flex items-center justify-between rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-white/10 px-3 py-2"
                      >
                        <span className="truncate">
                          <span className="font-medium">{u.name ?? u.email}</span>
                          {u.name ? <span className="text-gray-500 ml-2">{u.email}</span> : null}
                        </span>
                        <button className="text-xs underline" onClick={() => uuid && remove(uuid)}>
                          entfernen
                        </button>
                      </div>
                    );
                  })}
                  {selected.length === 0 && <div className="text-sm text-gray-500">Noch keine Mitglieder.</div>}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ======================= MAIN PAGE ======================= */
export default function UsersAdminPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [allUsersForModals, setAllUsersForModals] = useState<AppUser[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [fEmail, setFEmail] = useState('');
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState<Role>('user');
  const [fActive, setFActive] = useState(true);
  const [fPassword, setFPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [groups, setGroups] = useState<Group[]>([]);
  const [gQ, setGQ] = useState('');
  const [gLoading, setGLoading] = useState(false);
  const [groupModal, setGroupModal] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });

  const [assignOpen, setAssignOpen] = useState<null | { user: AppUser; groupIds: number[] }>(null);

  const [inviteOpen, setInviteOpen] = useState<null | {
    groupId: number | null;
    selectedIds: number[];
    message: string;
    filter: string;
    onlyPrivate: boolean;
  }>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [tQ, setTQ] = useState('');
  const [tLoading, setTLoading] = useState(false);
  const [teamModal, setTeamModal] = useState<{ open: boolean; team: Team | null }>({ open: false, team: null });

  const [teamAssignOpen, setTeamAssignOpen] = useState<null | { user: AppUser; teamId: number | null }>(null);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  // Lade ALLE User für Modals (nicht paginiert)
  const loadAllUsers = useCallback(async () => {
    const res = await authedFetch('/api/admin/users?pageSize=9999');
    const json = await res.json().catch(() => ({}));
    setAllUsersForModals(json.data ?? []);
  }, []);

  useEffect(() => {
    loadAllUsers();
  }, [loadAllUsers]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    const res = await authedFetch(`/api/admin/users?${params.toString()}`);
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
    const payload: any = { email: fEmail.trim(), name: fName.trim() || null, role: fRole, active: fActive };
    if (creating) payload.password = fPassword;
    try {
      const url = creating ? '/api/admin/users' : `/api/admin/users/${editingId}`;
      const method = creating ? 'POST' : 'PATCH';
      const res = await authedFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Fehler beim Speichern');
      setMsg(creating ? 'Benutzer angelegt.' : 'Aktualisiert.');
      await load();
      await loadAllUsers();
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
    const res = await authedFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
      await loadAllUsers();
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
    const res = await authedFetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Passwort setzen fehlgeschlagen');
      return;
    }
    alert('Passwort aktualisiert.');
  }

  const loadGroups = useCallback(async () => {
    setGLoading(true);
    const r = await authedFetch('/api/admin/groups');
    const j = await r.json().catch(() => ({}));
    setGroups(Array.isArray(j.data) ? j.data : []);
    setGLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function openAssign(u: AppUser) {
    const r = await authedFetch(`/api/admin/users/${u.id}/groups`);
    const j = await r.json().catch(() => ({}));
    const ids: number[] = Array.isArray(j.groupIds) ? j.groupIds : [];
    setAssignOpen({ user: u, groupIds: ids });
  }

  async function saveAssign() {
    if (!assignOpen) return;
    const ids = assignOpen.groupIds;
    const r = await authedFetch(`/api/admin/users/${assignOpen.user.id}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: ids })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j.error ?? 'Zuweisung fehlgeschlagen');
      return;
    }
    setAssignOpen(null);
    loadGroups();
  }

  const gFiltered = useMemo(() => {
    const q2 = gQ.trim().toLowerCase();
    return !q2 ? groups : groups.filter(g => g.name.toLowerCase().includes(q2) || (g.description ?? '').toLowerCase().includes(q2));
  }, [gQ, groups]);

  const loadTeams = useCallback(async () => {
    setTLoading(true);
    const r = await authedFetch(`/api/admin/teams`);
    const j = await r.json().catch(() => ({}));
    const items: Team[] = Array.isArray(j?.data)
      ? j.data.map((t: any) => ({
          id: Number(t.id),
          name: String(t.name),
          memberCount: Number(t.memberCount) || 0,
          created_at: t.created_at ?? null,
        }))
      : [];
    setTeams(items);
    setTLoading(false);
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  async function openTeamAssign(u: AppUser) {
    if (!u.user_id) {
      alert('Nutzer hat keine Auth-UUID.');
      return;
    }
    let activeTeamId: number | null = null;
    for (const t of teams) {
      const r = await authedFetch(`/api/admin/teams/${t.id}/members/${u.user_id}`);
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j?.member && j.member.active) {
          activeTeamId = t.id;
          break;
        }
      }
    }
    setTeamAssignOpen({ user: u, teamId: activeTeamId });
  }

  async function saveTeamAssign() {
    if (!teamAssignOpen) return;
    const teamId = teamAssignOpen.teamId;
    const userUuid = teamAssignOpen.user.user_id;
    if (!teamId || !userUuid) {
      alert('Bitte Team wählen & Nutzer mit UUID.');
      return;
    }
    const r = await authedFetch(`/api/admin/teams/${teamId}/members/${userUuid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j.error ?? 'Teamzuweisung fehlgeschlagen');
      return;
    }
    setTeamAssignOpen(null);
    loadTeams();
  }

  const tFiltered = useMemo(() => {
    const q2 = tQ.trim().toLowerCase();
    return !q2 ? teams : teams.filter(t => t.name.toLowerCase().includes(q2));
  }, [tQ, teams]);

  const allUsersById = useMemo(() => {
    const m = new Map<number, AppUser>();
    for (const u of allUsersForModals) m.set(u.id, u);
    return m;
  }, [allUsersForModals]);

  function addRecipient(id: number) {
    setInviteOpen(prev => prev ? { ...prev, selectedIds: Array.from(new Set([...prev.selectedIds, id])) } : prev);
  }

  function removeRecipient(id: number) {
    setInviteOpen(prev => prev ? { ...prev, selectedIds: prev.selectedIds.filter(x => x !== id) } : prev);
  }

  async function sendInvites() {
    if (!inviteOpen) return;
    const groupId = inviteOpen.groupId;
    if (!groupId) {
      alert('Bitte eine Zielgruppe auswählen.');
      return;
    }
    if (inviteOpen.selectedIds.length === 0) {
      alert('Bitte mindestens einen Empfänger auswählen.');
      return;
    }
    const selectedUuids = inviteOpen.selectedIds
      .map(id => allUsersById.get(id)?.user_id || null)
      .filter((x): x is string => !!x);
    if (selectedUuids.length === 0) {
      alert('Ausgewählte Benutzer haben keine verknüpfte Auth-ID (user_id).');
      return;
    }
    const r = await authedFetch(`/api/admin/groups/${groupId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: selectedUuids, message: inviteOpen.message || null })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j.error || 'Einladungen konnten nicht gesendet werden.');
      return;
    }
    setInviteOpen(null);
    alert('Einladungen verschickt.');
  }

  const modalAvailableUsers = useMemo(() => {
    if (!inviteOpen) return [];
    const f = inviteOpen.filter.trim().toLowerCase();
    return allUsersForModals
      .filter(u => !!u.user_id)
      .filter(u => !inviteOpen.selectedIds.includes(u.id))
      .filter(u => {
        if (!f) return true;
        const hay = `${u.email} ${u.name ?? ''}`.toLowerCase();
        return hay.includes(f);
      });
  }, [allUsersForModals, inviteOpen]);

  const modalSelectedUsers = useMemo(() => {
    if (!inviteOpen) return [];
    return inviteOpen.selectedIds
      .map(id => allUsersById.get(id))
      .filter((u): u is AppUser => !!u);
  }, [inviteOpen, allUsersById]);

  function onDragStartUser(e: React.DragEvent, id: number) {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDropToSelected(e: React.DragEvent) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isFinite(id)) addRecipient(id);
  }

  function onDropToAvailable(e: React.DragEvent) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isFinite(id)) removeRecipient(id);
  }

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      {/* Rest der UI wie bisher, Modals am Ende */}
      
      {/* TEAMS MODAL - NUTZT allUsersForModals */}
      <TeamModal
        open={teamModal.open}
        onClose={() => setTeamModal({ open: false, team: null })}
        team={teamModal.team}
        allUsers={allUsersForModals}
        onSaved={() => {
          loadTeams();
          load();
          loadAllUsers();
        }}
      />

      {/* GRUPPEN MODAL - NUTZT allUsersForModals */}
      <GroupModal
        open={groupModal.open}
        onClose={() => setGroupModal({ open: false, group: null })}
        group={groupModal.group}
        allUsers={allUsersForModals}
        onSaved={() => {
          loadGroups();
          load();
          loadAllUsers();
        }}
      />

      {/* REST DER UI (Tabellen, Forms etc.) */}
    </div>
  );
}
