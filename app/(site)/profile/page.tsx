'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/fetchWithSupabase';

/* ===========================
   Types
=========================== */
type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string; email?: string } | null };

type Group = {
  id: number;
  name: string;
  description?: string | null;
  memberCount?: number | null;
  isMember?: boolean;
};

type MembershipRes = { groupIds?: number[] } | number[];
type UnreadRes = {
  ok: boolean;
  last_seen_at: string | null;
  total: number;
  unread?: number;
  preview: { id: number; slug: string | null; title: string; summary: string | null; effective_from: string }[];
};

type Invitation = {
  id: number;
  group_id: number;
  group_name: string;
  message: string | null;
  created_at: string;
  invited_by: string;
  invited_by_name: string | null;
  invited_by_email: string | null;
};

type MyEvent = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  hero_image_url: string | null;
  state: 'confirmed' | 'waitlist';
};

/* 🆕 Feedback */
type FeedbackItem = {
  id: string | number;
  ts?: string | null;
  bewertung?: number | null;
  beraterfreundlichkeit?: number | null;
  beraterqualifikation?: number | null;
  angebotsattraktivitaet?: number | null;
  kommentar?: string | null;
  template_name?: string | null;
  rekla?: string | null;        // "ja"/"nein"
  geklaert?: string | null;     // "ja"/"nein"
  feedbacktyp: 'service_mail' | 'service_mail_rekla' | 'service_phone' | 'sales_phone' | 'sales_lead' | string;
};
type FeedbackRes = { ok: boolean; items: FeedbackItem[] };

/* ===========================
   UI Tokens
=========================== */
const card =
  'p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm';

/* ===========================
   Page
=========================== */
export default function ProfilePage() {
  const [psOpen, setPsOpen] = useState(false); // Modal "Profil & Sicherheit"

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mein Profil</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Zur Startseite
        </Link>
      </header>

      {/* 2-spaltig ab md */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <TeamsAndGroups />
          <ProfileSecurityCard onOpen={() => setPsOpen(true)} />
        </div>

        <div className="space-y-6">
          <InvitesCard />
          <MyEventsCard />
          <FeedbackCard /> {/* 🆕 Feedback mit Gamification */}
          <UnreadCard />
        </div>
      </div>

      {/* Gemeinsames Modal: Profil & Sicherheit */}
      <ProfileSecurityModal open={psOpen} onClose={() => setPsOpen(false)} />
    </div>
  );
}

/* ===========================
   🔵 Modal (leichtgewichtig)
=========================== */
function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-20 mx-auto max-w-xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Schließen
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================
   📨 Einladungen-Karte
