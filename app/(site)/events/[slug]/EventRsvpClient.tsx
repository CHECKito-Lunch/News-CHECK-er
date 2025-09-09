'use client';

import dynamic from 'next/dynamic';

// nur im Client laden, kein SSR
const EventRsvpInner = dynamic(() => import('./EventRsvpInner'), { ssr: false });

export default function EventRsvpClient(props: {
  eventId: number;
  capacity: number | null;
  confirmed: number;
  waitlist: number;
}) {
  return <EventRsvpInner {...props} />;
}
