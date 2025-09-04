// app/admin/news-agent/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import NewsAgentClient from './NewsAgentClient';

export default function Page() {
  return <NewsAgentClient />;
}
