// app/admin/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/news'); // Standard: Formular zum Anlegen/Bearbeiten
}
