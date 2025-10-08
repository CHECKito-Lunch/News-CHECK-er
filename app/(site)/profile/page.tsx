'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/fetchWithSupabase';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
  CartesianGrid,
} from 'recharts';



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
  feedback_ts?: string | null;
  booking_number_hash?: string | null;
  booking_number?: string | null;
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
<div className="space-y-6">
  <SectionAccordion title="Teams & Gruppen">
    <TeamsAndGroups />
  </SectionAccordion>

  <SectionAccordion title="Profil & Sicherheit">
    <ProfileSecurityCard onOpen={() => setPsOpen(true)} />
  </SectionAccordion>

  <SectionAccordion title="Einladungen">
    <InvitesCard />
  </SectionAccordion>

  <SectionAccordion title="Meine Events">
    <MyEventsCard />
  </SectionAccordion>

  <SectionAccordion title="Verpasst seit letztem Besuch">
    <UnreadCard />
  </SectionAccordion>
</div>

      <ProfileSecurityModal open={psOpen} onClose={() => setPsOpen(false)} />
    </div>
  );
}

/* ===========================
   Accordion Wrapper (A11y + Tailwind)
   - standardmäßig zugeklappt (defaultOpen = false)
=========================== */
function SectionAccordion({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{title}</span>
          {badge}
        </div>
        <span
          className="inline-block text-gray-500 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          aria-hidden
        >
          ▸
        </span>
      </button>

      <div
        className={`transition-[grid-template-rows] duration-200 ease-out grid ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Inhalt behält deine bestehende Card-Optik */}
          <div className="p-5 border-t border-gray-100 dark:border-gray-800">
            {children}
          </div>
        </div>
      </div>
    </section>
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

