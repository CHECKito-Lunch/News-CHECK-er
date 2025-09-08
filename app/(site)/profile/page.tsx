'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string; email?: string } | null };

type Group = {
  id: number;
  name: string;
  description?: string | null;
  memberCount?: number | null;
  isMember?: boolean; // optional – falls API das direkt mitliefert
};

type MembershipRes = { groupIds?: number[] } | number[]; // flexibel
type UnreadRes = {
  ok: boolean;
  last_seen_at: string | null; // ISO
  total: number;
  unread?: number;
  preview: { id: number; slug: string | null; title: string; summary: string | null; effective_from: string }[];
};

const card = 'p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm';

export default function ProfilePage() {
  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mein Profil</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">Zur Startseite</Link>
      </header>

      {/* 2-spaltig ab md */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <TeamsAndGroups />
          <ProfileCard />
          <PasswordCard />
        </div>

        <div className="space-y-6">
          <UnreadCard />
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Teams & Benutzergruppen
=========================== */
function TeamsAndGroups() {
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [myGroupIds, setMyGroupIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  // Laden
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const [gRes, mRes] = await Promise.all([
          fetch('/api/groups', { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
          fetch('/api/groups/memberships', { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
        ]);

        const groups: Group[] = Array.isArray(gRes?.data) ? gRes.data : Array.isArray(gRes) ? gRes : [];
        let memberIds: number[] = [];

        // memberships kann Array sein ODER {groupIds: number[]}
        if (Array.isArray(mRes)) memberIds = mRes as number[];
        else if (Array.isArray(mRes?.groupIds)) memberIds = mRes.groupIds as number[];
        else if (Array.isArray(groups)) {
          // fallback: aus isMember ableiten
          memberIds = groups.filter(g => !!g.isMember).map(g => g.id);
        }

        if (!alive) return;
        setAllGroups(groups);
        setMyGroupIds(memberIds);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter(g => g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q));
  }, [query, allGroups]);

  const isMember = (id: number) => myGroupIds.includes(id);

  async function toggleMembership(groupId: number, join: boolean) {
    // Optimistisches UI
    setMyGroupIds(prev => {
      const has = prev.includes(groupId);
      if (join && !has) return [...prev, groupId];
      if (!join && has) return prev.filter(id => id !== groupId);
      return prev;
    });

    // 1) Versuche POST mit Aktion
    const attempt1 = await fetch('/api/groups/memberships', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, action: join ? 'join' : 'leave' }),
    });

    if (attempt1.ok) return;

    // 2) Fallback: Full-Replace via PUT
    const nextIds = join ? Array.from(new Set([...myGroupIds, groupId])) : myGroupIds.filter(id => id !== groupId);
    await fetch('/api/groups/memberships', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: nextIds }),
    });
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">Teams &amp; Gruppen</h2>
        <input
          placeholder="Gruppen suchen…"
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading && <div className="text-sm text-gray-500">Lade Gruppen…</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-sm text-gray-500">Keine Gruppen gefunden.</div>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {filtered.map(g => {
            const active = isMember(g.id);
            return (
              <li key={g.id}>
                <button
                  onClick={() => toggleMembership(g.id, !active)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border shadow-sm
                    ${active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/20'
                    }`}
                  title={g.description ?? ''}
                >
                  <span className="font-medium">{g.name}</span>
                  {typeof g.memberCount === 'number' && (
                    <span className={`text-xs inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full
                      ${active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}
                    `}>
                      {g.memberCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-500 mt-3">
        Wähle Gruppen, um zielgerichtete News &amp; Benachrichtigungen zu erhalten – ähnlich wie bei Slack Channels.
      </p>
    </section>
  );
}

/* ===========================
   Profil bearbeiten (Name)
=========================== */
function ProfileCard() {
  const [me, setMe] = useState<Me['user']>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
        const j: Me = await r.json();
        if (!alive) return;
        setMe(j.user);
        setName(j.user?.name ?? '');
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        setMsg('Profil aktualisiert.');
        window.dispatchEvent(new Event('auth-changed')); // Header aktualisieren
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(j?.error || 'Aktualisierung fehlgeschlagen.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold mb-3">Profil</h2>
      <form onSubmit={onSubmit} className="grid gap-3 max-w-md">
        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">Name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
            placeholder="Anzeigename"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">E-Mail</span>
          <input
            value={me?.email ?? ''}
            readOnly
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 text-gray-500"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm shadow-sm"
          >
            Speichern
          </button>
          {msg && <span className="text-sm text-gray-600 dark:text-gray-300">{msg}</span>}
        </div>
      </form>
    </section>
  );
}

/* ===========================
   Passwort ändern
=========================== */
function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  const valid = newPassword.length >= 8 && newPassword === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!valid) {
      setMsg('Passwörter stimmen nicht überein oder sind zu kurz (min. 8 Zeichen).');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (r.ok) {
        setMsg('Passwort aktualisiert.');
        setCurrentPassword(''); setNewPassword(''); setConfirm('');
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(j?.error || 'Aktualisierung fehlgeschlagen.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold mb-3">Sicherheit</h2>
      <form onSubmit={onSubmit} className="grid gap-3 max-w-md">
        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">Aktuelles Passwort</span>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">Neues Passwort</span>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
            placeholder="min. 8 Zeichen"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">Neues Passwort bestätigen</span>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            disabled={saving || !valid}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm shadow-sm"
          >
            Passwort ändern
          </button>
          {msg && <span className="text-sm text-gray-600 dark:text-gray-300">{msg}</span>}
        </div>
      </form>
    </section>
  );
}

/* ===========================
   Unread-Panel (aufgehübscht)
=========================== */
function UnreadCard() {
  const [data, setData] = useState<UnreadRes | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/unread', { credentials: 'include', cache: 'no-store' });
        const j = await r.json();
        if (alive) setData(j.ok ? j : null);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const count = data?.unread ?? data?.total ?? 0;
  const lastSeenStr = data?.last_seen_at
    ? new Date(data.last_seen_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : '–';

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Verpasst seit letztem Besuch</h2>
        <form onSubmit={async (e) => {
          e.preventDefault();
          await fetch('/api/unread/seen', { method: 'POST', credentials: 'include' });
          // Nach dem Markieren neu laden
          const r = await fetch('/api/unread', { credentials: 'include', cache: 'no-store' });
          const j = await r.json();
          setData(j.ok ? j : null);
          // Header-Badge live aktualisieren
          window.dispatchEvent(new Event('auth-changed'));
        }}>
          <button className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700">
            Als gelesen markieren
          </button>
        </form>
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && data && (
        <>
          <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            {count} neue Beiträge seit {lastSeenStr}
          </div>

          {data.preview.length > 0 ? (
            <ul className="space-y-2">
              {data.preview.map(p => (
                <li key={p.id} className="text-sm">
                  <Link
                    href={p.slug ? `/news/${p.slug}` : `/news?open=${p.id}`}
                    className="text-blue-700 dark:text-blue-400 underline"
                  >
                    {p.title}
                  </Link>
                  <span className="text-gray-500 dark:text-gray-400">
                    {' '}· {new Date(p.effective_from).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-500">Keine neuen Beiträge.</div>
          )}
        </>
      )}

      {!loading && !data && (
        <div className="text-sm text-gray-500">Keine Daten abrufbar.</div>
      )}
    </section>
  );
}
