// app/admin/layout.tsx
import { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { verifyToken, AUTH_COOKIE, type Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();

  let role = jar.get('user_role')?.value as Role | undefined;
  if (!role) {
    const jwt = jar.get(AUTH_COOKIE)?.value;
    const session = await verifyToken(jwt);
    role = session?.role;
  }
  const isLoggedIn = !!role;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/70 dark:bg-gray-900/70 backdrop-blur">
        <div className="container max-w-7xl mx-auto flex items-center justify-between py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-100 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
              <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Zur Startseite
          </Link>

          {isLoggedIn ? (
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm shadow-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                  <path d="M12 2v10m6.36-6.36a9 9 0 11-12.72 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Abmelden
              </button>
            </form>
          ) : (
            <Link href="/login" className="text-sm text-blue-600 hover:underline">Anmelden</Link>
          )}
        </div>
      </header>

      <main className="container max-w-7xl mx-auto py-6">{children}</main>
    </div>
  );
}