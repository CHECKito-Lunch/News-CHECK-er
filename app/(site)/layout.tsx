// app/(site)/layout.tsx
import type { ReactNode } from 'react';
import SiteHeader from '../components/SiteHeader';
import Head from 'next/head';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* CDN für FullCalendar – wird bei Bedarf geladen */}
      <Head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/common@6.1.9/main.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/daygrid@6.1.9/main.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/list@6.1.9/main.min.css"
        />
      </Head>

      <SiteHeader />
      <main className="container max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </>
  );
}
