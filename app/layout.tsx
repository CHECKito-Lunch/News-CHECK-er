import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reise-News',
  description: 'Interner News Hub für Veranstalter-Updates',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {children}
        </main>
      </body>
    </html>
  );
}