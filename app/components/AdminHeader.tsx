/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Role } from '@/lib/auth';
import {
  Home, Newspaper, Users2, CalendarDays, Trophy, MessageSquare,
  ClipboardCheck, Briefcase, UserCircle2, Shield, Power
} from 'lucide-react';

type Me = { user: { sub: string; role: Role; name?: string } | null };

export default function AdminHeader({ initialRole }: { initialRole?: Role }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me['user']>(initialRole ? { sub: 'me', role: initialRole } : null);

  // User laden
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

  // Navigation Items
  const navItems = useMemo(() => {
    const items: Array<{ href: string; label: string; icon: any }> = [
      { href: '/', label: 'Start', icon: Home },
      { href: '/news', label: 'News', icon: Newspaper },
      { href: '/groups', label: 'Gruppen', icon: Users2 },
      { href: '/events', label: 'Events', icon: CalendarDays },
      { href: '/checkiade', label: 'CHECKiade', icon: Trophy },
      { href: '/feedback', label: 'Feedback', icon: MessageSquare },
      { href: '/quality', label: 'Quality', icon: ClipboardCheck },
    ];

    if (me?.role === 'teamleiter') {
      items.push({ href: '/teamhub', label: 'Teamhub', icon: Briefcase });
    }

    if (me) {
      items.push({ href: '/profile', label: 'Profil', icon: UserCircle2 });
    }

    if (me && ['admin', 'moderator', 'teamleiter'].includes(me.role)) {
      items.push({ href: '/admin', label: 'Admin', icon: Shield });
    }

    return items;
  }, [me]);

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      <div className="w-full max-w-full 2xl:max-w-[1920px] mx-auto px-4">
        {/* Top Row: Logo + Logout */}
        <div className="flex items-center justify-between py-4">
          <Link href="/" className="shrink-0">
            <Image
              src="/header.svg"
              alt="NewsCHECKer"
              width={200}
              height={50}
              className="h-10 md:h-12 w-auto"
              priority
            />
          </Link>

          {me && (
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm shadow-sm transition-colors"
              >
                <Power className="w-4 h-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </form>
          )}
        </div>

        {/* Tropfen-Navigation */}
        <nav className="flex items-end justify-center gap-1 -mb-px" aria-label="Hauptnavigation">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="group relative flex flex-col items-center"
              >
                {/* Tropfen */}
                <motion.div
                  initial={false}
                  animate={{
                    height: isActive ? 56 : 32,
                    backgroundColor: isActive
                      ? 'rgb(37, 99, 235)' // blue-600
                      : 'rgba(156, 163, 175, 0.3)', // gray-400/30
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
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
                      ${isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400'}
                      transition-colors
                    `}
                  >
                    <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                </motion.div>

                {/* Label (optional, darunter) */}
                <span
                  className={`
                    mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full
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
