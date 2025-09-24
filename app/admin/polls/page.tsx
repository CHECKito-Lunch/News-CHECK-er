// app/admin/polls/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import PollsAdminClient from './PollsAdminClient';

export default function Page() {
  return <PollsAdminClient />;
}
