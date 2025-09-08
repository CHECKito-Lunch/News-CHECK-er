// app/admin/layout.tsx
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { verifyToken, AUTH_COOKIE, type Role } from '@/lib/auth';
import AdminHeader from '../components/AdminHeader';

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

  return (
    <div className="min-h-screen">
      {/* Neuer Header (Burger links mit Badge, Logo zentriert, blurry Menü) */}
      <AdminHeader initialRole={role} />

      {/* Optional: Zusätzlicher „Zur Startseite“-Link unterhalb, falls du ihn trotzdem separat möchtest */}
      {/* <div className="container max-w-15xl mx-auto py-2">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
            <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Zur Startseite
        </Link>
      </div> */}

      <main className="container max-w-7xl mx-auto py-6">{children}</main>
    </div>
  );
}
