import type { ReactNode } from 'react';
import SiteHeader from '../components/SiteHeader';
import Head from 'next/head';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        {/* ✅ FullCalendar CSS per CDN */}
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
      {children}
    </>
  );
}
