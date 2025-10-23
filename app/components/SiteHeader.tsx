/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

type Role = 'admin' | 'moderator' | 'user' | 'teamleiter';
type Me = { user: { sub: string; role: Role; name?: string } | null };

type UnreadRes = {
  ok: boolean;
  unread: number;
  breakdown?: { invites?: number; groups?: number; news?: number; events?: number };
};

export default function SiteHeader() {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  const [me, setMe] = useState<Me['user']>(null);
  const [counts, setCounts] = useState({ total: 0, invites: 0, groups: 0, news: 0, events: 0 });
  const [marking, setMarking] = useState(false);
  const [markedOk, setMarkedOk] = useState(false);

  // Load /api/me
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store', credentials: 'include' });
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

  // Unread polling
  useEffect(() => {
    if (!me) {
      setCounts({ total: 0, invites: 0, groups: 0, news: 0, events: 0 });
      return;
    }

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
        const j: UnreadRes = await r.json().catch(() => ({ ok: false, unread: 0 }));
        const b = j.breakdown || {};
        const next = {
          total: Math.max(0, Number(j.unread || 0)),
          invites: Math.max(0, Number(b.invites || 0)),
          groups: Math.max(0, Number(b.groups || 0)),
          news: Math.max(0, Number(b.news || 0)),
          events: Math.max(0, Number(b.events || 0)),
        };
        if (!stop) setCounts(next);
      } catch {}
    };

    const start = () => {
      loadUnread();
      timer = window.setInterval(loadUnread, 60_000);
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadUnread();
        start();
      } else {
        stopTimer();
      }
    };

    start();
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('auth-changed', loadUnread as any);
    window.addEventListener('unread-changed', loadUnread as any);

    return () => {
      stop = true;
      ctrl.abort();
      stopTimer();
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('auth-changed', loadUnread as any);
      window.removeEventListener('unread-changed', loadUnread as any);
    };
  }, [me]);

  const markAllRead = useCallback(async () => {
    if (!me || marking) return;
    setMarking(true);
    const prev = counts;
    setCounts({ total: 0, invites: 0, groups: 0, news: 0, events: 0 });

    try {
      const r = await fetch('/api/unread/seen', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
      });
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
  }, [counts, marking, me]);

  const baseLinks = useMemo(
    () => [
      { href: '/', label: 'Start', icon: IconHome },
      { href: '/news', label: 'News', icon: IconNews },
      { href: '/groups', label: 'Gruppen', icon: IconGroups },
      { href: '/events', label: 'Events', icon: IconCalendar },
      { href: '/checkiade', label: 'CHECKiade', icon: IconTrophy },
      { href: '/feedback', label: 'Feedback', icon: IconChat },
      { href: '/quality', label: 'Quality', icon: IconClipboardCheck },
    ],
    []
  );

  const links = useMemo(() => {
    const arr = [...baseLinks];
    if (me?.role === 'teamleiter') arr.push({ href: '/teamhub', label: 'Teamhub', icon: IconTeam });
    if (me) arr.push({ href: '/profile', label: 'Profil', icon: IconUser });
    if (me && ['admin', 'moderator', 'teamleiter'].includes(me.role)) {
      arr.push({ href: '/admin', label: 'Admin', icon: IconShield });
    }
    return arr;
  }, [baseLinks, me]);

  const countsByHref: Record<string, number> = {
    '/profile': counts.invites,
    '/groups': counts.groups,
    '/news': counts.news + counts.events,
  };

  const Badge = ({ count }: { count: number }) => (
    <>
      <span className="sr-only" aria-live="polite">
        {count} ungelesen
      </span>
      <span
        aria-hidden
        className="absolute -top-1 -right-1 inline-flex min-w-[1.1rem] h-5 px-1 items-center justify-center rounded-full text-[10px] font-semibold bg-red-600 text-white shadow z-10"
      >
        {count > 99 ? '99+' : count}
      </span>
    </>
  );

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      <div className="w-full max-w-full 2xl:max-w-[1920px] mx-auto px-4">
        {/* Top Row: Logo + Actions */}
        <div className="flex items-center justify-between py-4">
          <Link href="/" aria-label="Startseite" className="shrink-0">
            <Image
              src="/header.svg"
              alt="NewsCHECKer"
              width={200}
              height={50}
              className="h-10 md:h-12 w-auto dark:opacity-90"
              priority
              sizes="(max-width: 768px) 160px, (max-width: 1280px) 200px, 240px"
            />
          </Link>

          <div className="flex items-center gap-3">
            {/* Mark All Read Button */}
            {me && counts.total > 0 && (
              <motion.button
                type="button"
                onClick={markAllRead}
                disabled={marking}
                initial={false}
                animate={
                  prefersReducedMotion
                    ? {}
                    : {
                        scale: markedOk ? 1.02 : 1,
                        boxShadow: markedOk
                          ? '0 4px 12px rgba(59,130,246,.25)'
                          : '0 1px 2px rgba(0,0,0,.05)',
                      }
                }
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 transition-colors disabled:opacity-60"
                title="Alle Benachrichtigungen als gelesen markieren"
              >
                {marking ? (
                  <IconSpinner />
                ) : markedOk ? (
                  <IconCheck />
                ) : (
                  <IconMenuThin />
                )}
                <span className="hidden md:inline">
                  {markedOk ? 'Erledigt!' : `${counts.total} als gelesen`}
                </span>
              </motion.button>
            )}

            {/* Logout Button */}
            {me && (
              <form action="/api/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm shadow-sm transition-colors"
                >
                  <IconPower />
                  <span className="hidden sm:inline">Abmelden</span>
                </button>
              </form>
            )}

            {/* Login Link */}
            {!me && (
              <Link
                href="https://www.karl-marx-checknitz.de/login"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm shadow-sm transition-colors"
              >
                Anmelden
              </Link>
            )}
          </div>
        </div>

        {/* Tropfen-Navigation */}
        <nav
          className="flex items-end justify-center gap-1 -mb-px overflow-x-auto pb-2 scrollbar-hide"
          aria-label="Hauptnavigation"
        >
          {links.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            const badgeCount = countsByHref[item.href] ?? 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="group relative flex flex-col items-center shrink-0"
              >
                {/* Badge */}
                {me && badgeCount > 0 && <Badge count={badgeCount} />}

                {/* Tropfen */}
                <motion.div
                  initial={false}
                  animate={{
                    height: isActive ? 56 : 32,
                    backgroundColor: isActive
                      ? 'rgb(37, 99, 235)' // blue-600
                      : 'rgba(156, 163, 175, 0.3)', // gray-400/30
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                  className={`
                    relative w-12 rounded-b-full
                    ${isActive ? 'shadow-lg shadow-blue-500/30' : ''}
                    transition-shadow
                  `}
                  style={{
                    borderBottomLeftRadius: '50%',
                    borderBottomRightRadius: '50%',
                  }}
                >
                  {/* Icon am Ende des Tropfens */}
                  <div
                    className={`
                      absolute bottom-2 left-1/2 -translate-x-1/2
                      flex items-center justify-center
                      ${
                        isActive
                          ? 'text-white'
                          : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                      }
                      transition-colors
                    `}
                  >
                    <Icon strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                </motion.div>

                {/* Label */}
                <span
                  className={`
                    mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap
                    ${
                      isActive
                        ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100'
                        : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200'
                    }
                    transition-colors
                  `}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/* ===== Icons ===== */
function IconMenuThin() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M3 12h12M3 6h18M3 18h18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconSpinner() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M20 7l-9 9-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconHome({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4V12H9v9H5a2 2 0 0 1-2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconNews({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M4 5h12v14H6a2 2 0 0 1-2-2V5zM16 7h4v10a2 2 0 0 1-2 2h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M8 9h6M8 13h6M8 17h4"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGroups({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M16 11a4 4 0 1 0-8 0M3 20a7 7 0 0 1 18 0"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCalendar({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M7 3v4M17 3v4M3 9h18M5 9h14v11H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrophy({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M8 21h8M12 17a5 5 0 0 0 5-5V4H7v8a5 5 0 0 0 5 5zM5 6H3a3 3 0 0 0 3 3M19 6h2a3 3 0 0 1-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChat({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M7 9h10M7 13h6"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClipboardCheck({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M9 5h6a2 2 0 0 1 2 2v12H7V7a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M9 3h6v2H9zM9 12l2 2 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTeam({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm6 8a6 6 0 0 0-12 0"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUser({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm7 8a7 7 0 0 0-14 0"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield({ strokeWidth = 2 }: { strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M12 3l7 4v5c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconPower() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        d="M12 2v10m6.36-6.36a9 9 0 11-12.72 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
