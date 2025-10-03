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
  internal_note?: string | null;
  internal_checked?: boolean | null;
  template_name?: string | null;
  rekla?: string | boolean | number | null;
  geklaert?: string | boolean | number | null;
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
  const [psOpen, setPsOpen] = useState(false);

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
          <ProfileSecurityCard onOpen={() => setPsOpen(true)} />
        </div>

        <div className="space-y-6">
          <InvitesCard />
          <MyEventsCard />
          <UnreadCard />
        </div>
      </div>

      {/* 🔽 Vollbreite, ganz unten */}
      <FeedbackSection />

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
   🆕 Kunden-Feedback – Vollbreite, Monats-/Tages-Accordion, Streaks, XP
=========================== */

/* ===========================
   Helpers (Timezone & Truthy) – NICHT exportieren!
=========================== */
const FE_TZ = 'Europe/Berlin';

function isTrueish(v: unknown) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'ja' || s === 'true' || s === '1' || s === 'y' || s === 'yes';
}

// "Zoned" Date -> YYYY-MM (Berlin)
function ymKeyBerlin(d: Date) {
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// "Zoned" Date -> YYYY-MM-DD (Berlin)
function ymdBerlin(d: Date) {
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  const dd = String(z.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// YYYY-MM -> nächster Monat
function incMonthKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}



function FeedbackSection() {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  const targets: Record<string, number> = {
    service_mail: 4.5,
    service_mail_rekla: 4.0,
    service_phone: 4.7,
    sales_phone: 4.85,
    sales_lead: 4.5,
    unknown: 4.5,
  };
  const typeLabel: Record<string, string> = {
    service_mail: 'E-Mail Service',
    service_mail_rekla: 'E-Mail Rekla',
    service_phone: 'Service Phone',
    sales_phone: 'Sales Phone',
    sales_lead: 'Sales Lead',
  };

  function avgScore(f: FeedbackItem) {
    const parts = [
      f.beraterfreundlichkeit,
      f.beraterqualifikation,
      f.angebotsattraktivitaet,
    ].filter((n): n is number => Number.isFinite(n as number));
    if (parts.length >= 2) return parts.reduce((s, n) => s + n, 0) / parts.length;
    if (typeof f.bewertung === 'number') return f.bewertung;
    return null;
  }

  const noteColor = (v: number | null | undefined) =>
    !Number.isFinite(v as any) ? 'text-gray-500'
    : (v as number) >= 4.75 ? 'text-emerald-600'
    : (v as number) >= 4.5  ? 'text-green-600'
    : (v as number) >= 4.0  ? 'text-amber-600'
    : 'text-red-600';

  /* ---- Gamification: Level ---- */
  function levelFor(avg: number, target: number) {
    const d = avg - target;          // wie weit über Ziel?
    if (d >= 0.35) return { name:'Diamant', class:'bg-cyan-300 text-cyan-900', icon:'💎' };
    if (d >= 0.20) return { name:'Platin',  class:'bg-indigo-300 text-indigo-900', icon:'🏅' };
    if (d >= 0.00) return { name:'Gold',    class:'bg-yellow-400 text-yellow-900', icon:'🏆' };
    if (d >= -0.15) return { name:'Silber', class:'bg-gray-300 text-gray-900',     icon:'🥈' };
    if (d >= -0.30) return { name:'Bronze', class:'bg-amber-300 text-amber-900',   icon:'🥉' };
    return { name:'Starter', class:'bg-gray-200 text-gray-700', icon:'✨' };
  }
  const barClass = (pct: number) =>
    pct >= 100 ? 'bg-emerald-500' : pct >= 95 ? 'bg-green-500' : pct >= 85 ? 'bg-amber-500' : 'bg-red-500';

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r = await authedFetch(`/api/me/feedback${qs.toString() ? `?${qs.toString()}` : ''}`);
      const j: FeedbackRes = await r.json().catch(() => ({ ok: false, items: [] }));
      setItems(j?.ok && Array.isArray(j.items) ? j.items : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [from, to]);

  /* ------- Monats-Aggregation ------- */
  type DayGroup = { key: string; items: FeedbackItem[]; normAvg: number; pass: boolean };
 type MonthAgg = {
  monthKey: string; // YYYY-MM
  label: string;    // z.B. "03/2025"
  items: FeedbackItem[];
  byType: Map<string, { count:number; sum:number; avg:number; pass:boolean }>;
  overallAvg: number;
  overallCount: number;
  overallPass: boolean;
  days: DayGroup[];
  badges: string[];
  xp: number;

  // 🆕 Interne-Notizen-Infos pro Monat
  openInternal: number;
  internalPreview: { id: string|number; date: string; label: string; excerpt: string }[];
};

  const months: MonthAgg[] = useMemo(() => {
  // partition by YYYY-MM (Berlin)
  const map = new Map<string, FeedbackItem[]>();
  for (const f of items) {
    const d = f.ts ? new Date(f.ts) : null;
    if (!d || isNaN(d.getTime())) continue;
    const key = ymKeyBerlin(d);
    const arr = map.get(key) ?? [];
    arr.push(f); map.set(key, arr);
  }

  // initial Aggregate aus vorhandenen Monaten bauen
  const base: MonthAgg[] = [];
  for (const [monthKey, arr] of map.entries()) {
    // pro Type aggregieren
    const byType = new Map<string, { count:number; sum:number; avg:number; pass:boolean }>();
    const vals:number[] = [];
    const reklaVals:number[] = [];

    arr.forEach(f => {
      const t = f.feedbacktyp || 'unknown';
      const a = avgScore(f);
      if (!Number.isFinite(a as any)) return;
      vals.push(a as number);
      if (isTrueish(f.rekla)) reklaVals.push(a as number);
      const prev = byType.get(t) ?? { count:0, sum:0, avg:0, pass:false };
      prev.count++; prev.sum += a as number;
      byType.set(t, prev);
    });

    byType.forEach((v, t) => {
      v.avg = v.count ? v.sum / v.count : 0;
      const goal = targets[t] ?? targets.unknown;
      v.pass = v.count > 0 && v.avg >= goal;
    });

    const overallAvg = vals.length ? vals.reduce((s,n)=>s+n,0)/vals.length : 0;
    const overallCount = vals.length;

    const overallPass = Array.from(byType.entries()).every(([t, v]) => {
      const goal = targets[t] ?? targets.unknown;
      return v.count === 0 ? true : v.avg >= goal;
    });

    // Tage (Berlin)
    const byDay = new Map<string, FeedbackItem[]>();
    arr.forEach(f => {
      const d = f.ts ? new Date(f.ts) : null;
      if (!d) return;
      const k = ymdBerlin(d);
      const a = byDay.get(k) ?? []; a.push(f); byDay.set(k, a);
    });
    const days: DayGroup[] = [];
    for (const [k, list] of byDay.entries()) {
      const ratios:number[] = [];
      list.forEach(f=>{
        const s = avgScore(f);
        if (!Number.isFinite(s as any)) return;
        const t = targets[f.feedbacktyp] ?? targets.unknown;
        ratios.push(Number(s)/t);
      });
      const normAvg = ratios.length ? ratios.reduce((a,b)=>a+b,0)/ratios.length : 0;
      days.push({ key:k, items:list, normAvg, pass: normAvg >= 1 });
    }
    days.sort((a,b)=> a.key < b.key ? 1 : -1);

    // Badges
    const badges:string[] = [];
    if (overallAvg >= 4.9 && overallCount >= 5) badges.push('🌟 Perfekter Monat');
    if (reklaVals.length >= 3) {
      const avgRekla = reklaVals.reduce((s,n)=>s+n,0)/reklaVals.length;
      const targetRekla = targets.service_mail_rekla ?? 4.0;
      if (avgRekla >= targetRekla) badges.push('🛡️ Hero of Rekla');
    }

// 🆕 Offene interne Notizen im Monat & kleine Vorschau
    const openInternalItems = arr.filter(x =>
      (x.internal_note?.trim() ?? '').length > 0 && !isTrueish(x.internal_checked)
    );

    const openInternal = openInternalItems.length;
    const internalPreview = openInternalItems.slice(0, 3).map(i => {
      const d = i.ts ? new Date(i.ts) : null;
      const date = d ? ymdBerlin(d) : '';
      const label =
        i.template_name ??
        (typeLabel[i.feedbacktyp] ?? i.feedbacktyp ?? '—');
      const excerpt = (i.internal_note ?? '').trim().slice(0, 90);
      return { id: i.id, date, label, excerpt };
    });

    const [y,m] = monthKey.split('-');
 base.push({
      monthKey,
      label: `${m}/${y}`,
      items: arr,
      byType,
      overallAvg,
      overallCount,
      overallPass,
      days,
      badges,
      xp: 0,

      // 🆕
      openInternal,
      internalPreview,
    });
  }

  if (base.length === 0) return base;

  // fehlende Monate (zwischen min..max) auffüllen
  const asc = [...base].sort((a,b)=> a.monthKey.localeCompare(b.monthKey)); // älteste -> neueste
  let cur = asc[0].monthKey;
  const end = asc[asc.length-1].monthKey;
  const have = new Set(base.map(m => m.monthKey));

  const filled = [...base];
  while (cur !== end) {
    cur = incMonthKey(cur);
    if (!have.has(cur)) {
      const [y,m] = cur.split('-');
     filled.push({
        monthKey: cur,
        label: `${m}/${y}`,
        items: [],
        byType: new Map(),
        overallAvg: 0,
        overallCount: 0,
        overallPass: false,
        days: [],
        badges: [],
        xp: 0,
        // 🆕
        openInternal: 0,
        internalPreview: [],
      });
    }
  }

  // neueste zuerst zurückgeben
  return filled.sort((a,b)=> a.monthKey < b.monthKey ? 1 : -1);
}, [items]);

  /* ------- XP & Combo (Monate chronologisch berechnen) ------- */
  // Punkte pro Eintrag: max(0, round((score - target) * 20))
  // Combo: +10% pro aufeinander folgendem Erfolgs-Monat, cap 50%
  const withXp = useMemo(() => {
    const clone = months.map(m => ({ ...m, xp: 0 }));
    const chrono = [...clone].reverse(); // ältester → neuester
    let combo = 0;
    for (let i = 0; i < chrono.length; i++) {
      const m = chrono[i];
      combo = m.overallPass ? Math.min(combo + 1, 5) : 0; // 0..5
      const multiplier = 1 + combo * 0.1;                 // 1.0 .. 1.5
      // Monatspunkte
      let monthXp = 0;
      for (const f of m.items) {
        const s = avgScore(f);
        if (!Number.isFinite(s as any)) continue;
        const t = targets[f.feedbacktyp] ?? targets.unknown;
        const base = Math.max(0, Math.round((Number(s) - t) * 20));
        monthXp += Math.round(base * multiplier);
      }
      m.xp = monthXp;
      // Comeback-Badge (erfolgreich nach Misserfolg im Vormonat)
      const prev = chrono[i-1];
      if (m.overallPass && prev && !prev.overallPass) {
        if (!m.badges.includes('🔁 Comeback')) m.badges.push('🔁 Comeback');
      }
    }
    return clone;
  }, [months]);

  // Saison-XP & simple Leveling (Zeitraum, nicht persistent)
  const seasonXp = useMemo(() => withXp.reduce((s,m) => s + (m.xp||0), 0), [withXp]);
  function levelFromXp(xp:number) {
    // Level 1: 0..249, Level 2: 250..399, danach +100 pro Level
    if (xp < 250) return { level: 1, cur: xp, next: 250 };
    let lvl = 2, need = 250;
    let rest = xp - 250;
    let step = 100;
    while (rest >= step) { rest -= step; lvl++; need += step; }
    return { level: lvl, cur: rest, next: step };
  }
  const lvl = levelFromXp(seasonXp);

  /* ------- Streaks (Monate in Folge) ------- */
  const overallStreak = useMemo(()=>{
    let cur=0, best=0;
    for (const m of withXp) { if (m.overallPass) { cur++; best=Math.max(best,cur); } else cur=0; }
    return { current: cur, best };
  }, [withXp]);

  const perTypeStreaks = useMemo(()=>{
    const types = new Set<string>(['service_mail','service_mail_rekla','service_phone','sales_phone','sales_lead']);
    const res = new Map<string,{current:number;best:number}>();
    for (const t of types) {
      let cur=0, best=0;
      for (const m of withXp) {
        const v = m.byType.get(t);
        const pass = v ? v.pass : false;
        if (pass) { cur++; best=Math.max(best,cur); } else cur=0;
      }
      res.set(t,{current:cur,best});
    }
    return res;
  }, [withXp]);

  // open states
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const toggleMonth = (k:string)=> setOpenMonths(p=>({ ...p, [k]: !p[k] }));
  const toggleDay = (k:string)=> setOpenDays(p=>({ ...p, [k]: !p[k] }));

  return (
    <section className="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Kunden-Feedback</h2>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}
                 className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
          <span className="text-gray-400">–</span>
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)}
                 className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && (
        <>
          {/* Übersicht + Streaks + Season-XP */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-800/40 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-end gap-4">
  <div>
    <div className="text-xs text-gray-500">Monate im Zeitraum</div>
    <div className="text-xl font-semibold">{withXp.length}</div>
  </div>
  <div>
    <div className="text-xs text-gray-500">Gesamt-Streak (alle Ziele)</div>
    <div className="text-xl font-semibold">
      {overallStreak.current} <span className="text-sm text-gray-500">/ best {overallStreak.best}</span>
    </div>
  </div>
  {/* 🆕 Offene interne Notizen im Zeitraum */}
  <div>
    <div className="text-xs text-gray-500">Offene interne Notizen</div>
    <div className="text-xl font-semibold text-amber-600">
      {withXp.reduce((s,m)=> s + (m.openInternal||0), 0)}
    </div>
  </div>
</div>


              {/* Season XP */}
              <div className="min-w-[260px]">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-medium">Season-XP</div>
                  <div className="text-xs text-gray-500">Level {lvl.level}</div>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (lvl.cur / (lvl.next||1))*100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{lvl.cur} / {lvl.next} XP · gesamt {seasonXp}</div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {Array.from(perTypeStreaks.entries()).map(([t, s])=>(
                  <span key={t} className="text-xs rounded-full px-2 py-1 bg-blue-600/10 text-blue-700 dark:text-blue-300">
                    {(typeLabel[t] ?? t)}: <b>{s.current}</b> / {s.best}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Monate */}
          {withXp.length === 0 ? (
            <div className="text-sm text-gray-500">Keine Daten im Zeitraum.</div>
          ) : (
            <ul className="space-y-3">
              {withXp.map((m)=> {
                const mOpen = !!openMonths[m.monthKey];
                return (
                  <li key={m.monthKey} className="rounded-xl border border-gray-200 dark:border-gray-800">
                    {/* Month header */}
                    <button onClick={()=>toggleMonth(m.monthKey)} className="w-full px-3 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold">{m.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.overallPass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                          {m.overallPass ? 'alle Ziele erreicht' : 'unter Ziel'}
                        </span>
                        <span className="text-xs text-gray-500">{m.overallCount} Feedbacks</span>
  {/* 🆕 Badge für offene interne Notizen */}
  {m.openInternal > 0 && (
    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      {m.openInternal} intern
    </span>
  )}

  {m.badges.length > 0 && (
    <span className="text-xs text-amber-700 dark:text-amber-300">· {m.badges.join(' · ')}</span>
  )}
</div>

                    </button>

                    {/* Month body */}
                    {mOpen && (
                      <div className="px-3 pb-3">
{/* 🆕 Interne Notizen Preview */}
{m.openInternal > 0 && (
  <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 p-3">
    <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
      Offene interne Notizen ({m.openInternal})
    </div>
    <ul className="space-y-1">
      {m.internalPreview.map(p => (
        <li key={String(p.id)} className="text-sm text-amber-900 dark:text-amber-200">
          <span className="font-medium">{p.date}</span>
          <span className="text-amber-700/70 dark:text-amber-300/70"> · {p.label} · </span>
          <span className="opacity-90">{p.excerpt}{p.excerpt.length >= 90 ? '…' : ''}</span>
        </li>
      ))}
    </ul>
    <div className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/80">
      Details bei den jeweiligen Tagen.
    </div>
  </div>
)}

                        {/* KPI per type for this month */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {Array.from(m.byType.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([type, v])=>{
                            const label = typeLabel[type] ?? type;
                            const target = targets[type] ?? targets.unknown;
                            const pct = Math.max(0, Math.min(100, (v.avg/target)*100));
                            const lvl = levelFor(v.avg, target);
                            return (
                              <div key={type} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium">{label}</div>
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${lvl.class}`} title={`Level: ${lvl.name}`}>{lvl.icon} {lvl.name}</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span className={`text-xl font-semibold ${noteColor(v.avg)}`}>{v.avg.toFixed(2)}</span>
                                  <span className="text-xs text-gray-500">Ziel ≥ {target.toFixed(2)}</span>
                                  <span className={`ml-auto text-xs ${v.pass ? 'text-emerald-600' : 'text-gray-500'}`}>{v.count}x</span>
                                </div>
                                <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                                  <div className={`h-full ${barClass(pct)}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          {m.byType.size === 0 && <div className="text-sm text-gray-500">Keine Bewertungen in diesem Monat.</div>}
                        </div>

                        {/* Days accordion */}
                        <div className="mt-4">
                          <div className="text-sm font-medium mb-1">Tage</div>
                          <ul className="space-y-2">
                            {m.days.map(d=>{
                              const dKey = `${m.monthKey}:${d.key}`;
                              const dOpen = !!openDays[dKey];
                              const pct = Math.max(0, Math.min(100, d.normAvg*100));
                              const openInternal = d.items.filter(x =>
  (x.internal_note?.trim() ?? '').length > 0 && !isTrueish(x.internal_checked)
).length;
                              const head = new Date(d.key+'T00:00:00Z').toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' });
                              return (
                                <li key={dKey} className="rounded-lg border border-gray-200 dark:border-gray-800">
                                  <button onClick={()=>toggleDay(dKey)} className="w-full px-3 py-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">{head}</span>
                                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${d.pass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                                        {d.pass ? 'Ziel erreicht' : 'unter Ziel'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {openInternal > 0 && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                          {openInternal} intern
                                        </span>
                                      )}
                                      <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-xs text-gray-500">{d.items.length}x</span>
                                      <span className="text-gray-400">{dOpen ? '▾' : '▸'}</span>
                                    </div>
                                  </button>

                                  {dOpen && (
                                    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                                      {d.items.map((f)=> (
                                        <FeedbackItemRow
                                          key={String(f.id)}
                                          f={f}
                                          avg={avgScore(f)}
                                          labelMap={typeLabel}
                                          noteColor={noteColor}
                                        />
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ===========================
   Einzelzeile – Kommentar-Toggle, interne Notiz, „erledigt“ + Highlight
=========================== */
function FeedbackItemRow({
  f,
  avg,
  labelMap,
  noteColor,
}: {
  f: FeedbackItem;
  avg: number | null;
  labelMap: Record<string,string>;
  noteColor: (v:number|null|undefined)=>string;
}) {
  const [openC, setOpenC] = useState(false);
  const [internalChecked, setInternalChecked] = useState(!!f.internal_checked);

  const lbl = labelMap[f.feedbacktyp] ?? f.feedbacktyp ?? '—';
  const ch = f.feedbacktyp;
  const dt = f.ts ? new Date(f.ts).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : '—';

  const hasInternal = !!(f.internal_note && f.internal_note.trim());
  const highlight = hasInternal && !internalChecked
    ? 'border-l-4 border-amber-400 pl-2 bg-amber-50 dark:bg-amber-900/10'
    : '';

  async function toggleInternalChecked() {
    const next = !internalChecked;
    setInternalChecked(next);
    try {
      await authedFetch(`/api/me/feedback/${f.id}/note-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: next }),
      });
    } catch {
      setInternalChecked(!next);
      alert('Konnte internen Kommentar nicht aktualisieren.');
    }
  }

  return (
    <li className={`px-3 py-3 flex items-start justify-between gap-3 ${highlight}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{lbl}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" title="Kanal">{ch}</span>
          {isTrueish(f.rekla) && (
  <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300">
    Rekla
  </span>
)}

<span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isTrueish(f.geklaert)
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
  {isTrueish(f.geklaert) ? 'geklärt' : 'offen'}
</span>
          {hasInternal && (
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full
              ${internalChecked ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
              intern
            </span>
          )}
        </div>

        <div className="text-xs text-gray-500">
          {dt}{f.template_name ? ` · ${f.template_name}` : ''}
        </div>

        {/* Kundenkommentar: auf/zu */}
        {f.kommentar && (
          <div className="mt-1">
            {!openC ? (
              <button onClick={()=>setOpenC(true)} className="text-xs underline text-blue-700 dark:text-blue-400">
                Kommentar anzeigen
              </button>
            ) : (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mt-1">
                  {f.kommentar}
                </p>
                <button onClick={()=>setOpenC(false)} className="mt-1 text-xs underline text-blue-700 dark:text-blue-400">
                  Kommentar verbergen
                </button>
              </>
            )}
          </div>
        )}

        {/* Interner Kommentar + Abhaken */}
        {hasInternal && (
          <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-white/60 dark:bg-transparent p-2">
            <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
              Interner Kommentar
            </div>
            <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{f.internal_note}</p>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={internalChecked}
                onChange={toggleInternalChecked}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
              />
              {internalChecked ? 'als erledigt markiert' : 'als erledigt markieren'}
            </label>
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <div className={`text-lg font-semibold ${noteColor(avg)}`}>
          {Number.isFinite(avg as any) ? (avg as number).toFixed(2) : '–'}
        </div>
        <div className="text-xs text-gray-500">Score</div>
      </div>
    </li>
  );
}
