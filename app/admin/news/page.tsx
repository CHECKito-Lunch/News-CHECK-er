// app/admin/news/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import NewsEditorClient from './NewsEditorClient';

export default function Page() {
  return <NewsEditorClient />;
}
