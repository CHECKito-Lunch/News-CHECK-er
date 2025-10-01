'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

type Role = 'admin' | 'moderator' | 'user';
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
  const [marking, setMarking] = useState(false); // 🆕

  // ---- User laden / auf Auth-Events hören
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

  // ---- Unread laden / Polling / auf unread-changed reagieren
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
    timer = window.setInterval(loadUnread, 60_000);

    const onAuth = () => loadUnread();
    const onUnread = () => loadUnread(); // z.B. nach POST /api/unread/seen
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
    // Optimistisch alles auf 0 setzen
    setCounts({ total: 0, invites: 0, groups: 0, news: 0, events: 0 });
    try {
      const r = await fetch('/api/unread/seen', { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('failed');
      // anderen Komponenten signalisieren
      window.dispatchEvent(new Event('unread-changed'));
    } catch {
      // rollback bei Fehler
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
    ];
    if (me) arr.push({ href: '/profile', label: 'Profil' });
    if (me && (me.role === 'admin' || me.role === 'moderator')) {
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

  // ESC: Menü schließen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Hilfsfunktion: per Link den korrekten Badge-Wert liefern
  function countForLink(href: string) {
    if (href === '/profile') return counts.invites;                // nur Einladungen
    if (href === '/groups')  return counts.groups;                 // nur Gruppennews
    if (href === '/news')    return counts.news + counts.events;   // News + Events
    // /events kriegt keinen eigenen Badge (ist Teil von /news)
    return 0;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/70 dark:bg-gray-900/70 backdrop-blur">
      <div className="container max-w-15xl mx-auto flex items-center justify-between py-3">
        <div className="w-10 flex items-center">
          <button
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm"
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            aria-controls="global-menu"
            aria-label="Menü"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
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
            <nav className="container max-w-5xl mx-auto px-4 py-4 grid gap-2">
              {links.map((n) => {
                const active = pathname === n.href || (n.href !== '/' && pathname?.startsWith(n.href));
                const c = countForLink(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className={`relative inline-flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium shadow-sm border
                      ${active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/20'
                      }`}
                  >
                    <span>{n.label}</span>
                    <span className="relative inline-block w-6 h-6">
                      {me && c > 0 && <Badge count={c} />}
                    </span>
                  </Link>
                );
              })}

              {/* 🆕 Alles-als-gelesen */}
              {me && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={marking}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium
                             border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10
                             hover:bg-gray-50 dark:hover:bg-white/20 disabled:opacity-60"
                >
                  {marking ? (
                    <>
                      <svg viewBox="0 0 24 24" width="16" height="16" className="animate-spin" aria-hidden>
                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".3"/>
                        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      Markiere …
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                        <path d="M20 7l-9 9-5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Alles als gelesen markieren
                    </>
                  )}
                </button>
              )}

              {me ? (
                <form action="/api/logout" method="post" onSubmit={() => setMenuOpen(false)} className="mt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm shadow-sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                      <path d="M12 2v10m6.36-6.36a9 9 0 11-12.72 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Abmelden
                  </button>
                </form>
              ) : (
                <Link
                  href="https://www.karl-marx-checknitz.de/"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 px-3 py-2 text-sm text-blue-600 dark:text-blue-300 shadow-sm mt-2"
                >
                  Anmelden
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
