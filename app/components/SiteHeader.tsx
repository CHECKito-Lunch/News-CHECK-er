'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import ThemeToggle from './ThemeToggle';

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string } | null };

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me['user']>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/me')
        .then(r => r.json())
        .then((j: Me) => setMe(j.user))
        .catch(() => {});
    load();
    const onAuth = () => load();
    const onRouteChange = () => load();
    window.addEventListener('auth-changed', onAuth);
    window.addEventListener('popstate', onRouteChange);
    return () => {
      window.removeEventListener('auth-changed', onAuth);
      window.removeEventListener('popstate', onRouteChange);
    };
  }, []);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setMe(null);
    setMenuOpen(false);
    window.dispatchEvent(new Event('auth-changed'));
    if (pathname?.startsWith('/admin')) router.push('/');
    router.refresh();
  }

  const links = useMemo(() => {
    const arr: { href: string; label: string }[] = [
      { href: '/', label: 'Start' },
      { href: '/news', label: 'News' },
    ];
    if (me) arr.push({ href: '/profile', label: 'Profil' });
    if (me && (me.role === 'admin' || me.role === 'moderator')) {
      arr.push({ href: '/admin', label: 'Adminbereich' });
    }
    return arr;
  }, [me]);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
      <div className="container max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Startseite">
          <img src="/header.svg" alt="NewsCHECKer" className="h-8 w-auto dark:opacity-90" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden sm:flex items-center gap-2">
          {links.map((n) => {
            const active = pathname === n.href || (n.href !== '/' && pathname?.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden sm:flex items-center gap-2">
          {me ? (
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
            >
              Login
            </Link>
          )}
          <ThemeToggle />
        </div>

        {/* Burger Button */}
        <button
          className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 dark:border-gray-700"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menü"
        >
          <span className="text-xl">☰</span>
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="sm:hidden overflow-hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800"
          >
            <nav className="px-4 py-4 space-y-2">
              {links.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-3 py-2 rounded text-sm font-medium ${
                    pathname === n.href || (n.href !== '/' && pathname?.startsWith(n.href))
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
              {me ? (
                <button
                  onClick={logout}
                  className="block w-full text-left px-3 py-2 rounded text-sm font-medium bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
                >
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 rounded text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Login
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