=========================== */
function InvitesCard() {
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [openId, setOpenId] = useState<number | null>(null); // Modal

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const r = await authedFetch('/api/me/invitations');
        if (r.status === 401) {
          if (alive) {
            setItems([]);
            setError('Bitte anmelden, um Einladungen zu sehen.');
          }
          return;
        }
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j?.items) ? j.items : [];
        const casted: Invitation[] = arr.map((x: any) => ({
          ...x,
          group_id: Number(x.group_id),
        }));
        if (alive) setItems(casted);
      } catch {
        if (alive) {
          setError('Einladungen konnten nicht geladen werden.');
          setItems([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function accept(id: number) {
    const prev = items ?? [];
    setItems(prev.filter((i) => i.id !== id)); // optimistic
    try {
      const r = await authedFetch(`/api/invitations/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error('Fehler beim Annehmen');
      window.dispatchEvent(new Event('groups-changed'));
      setOpenId(null);
    } catch {
      setItems(prev);
      alert('Konnte Einladung nicht annehmen.');
    }
  }

  async function decline(id: number) {
    const prev = items ?? [];
    setItems(prev.filter((i) => i.id !== id));
    try {
      const r = await authedFetch(`/api/invitations/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error('Fehler beim Ablehnen');
      setOpenId(null);
    } catch {
      setItems(prev);
      alert('Konnte Einladung nicht ablehnen.');
    }
  }

  const current = items?.find((i) => i.id === openId) || null;

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Einladungen</h2>
        {items && items.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 text-xs rounded-full bg-blue-600 text-white">
            {items.length}
          </span>
        )}
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}
      {!loading && error && (
        <div className="text-sm text-amber-700 dark:text-amber-400">{error}</div>
      )}
      {!loading && !error && items && items.length === 0 && (
        <div className="text-sm text-gray-500">Keine offenen Einladungen.</div>
      )}

      {!loading && !error && items && items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((inv) => (
            <li
              key={inv.id}
              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{inv.group_name}</div>
                  <div className="text-xs text-gray-500">
                    eingeladen{' '}
                    {new Date(inv.created_at).toLocaleString('de-DE', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                    {inv.invited_by_name
                      ? ` · von ${inv.invited_by_name}`
                      : inv.invited_by_email
                      ? ` · von ${inv.invited_by_email}`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setOpenId(inv.id)}
                    className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => accept(inv.id)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Annehmen
                  </button>
                  <button
                    onClick={() => decline(inv.id)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white"
                  >
                    Ablehnen
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!current}
        title={current ? `Einladung: ${current.group_name}` : 'Einladung'}
        onClose={() => setOpenId(null)}
        footer={
          current && (
            <>
              <button
                onClick={() => setOpenId(null)}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20"
              >
                Schließen
              </button>
              <button
                onClick={() => decline(current.id)}
                className="px-3 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white"
              >
                Ablehnen
              </button>
              <button
                onClick={() => accept(current.id)}
                className="px-3 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Annehmen
              </button>
            </>
          )
        }
      >
        {current ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                Gruppe
              </div>
              <div className="font-medium">{current.group_name}</div>
            </div>
            {current.message && (
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  Nachricht
                </div>
                <div className="text-sm whitespace-pre-wrap">{current.message}</div>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  Eingeladen am
                </div>
                <div className="text-sm">
                  {new Date(current.created_at).toLocaleString('de-DE', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  Von
                </div>
                <div className="text-sm">
                  {current.invited_by_name || current.invited_by_email || '—'}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Hinweis: Private/Passwort-Gruppen erscheinen nicht in der offenen
              Liste und sind nur per Einladung betretbar.
            </p>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}

/* ===========================
   Teams & Benutzergruppen
   + geschlossene Member-Gruppen nachladen
=========================== */
function TeamsAndGroups() {
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [myGroupIds, setMyGroupIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [authRequired, setAuthRequired] = useState(false);

  function hasAuthCookie() {
    return /(?:^|;\s)(user_id|auth|AUTH_COOKIE)=/.test(document.cookie);
  }

  useEffect(() => {
    let alive = true;

    async function fetchClosedGroupsByIds(ids: number[]): Promise<Group[]> {
      if (!ids.length) return [];
      try {
        const r = await authedFetch(`/api/groups/byIds?ids=${ids.join(',')}`);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (Array.isArray(j?.data)) return j.data as Group[];
        }
      } catch {}
      try {
        const r = await authedFetch(`/api/groups?ids=${ids.join(',')}`);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          const data = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
          if (Array.isArray(data)) return data as Group[];
        }
      } catch {}
      try {
        const r = await authedFetch(`/api/groups/mine`);
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          const data = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
          const map = new Map<number, Group>();
          (data as Group[]).forEach((g) => map.set(g.id, g));
          return ids.map((id) => map.get(id)).filter(Boolean) as Group[];
        }
      } catch {}
      return ids.map((id) => ({
        id,
        name: `Private Gruppe #${id}`,
        description: 'Geschlossene Gruppe',
        memberCount: null,
        isMember: true,
      }));
    }

    async function load() {
      setLoading(true);
      setAuthRequired(false);

      if (!hasAuthCookie()) {
        setAuthRequired(true);
        setAllGroups([]);
        setMyGroupIds([]);
        setLoading(false);
        return;
      }

      try {
        const meRes = await authedFetch('/api/me');
        const meJson: Me = await meRes.json().catch(() => ({ user: null as any }));
        if (!alive) return;

        if (!meRes.ok || !meJson?.user) {
          setAuthRequired(true);
          setAllGroups([]);
          setMyGroupIds([]);
          return;
        }

        const [gRes, mRes] = await Promise.all([
          authedFetch('/api/groups'),
          authedFetch('/api/groups/memberships'),
        ]);

        if ((!gRes.ok && gRes.status === 401) || (!mRes.ok && mRes.status === 401)) {
          if (!alive) return;
          setAuthRequired(true);
          setAllGroups([]);
          setMyGroupIds([]);
          return;
        }

        const gJ = await gRes.json().catch(() => ({}));
        const openGroups: Group[] = Array.isArray(gJ?.data)
          ? gJ.data
          : Array.isArray(gJ?.groups)
          ? gJ.groups
          : Array.isArray(gJ?.items)
          ? gJ.items
          : Array.isArray(gJ)
          ? gJ
          : [];

        const mJ = await mRes.json().catch(() => ({}));
        let memberIds: number[] = [];
        if (Array.isArray(mJ)) memberIds = mJ as number[];
        else if (Array.isArray(mJ?.groupIds)) memberIds = mJ.groupIds as number[];
        else if (Array.isArray(mJ?.memberships))
          memberIds = mJ.memberships.map((x: any) => Number(x.groupId)).filter(Number.isFinite);
        else memberIds = openGroups.filter((g) => !!g.isMember).map((g) => g.id);

        const missingIds = memberIds.filter((id) => !openGroups.some((g) => g.id === id));
        const closedGroups = await fetchClosedGroupsByIds(missingIds);

        const mergedMap = new Map<number, Group>();
        [...openGroups, ...closedGroups].forEach((g) => {
          mergedMap.set(g.id, {
            ...g,
            isMember: memberIds.includes(g.id) || !!g.isMember,
          });
        });

        if (!alive) return;
        setAllGroups(Array.from(mergedMap.values()));
        setMyGroupIds(memberIds);
      } catch {
        if (!alive) return;
        setAuthRequired(true);
        setAllGroups([]);
        setMyGroupIds([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    const onGroupsChanged = () => load();
    window.addEventListener('groups-changed', onGroupsChanged);
    return () => {
      alive = false;
      window.removeEventListener('groups-changed', onGroupsChanged);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q)
    );
  }, [query, allGroups]);

  const isMember = (id: number) => myGroupIds.includes(id);

  async function toggleMembership(groupId: number, join: boolean) {
    setMyGroupIds((prev) => {
      const has = prev.includes(groupId);
      if (join && !has) return [...prev, groupId];
      if (!join && has) return prev.filter((id) => id !== groupId);
      return prev;
    });

    const attempt1 = await authedFetch('/api/groups/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, action: join ? 'join' : 'leave' }),
    });
    if (attempt1.ok) return;

    const nextIds = join
      ? Array.from(new Set([...myGroupIds, groupId]))
      : myGroupIds.filter((id) => id !== groupId);

    await authedFetch('/api/groups/memberships', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: nextIds }),
    });
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">Teams &amp; Gruppen</h2>
        {!authRequired && (
          <input
            placeholder="Gruppen suchen…"
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && authRequired && (
        <div className="text-sm text-amber-700 dark:text-amber-400">
          Bitte <a href="/login" className="underline">anmelden</a>, um Gruppen zu sehen und beizutreten.
        </div>
      )}

      {!loading && !authRequired && filtered.length === 0 && (
        <div className="text-sm text-gray-500">Keine Gruppen gefunden.</div>
      )}

      {!loading && !authRequired && filtered.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {filtered.map((g) => {
            const active = isMember(g.id);

            const commonInner = (
              <>
                <span className="font-medium">{g.name}</span>
                {typeof g.memberCount === 'number' && (
                  <span
                    className={`text-xs inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full
                      ${active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                  >
                    {g.memberCount}
                  </span>
                )}
              </>
            );

            return (
              <li key={g.id} title={g.description ?? ''}>
                {active ? (
                  <Link
                    href={`/groups/${g.id}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border shadow-sm
                      bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  >
                    {commonInner}
                  </Link>
                ) : (
                  <button
                    onClick={() => toggleMembership(g.id, true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border shadow-sm
                      bg-white dark:bg-white/10 text-gray-700 dark:text-gray-100 border-gray-200 dark:border-gray-700
                      hover:bg-gray-50 dark:hover:bg-white/20"
                  >
                    {commonInner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!authRequired && (
        <p className="text-xs text-gray-500 mt-3">
          Wähle Gruppen, um zielgerichtete News &amp; Benachrichtigungen zu
          erhalten.
        </p>
      )}
    </section>
  );
}

/* ===========================
   Profil & Sicherheit – Karte (öffnet Modal)
=========================== */
function ProfileSecurityCard({ onOpen }: { onOpen: () => void }) {
  const [me, setMe] = useState<Me['user']>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await authedFetch('/api/me');
        const j: Me = await r.json();
        if (!alive) return;
        setMe(j.user);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Profil &amp; Sicherheit</h2>
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm shadow-sm"
        >
          Bearbeiten
        </button>
      </div>
      <div className="grid gap-2 text-sm">
        <div>
          <span className="text-gray-500">Name:</span>{' '}
          <span className="ml-2">{me?.name ?? '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">E-Mail:</span>{' '}
          <span className="ml-2">{me?.email ?? '—'}</span>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Klicke auf „Bearbeiten“, um Angaben zu ändern oder dein Passwort zu
          aktualisieren.
        </div>
      </div>
    </section>
  );
}

/* ===========================
   Profil & Sicherheit – Modal-Inhalt
=========================== */
function ProfileSecurityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [me, setMe] = useState<Me['user']>(null);

  // Profile form
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [msgProfile, setMsgProfile] = useState<string>('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [msgPw, setMsgPw] = useState<string>('');
  const validPw = newPassword.length >= 8 && newPassword === confirm;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const r = await authedFetch('/api/me');
        const j: Me = await r.json();
        if (!alive) return;
        setMe(j.user);
        setName(j.user?.name ?? '');
        setMsgProfile('');
        setMsgPw('');
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setMsgProfile('');
    try {
      const r = await authedFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        setMsgProfile('Profil aktualisiert.');
        window.dispatchEvent(new Event('auth-changed'));
      } else {
        const j = await r.json().catch(() => ({}));
        setMsgProfile(j?.error || 'Aktualisierung fehlgeschlagen.');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setMsgPw('');
    if (!validPw) {
      setMsgPw('Passwörter stimmen nicht überein oder sind zu kurz (min. 8 Zeichen).');
      return;
    }
    setSavingPw(true);
    try {
      const r = await authedFetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (r.ok) {
        setMsgPw('Passwort aktualisiert.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirm('');
      } else {
        const j = await r.json().catch(() => ({}));
        setMsgPw(j?.error || 'Aktualisierung fehlgeschlagen.');
      }
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Profil & Sicherheit">
      <div className="grid gap-6">
        {/* Profil */}
        <form onSubmit={saveProfile} className="grid gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">Profil</div>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-300">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm shadow-sm"
            >
              Speichern
            </button>
            {msgProfile && (
              <span className="text-sm text-gray-600 dark:text-gray-300">{msgProfile}</span>
            )}
          </div>
        </form>

        <hr className="border-gray-200 dark:border-gray-800" />

        {/* Sicherheit */}
        <form onSubmit={changePw} className="grid gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">Sicherheit</div>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-300">Aktuelles Passwort</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-300">Neues Passwort</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
              placeholder="min. 8 Zeichen"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-300">Neues Passwort bestätigen</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              disabled={savingPw || !validPw}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm shadow-sm"
            >
              Passwort ändern
            </button>
            {msgPw && <span className="text-sm text-gray-600 dark:text-gray-300">{msgPw}</span>}
          </div>
        </form>
      </div>
    </Modal>
  );
}

/* ===========================
   Meine Events
=========================== */
function MyEventsCard() {
  const [items, setItems] = useState<MyEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await authedFetch('/api/me/events');
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Meine Events</h2>
        <Link href="/events" className="text-sm text-blue-600 hover:underline">
          Alle Events →
        </Link>
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && items && items.length === 0 && (
        <div className="text-sm text-gray-500">
          Du bist aktuell für kein Event angemeldet.
        </div>
      )}

      {!loading && items && items.length > 0 && (
        <ul className="grid gap-3">
          {items.map((ev) => (
            <li
              key={ev.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3"
            >
              <EventRow ev={ev} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EventRow({ ev }: { ev: MyEvent }) {
  const when = formatWhen(ev.starts_at, ev.ends_at, ev.location);
  const chip =
    ev.state === 'confirmed'
      ? 'bg-emerald-600 text-white border-emerald-600'
      : 'bg-amber-500 text-white border-amber-500';

  return (
    <div className="flex gap-3">
      {ev.hero_image_url && (
        <img
          src={ev.hero_image_url}
          alt=""
          className="h-16 w-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
        />
      )}

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border ${chip}`}>
            {ev.state === 'confirmed' ? 'Bestätigt' : 'Warteliste'}
          </span>
          <span className="text-xs text-gray-500">{when}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {timeUntil(ev.starts_at)}
          </span>
        </div>

        <div className="text-base font-semibold leading-snug mt-0.5">
          <Link href={`/events/${ev.slug}`} className="text-blue-700 dark:text-blue-400 hover:underline">
            {ev.title}
          </Link>
        </div>

        {ev.summary && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 line-clamp-2">
            {ev.summary}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---- Utils ---- */
function formatWhen(startISO: string, endISO: string | null, loc?: string | null) {
  const tz = 'Europe/Berlin';
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : null;

  const dateFmt = new Intl.DateTimeFormat('de-DE', { timeZone: tz, dateStyle: 'medium' });
  const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: tz, timeStyle: 'short' });

  const dateStr = dateFmt.format(start);
  const startTime = timeFmt.format(start);

  let range = `${dateStr}, ${startTime}`;
  if (end) {
    const sameDay = dateFmt.format(start) === dateFmt.format(end);
    const endTime = timeFmt.format(end);
    range = sameDay
      ? `${dateStr}, ${startTime}–${endTime}`
      : `${dateStr}, ${startTime} – ${dateFmt.format(end)}, ${endTime}`;
  }

  return loc ? `${range} · ${loc}` : range;
}

function timeUntil(iso: string) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = t - now;
  const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

  const mins = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3600000);
  const days = Math.round(diffMs / 86400000);

  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  if (Math.abs(hours) < 48) return rtf.format(hours, 'hour');
  return rtf.format(days, 'day');
}

/* ===========================
   Unread-Panel (robust)
=========================== */
function UnreadCard() {
  const [data, setData] = useState<UnreadRes | null>(null);
  const [loading, setLoading] = useState(true);

  function toUnreadRes(j: any): UnreadRes | null {
    if (!j || j.ok !== true) return null;
    return {
      ok: true,
      last_seen_at: j.last_seen_at ?? null,
      total: typeof j.total === 'number' ? j.total : 0,
      unread: typeof j.unread === 'number' ? j.unread : undefined,
      preview: Array.isArray(j.preview) ? j.preview : [],
    };
  }

  async function load() {
    try {
      const r = await authedFetch('/api/unread');
      const j = await r.json().catch(() => ({}));
      setData(toUnreadRes(j));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  const count = data?.unread ?? data?.total ?? 0;
  const lastSeenStr = data?.last_seen_at
    ? new Date(data.last_seen_at).toLocaleString('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '–';

  const preview = Array.isArray(data?.preview) ? data!.preview : [];

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Verpasst seit letztem Besuch</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await authedFetch('/api/unread/seen', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            await load();
            window.dispatchEvent(new Event('auth-changed'));
          }}
        >
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

          {preview.length > 0 ? (
            <ul className="space-y-2">
              {preview.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link
                    href={p.slug ? `/news/${p.slug}` : `/news?open=${p.id}`}
                    className="text-blue-700 dark:text-blue-400 underline"
                  >
                    {p.title}
                  </Link>
                  <span className="text-gray-500 dark:text-gray-400">
                    {' '}
                    ·{' '}
                    {new Date(p.effective_from).toLocaleString('de-DE', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
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

/* ===========================
   🆕 Kunden-Feedback (Gamification)
=========================== */
function FeedbackCard() {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Ziele je Typ
  const targets: Record<string, number> = {
    service_mail: 4.5,        // E-Mail Service-Templates
    service_mail_rekla: 4.0,  // E-Mail Rekla-Templates
    service_phone: 4.7,
    sales_phone: 4.85,
    sales_lead: 4.5,
  };

  const typeLabel: Record<string, string> = {
    service_mail: 'E-Mail Service',
    service_mail_rekla: 'E-Mail Rekla',
    service_phone: 'Service Phone',
    sales_phone: 'Sales Phone',
    sales_lead: 'Sales Lead',
  };

  function noteColor(avg: number | null | undefined) {
    if (!Number.isFinite(avg as any)) return 'text-gray-500';
    const v = Number(avg);
    if (v >= 4.75) return 'text-emerald-600';
    if (v >= 4.5) return 'text-green-600';
    if (v >= 4.0) return 'text-amber-600';
    return 'text-red-600';
  }

  function levelFor(avg: number, target: number) {
    const d = avg - target;
    if (d >= 0) return { name: 'Gold', class: 'bg-yellow-400 text-yellow-900', icon: '🏆' };
    if (d >= -0.15) return { name: 'Silber', class: 'bg-gray-300 text-gray-900', icon: '🥈' };
    if (d >= -0.30) return { name: 'Bronze', class: 'bg-amber-300 text-amber-900', icon: '🥉' };
    return { name: 'Starter', class: 'bg-gray-200 text-gray-700', icon: '✨' };
  }

  // Durchschnitt aus 3 Teilwerten, Fallback auf "bewertung"
  function avgScore(f: FeedbackItem) {
    const v = [
      f.beraterfreundlichkeit,
      f.beraterqualifikation,
      f.angebotsattraktivitaet,
    ]
      .map((n) => (typeof n === 'number' ? n : null))
      .filter((n): n is number => Number.isFinite(n));
    if (v.length >= 2) return v.reduce((s, n) => s + n, 0) / v.length;
    if (typeof f.bewertung === 'number') return f.bewertung;
    return null;
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const r = await authedFetch(`/api/me/feedback${params.toString() ? `?${params.toString()}` : ''}`);
      const j: FeedbackRes = await r.json().catch(() => ({ ok: false, items: [] }));
      setItems(j?.ok ? (Array.isArray(j.items) ? j.items : []) : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* on mount */ }, []);
  useEffect(() => { load(); /* on date change */ }, [from, to]);

  const byType = useMemo(() => {
    const m = new Map<string, { count: number; sum: number; avg: number }>();
    (items ?? []).forEach((it) => {
      const t = it.feedbacktyp || 'unknown';
      const a = avgScore(it);
      if (!Number.isFinite(a as any)) return;
      const prev = m.get(t) || { count: 0, sum: 0, avg: 0 };
      prev.count += 1; prev.sum += Number(a);
      m.set(t, prev);
    });
    m.forEach((v) => { v.avg = v.count ? v.sum / v.count : 0; });
    return m;
  }, [items]);

  const overall = useMemo(() => {
    const vals: number[] = [];
    (items ?? []).forEach((it) => {
      const a = avgScore(it);
      if (Number.isFinite(a as any)) vals.push(Number(a));
    });
    const avg = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
    return { count: vals.length, avg };
  }, [items]);

  function barClass(pct: number) {
    if (pct >= 100) return 'bg-emerald-500';
    if (pct >= 95) return 'bg-green-500';
    if (pct >= 85) return 'bg-amber-500';
    return 'bg-red-500';
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Kunden-Feedback</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
            aria-label="Von"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
            aria-label="Bis"
          />
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && (
        <>
          {/* Gesamtübersicht */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-800/40 mb-3">
            <div className="flex items-end gap-3">
              <div>
                <div className="text-xs text-gray-500">Ø-Bewertung (gesamt)</div>
                <div className={`text-2xl font-semibold ${noteColor(overall.avg)}`}>
                  {overall.avg ? overall.avg.toFixed(2) : '–'}
                </div>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {overall.count} Feedbacks{(from || to) ? ' (gefiltert)' : ''}
              </div>
            </div>
          </div>

          {/* KPI-Tiles pro Typ */}
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from(byType.entries())
              .sort((a, b) => (a[0] > b[0] ? 1 : -1))
              .map(([type, v]) => {
                const label = typeLabel[type] ?? type;
                const target = targets[type] ?? 4.5;
                const pct = Math.max(0, Math.min(100, (v.avg / target) * 100));
                const lvl = levelFor(v.avg, target);
                return (
                  <div key={type} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{label}</div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${lvl.class}`}
                        title={`Level: ${lvl.name}`}
                      >
                        {lvl.icon} {lvl.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className={`text-xl font-semibold ${noteColor(v.avg)}`}>
                        {v.avg.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500">Ziel ≥ {target.toFixed(2)}</span>
                      <span className="ml-auto text-xs text-gray-500">{v.count}x</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div className={`h-full ${barClass(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            {byType.size === 0 && (
              <div className="text-sm text-gray-500">Keine Daten für den Zeitraum.</div>
            )}
          </div>

          {/* Liste */}
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Einzel-Feedbacks</div>
            {(!items || items.length === 0) ? (
              <div className="text-sm text-gray-500">Keine Einträge.</div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                {items!.map((f) => {
                  const avg = avgScore(f);
                  const dateStr = f.ts
                    ? new Date(f.ts).toLocaleString('de-DE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—';
                  const lbl = typeLabel[f.feedbacktyp] ?? f.feedbacktyp ?? '—';
                  const gekl = (f.geklaert ?? '').toLowerCase();
                  const geklChip =
                    gekl === 'ja'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
                  const rekla = (f.rekla ?? '').toLowerCase() === 'ja';

                  return (
                    <li key={String(f.id)} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{lbl}</span>
                            {rekla && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                                Rekla
                              </span>
                            )}
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${geklChip}`}>
                              {gekl === 'ja' ? 'geklärt' : 'offen'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {dateStr}
                            {f.template_name ? ` · ${f.template_name}` : ''}
                          </div>
                          {f.kommentar && (
                            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                              {f.kommentar}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-lg font-semibold ${noteColor(avg)}`}>
                            {Number.isFinite(avg as any) ? (avg as number).toFixed(2) : '–'}
                          </div>
                          <div className="text-xs text-gray-500">Score</div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
