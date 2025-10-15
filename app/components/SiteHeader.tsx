/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

type Role = 'admin' | 'moderator' | 'user' | 'teamleiter';
type Me = { user: { sub: string; role: Role; name?: string } | null };

type UnreadRes = {
  ok: boolean;
  unread: number;
  breakdown?: {
    invites?: number;   // -> Profil
    groups?: number;    // -> Gruppen (group_posts)
    news?: number;      // -> News (posts)
    events?: number;    // -> Events (termine)
  };
};

export default function SiteHeader() {
  const pathname = usePathname();

  const [me, setMe] = useState<Me['user']>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [counts, setCounts] = useState({ total: 0, invites: 0, groups: 0, news: 0, events: 0 });

  const [marking, setMarking] = useState(false);
  const [markedOk, setMarkedOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j: Me = await r.json();
        if (mounted) setMe(j.user);
      } catch {
        if (mounted) setMe(null);
      }
    };
    load();

    const onAuth = () => load();
    window.addEventListener('auth-changed', onAuth);
    return () => {
      mounted = false;
      window.removeEventListener('auth-changed', onAuth);
    };
  }, []);

  useEffect(() => {
    if (!me) { setCounts({ total: 0, invites: 0, groups: 0, news: 0, events: 0 }); return; }

    let stop = false;
    let timer: number | undefined;
    const ctrl = new AbortController();

    const loadUnread = async () => {
      try {
        const r = await fetch('/api/unread', {
          signal: ctrl.signal,
          cache: 'no-store',
          credentials: 'include',
        });
        if (!r.ok) return;
        const j: UnreadRes = await r.json().catch(() => ({ ok:false, unread:0 }));
        const b = j.breakdown || {};
        const next = {
          total: Math.max(0, Number(j.unread || 0)),
          invites: Math.max(0, Number(b.invites || 0)),
          groups: Math.max(0, Number(b.groups || 0)),
          news:   Math.max(0, Number(b.news   || 0)),
          events: Math.max(0, Number(b.events || 0)),
        };
        if (!stop) setCounts(next);
      } catch {}
    };

    loadUnread();
    // eslint-disable-next-line prefer-const
    timer = window.setInterval(loadUnread, 60_000);

    const onAuth = () => loadUnread();
    const onUnread = () => loadUnread();
    window.addEventListener('auth-changed', onAuth);
    window.addEventListener('unread-changed', onUnread);

    return () => {
      stop = true;
      ctrl.abort();
      if (timer) clearInterval(timer);
      window.removeEventListener('auth-changed', onAuth);
      window.removeEventListener('unread-changed', onUnread);
    };
  }, [me]);

  async function markAllRead() {
    if (!me || marking) return;
    setMarking(true);
    const prev = counts;

    setCounts({ total: 0, invites: 0, groups: 0, news: 0, events: 0 });

    try {
      const r = await fetch('/api/unread/seen', { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('failed');
      window.dispatchEvent(new Event('unread-changed'));
      setMarkedOk(true);
      setTimeout(() => setMarkedOk(false), 1200);
    } catch {
      setCounts(prev);
      alert('Konnte nicht als gelesen markieren.');
    } finally {
      setMarking(false);
    }
  }

  const links = useMemo(() => {
    const arr: { href: string; label: string }[] = [
      { href: '/', label: 'Start' },
      { href: '/news', label: 'News' },
      { href: '/groups', label: 'Gruppen' },
      { href: '/events', label: 'Events' },
      { href: '/checkiade', label: 'CHECKiade' },
      { href: '/feedback', label: 'Kunden Feedbacks' },
      { href: '/quality', label: 'Mitarbeiter Feedbacks' },
    ];

    if (me && me.role === 'teamleiter') {
      arr.push({ href: '/teamhub', label: 'Teamhub' });
    }
    if (me) arr.push({ href: '/profile', label: 'Profil' });
    if (me && (me.role === 'admin' || me.role === 'moderator'|| me.role === 'teamleiter')) {
      arr.push({ href: '/admin', label: 'Adminbereich' });
    }

    return arr;
  }, [me]);

  const Badge = ({ count }: { count: number }) => (
    <span
      aria-label={`${count} ungelesen`}
      className="absolute -top-1 -right-1 inline-flex min-w-[1.1rem] h-5 px-1 items-center justify-center rounded-full text-[10px] font-semibold bg-red-600 text-white shadow"
    >
      {count > 99 ? '99+' : count}
    </span>
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function countForLink(href: string) {
    if (href === '/profile') return counts.invites;
    if (href === '/groups')  return counts.groups;
    if (href === '/news')    return counts.news + counts.events;
    return 0;
  }

  // ✔ Icon-Auswahl pro Link
  const iconFor = (href: string) => {
    if (href === '/') return <IconHome />;
    if (href.startsWith('/news')) return <IconNews />;
    if (href.startsWith('/groups')) return <IconGroups />;
    if (href.startsWith('/events')) return <IconCalendar />;
    if (href.startsWith('/checkiade')) return <IconTrophy />;
    if (href.startsWith('/feedback')) return <IconChat />;
    if (href.startsWith('/quality')) return <IconClipboardCheck />;
    if (href.startsWith('/teamhub')) return <IconTeam />;
    if (href.startsWith('/profile')) return <IconUser />;
    if (href.startsWith('/admin')) return <IconShield />;
    return <IconHome />;
  };

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/70 dark:bg-gray-900/70 backdrop-blur">
      <div className="w-full max-w-full 2xl:max-w-[1920px] mx-auto px-4 py-6 flex items-center justify-between">
        <div className="w-10 flex items-center">
          <button
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm"
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            aria-controls="global-menu"
            aria-label="Menü"
          >
            <IconMenu />
            {me && counts.total > 0 && <Badge count={counts.total} />}
          </button>
        </div>

        <Link href="/" aria-label="Startseite" className="shrink-0 inline-flex items-center gap-2">
          <img src="/header.svg" alt="NewsCHECKer" className="h-8 w-auto dark:opacity-90" />
        </Link>

        <div className="w-10" />
      </div>

      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            id="global-menu"
            key="global-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden backdrop-blur bg-white/70 dark:bg-gray-900/70"
          >
            {/* ▼▼▼ Kachel-Layout ▼▼▼ */}
            <nav className="container max-w-5xl mx-auto px-4 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {links.map((n) => {
                  const active = pathname === n.href || (n.href !== '/' && pathname?.startsWith(n.href));
                  const c = countForLink(n.href);

                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'group relative block rounded-2xl border shadow-sm p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white/90 dark:bg-white/10 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20'
                      ].join(' ')}
                    >
                      {/* Badge oben rechts */}
                      <span className="absolute top-2 right-2 inline-block w-6 h-6">
                        {me && c > 0 && <Badge count={c} />}
                      </span>

                      {/* ✔ passendes Icon */}
                      <span
                        aria-hidden
                        className={[
                          'mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border',
                          active
                            ? 'border-white/40 bg-white/10'
                            : 'border-gray-200 dark:border-white/10 bg-white/70 dark:bg-white/10'
                        ].join(' ')}
                      >
                        {iconFor(n.href)}
                      </span>

                      {/* Label + kleiner Chevron */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold leading-5">{n.label}</span>
                        <IconChevron className={active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'} />
                      </div>

                      {/* dezenter Verlauf / Glow */}
                      <span
                        className={[
                          'pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset',
                          active ? 'ring-white/30' : 'ring-gray-200/70 dark:ring-white/10'
                        ].join(' ')}
                      />
                    </Link>
                  );
                })}
              </div>

              {/* 🆕 Alles-als-gelesen */}
              {me && (
                <motion.button
                  type="button"
                  onClick={markAllRead}
                  disabled={marking}
                  initial={false}
                  animate={{ scale: markedOk ? 1.01 : 1, boxShadow: markedOk ? '0 8px 24px rgba(59,130,246,.25)' : '0 1px 3px rgba(0,0,0,.06)' }}
                  className={`
                    relative mt-4 inline-flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium
                    border bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-900
                    dark:from-white/5 dark:to-white/[.03] dark:text-blue-200
                    border-blue-100 dark:border-white/10
                    hover:from-blue-100 hover:to-indigo-100 dark:hover:from-white/10 dark:hover:to-white/[.07]
                    disabled:opacity-60
                  `}
                >
                  <span className="inline-flex items-center gap-2">
                    {marking ? (
                      <IconSpinner />
                    ) : markedOk ? (
                      <IconCheck />
                    ) : (
                      <IconMenuThin />
                    )}
                    <span className="truncate">
                      {markedOk ? 'Alles gelesen!' : 'Alles als gelesen markieren'}
                    </span>
                  </span>

                  <span className="flex items-center gap-3">
                    <span className="hidden sm:block text-[11px] opacity-70">News · Events · Gruppen</span>
                    {counts.total > 0 && !markedOk && (
                      <span className="
                        inline-flex min-w-[1.5rem] h-6 px-2 items-center justify-center rounded-full text-[11px] font-semibold
                        bg-blue-600 text-white dark:bg-blue-500 shadow-sm
                      ">
                        {counts.total > 99 ? '99+' : counts.total}
                      </span>
                    )}
                  </span>
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-blue-200/50 dark:ring-white/10" />
                </motion.button>
              )}

              {/* Login / Logout */}
              <div className="mt-3">
                {me ? (
                  <form action="/api/logout" method="post" onSubmit={() => setMenuOpen(false)}>
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm shadow-sm"
                    >
                      <IconPower />
                      Abmelden
                    </button>
                  </form>
                ) : (
                  <Link
                    href="https://www.karl-marx-checknitz.de/"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 px-3 py-2 text-sm text-blue-600 dark:text-blue-300 shadow-sm"
                  >
                    Anmelden
                  </Link>
                )}
              </div>
            </nav>
            {/* ▲▲▲ Kachel-Layout ▲▲▲ */}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ===== Icons ===== */
function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconMenuThin(){
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M3 12h12M3 6h18M3 18h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function IconSpinner(){
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".25"/>
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function IconCheck(){
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M20 7l-9 9-5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className={className}>
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconHome(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4V12H9v9H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}
function IconNews(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M4 5h12v14H6a2 2 0 0 1-2-2V5zM16 7h4v10a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M8 9h6M8 13h6M8 17h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function IconGroups(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M16 11a4 4 0 1 0-8 0M3 20a7 7 0 0 1 18 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCalendar(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M7 3v4M17 3v4M3 9h18M5 9h14v11H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconTrophy(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M8 21h8M12 17a5 5 0 0 0 5-5V4H7v8a5 5 0 0 0 5 5zM5 6H3a3 3 0 0 0 3 3M19 6h2a3 3 0 0 1-3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconChat(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M7 9h10M7 13h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function IconClipboardCheck(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M9 5h6a2 2 0 0 1 2 2v12H7V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 3h6v2H9zM9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconTeam(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm6 8a6 6 0 0 0-12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconUser(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm7 8a7 7 0 0 0-14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconShield(){
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M12 3l7 4v5c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconPower(){
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M12 2v10m6.36-6.36a9 9 0 11-12.72 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
