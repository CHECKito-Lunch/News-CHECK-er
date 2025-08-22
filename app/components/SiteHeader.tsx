// app/components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { usePathname, useRouter } from 'next/navigation';

type Role = 'admin'|'moderator'|'user';
type Me = { user: { sub: string; role: Role; name?: string|null } | null };

export default function SiteHeader() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me['user']>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then((j: Me) => setMe(j.user))
      .catch(()=>{});
  }, []);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setMe(null);
    if (pathname?.startsWith('/admin')) router.push('/');
    else router.refresh();
  }

  const nav = [
    { href: '/', label: 'Start', show: true },
    { href: '/news', label: 'News', show: true },
    { href: '/profile', label: 'Profil', show: !!me },
    { href: '/admin', label: 'Admin', show: me?.role === 'admin' || me?.role === 'moderator' },
    { href: '/admin/users', label: 'Userverwaltung', show: me?.role === 'admin' },
  ].filter(n => n.show);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800
                        bg-white/80 dark:bg-gray-950/80 backdrop-blur">
      <div className="container max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="https://www.check24.de/apple-touch-icon.png" className="flex items-center gap-3 shrink-0" aria-label="Startseite">
      
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          {nav.map(n => {
            const active = pathname === n.href || (n.href !== '/' && pathname?.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium
                  ${active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {me ? (
            <>
              <span className="hidden sm:inline px-2 py-1 rounded-full text-xs border dark:border-gray-700">
                {me.role}
              </span>
              <button
                onClick={logout}
                className="px-3 py-2 rounded-lg border text-sm
                           bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700">
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-3 py-2 rounded-lg border text-sm
                         bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700">
              Login
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}