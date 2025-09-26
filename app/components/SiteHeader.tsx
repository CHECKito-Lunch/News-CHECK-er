'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string } | null };

export default function SiteHeader() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me['user']>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState<number>(0);

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
    if (!me) { setUnread(0); return; }

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
        const j = await r.json().catch(() => null);
        const cnt = j && typeof j.unread === 'number' ? j.unread : j && typeof j.total === 'number' ? j.total : 0;
        if (!stop) setUnread(cnt);
      } catch {}
    };

    loadUnread();
    timer = window.setInterval(loadUnread, 60_000);

    const onAuth = () => loadUnread();
    window.addEventListener('auth-changed', onAuth);

    return () => {
      stop = true;
      ctrl.abort();
      if (timer) clearInterval(timer);
      window.removeEventListener('auth-changed', onAuth);
    };
  }, [me]);

  const links = useMemo(() => {
    const arr: { href: string; label: string }[] = [
      { href: '/', label: 'Start' },
      { href: '/news', label: 'News' },
      { href: '/groups', label: 'Gruppen' }, // ← hinzugefügt
      { href: '/events', label: 'Events' },  // ← hinzugefügt (war schon markiert)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
            {me && unread > 0 && <Badge count={unread} />}
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
                const isProfile = n.href === '/profile';
                const isNews = n.href === '/news';
                const active = pathname === n.href || (n.href !== '/' && pathname?.startsWith(n.href));
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
                      {(me && unread > 0 && (isProfile || isNews)) && <Badge count={unread} />}
                    </span>
                  </Link>
                );
              })}

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
                  href="/login"
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
