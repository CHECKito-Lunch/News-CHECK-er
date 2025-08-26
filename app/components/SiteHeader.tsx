// app/components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { usePathname, useRouter } from 'next/navigation';

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string } | null };

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me['user']>(null);

  // Me laden + nach Login/Logout erneut laden
  useEffect(() => {
    const load = () =>
      fetch('/api/me')
        .then(r => r.json())
        .then((j: Me) => setMe(j.user))
        .catch(() => {});
    load();
    const onAuth = () => load();
    window.addEventListener('auth-changed', onAuth);
    return () => window.removeEventListener('auth-changed', onAuth);
  }, []);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setMe(null);
    window.dispatchEvent(new Event('auth-changed'));
    if (pathname?.startsWith('/admin')) router.push('/');
    router.refresh();
  }

  // Links dynamisch nach Rolle
  const links = useMemo(() => {
    const arr: { href: string; label: string }[] = [
      { href: '/', label: 'Start' },
      { href: '/news', label: 'News' },
    ];
    if (me) arr.push({ href: '/profile', label: 'Profil' });
    if (me && (me.role === 'admin' || me.role === 'moderator')) {
      arr.push({ href: '/admin', label: 'Admin' });
    }
    if (me && me.role === 'admin') {
      arr.push({ href: '/admin/users', label: 'Userverwaltung' });
    }
    return arr;
  }, [me]);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
      <div className="container max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Startseite">
          <img src="/header.svg" alt="NewsCHECKer" className="h-8 w-auto dark:opacity-90" />
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
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

        <div className="flex items-center gap-2">
          {me ? (
            <>
              {/* Rollen-Badge entfernt */}
              <button
                onClick={logout}
                className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
              >
                Logout
              </button>
            </>
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
      </div>
    </header>
  );
}