// /app/news/[slug]/page.tsx
import { redirect } from 'next/navigation';
import { getServerBaseUrl } from '../../../../lib/absoluteUrl';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params; // ✅ Next 15: params ist ein Promise

  const base = getServerBaseUrl();
  const res = await fetch(`${base}/api/news/slug/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });

  if (!res.ok) redirect('/news');

  const data = (await res.json()) as { id?: number | null };
  const id = data?.id ?? null;
  if (!id) redirect('/news');

  redirect(`/news?open=${id}#post-${id}`);
}