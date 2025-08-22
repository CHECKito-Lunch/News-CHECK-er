// app/(auth)/layout.tsx
import type { ReactNode } from 'react';
import '../globals.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Logo-Bar nur auf Login/anderen Auth-Seiten */}
      <div className="w-full bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="container max-w-md mx-auto px-4 py-6">
          <img
            src="/header.svg"
            alt="NewsCHECKer"
            className="h-10 w-auto mx-auto dark:opacity-90"
          />
        </div>
      </div>

      {children}
    </>
  );
}