// app/admin/polls/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import QaAdminClient from './QaAdminClient';

export default function Page() {
  return <QaAdminClient />;
}
