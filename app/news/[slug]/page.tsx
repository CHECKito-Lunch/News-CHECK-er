// app/news/[slug]/page.tsx
import React from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';

type Category = { id: number; name: string; color: string | null };
type Badge    = { id: number; name: string; color: string | null; kind: string | null };
type Vendor   = { id: number; name: string };

type PostDTO = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null;
  priority: number | null;
  pinned_until: string | null;
  effective_from: string | null;
  vendor: Vendor | null;
  post_categories: { category: Category }[];
  post_badges: { badge: Badge }[];
};

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  const res = await fetch(`${base}/api/news/${params.slug}`, { cache: 'no-store' });
  if (!res.ok) return { title: 'Beitrag' };
  const { data }: { data: PostDTO } = await res.json();
  return {
    title: data?.title ?? 'Beitrag',
    description: data?.summary ?? undefined,
  };
}

export default async function NewsDetailPage({ params }: { params: { slug: string } }) {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  const res = await fetch(`${base}/api/news/${params.slug}`, { cache: 'no-store' });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Fehler beim Laden des Beitrags');

  const { data }: { data: PostDTO } = await res.json();

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm">
        <Link href="/news" className="text-blue-600 dark:text-blue-400 hover:underline">
          ← Zur Übersicht
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{data.title}</h1>
        {data.vendor && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Veranstalter: {data.vendor.name}
          </div>
        )}
        {data.summary && (
          <p className="text-gray-700 dark:text-gray-300">{data.summary}</p>
        )}
      </header>

      {/* Inhalte */}
      {data.content && (
        <article className="prose dark:prose-invert max-w-none prose-p:my-3 prose-li:my-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
        </article>
      )}

      {/* Meta-Chips */}
      <div className="flex flex-wrap gap-2 pt-2">
        {data.post_categories.map(pc => (
          <span
            key={pc.category.id}
            className="px-2 py-0.5 rounded-full text-xs border
                       border-gray-200 dark:border-gray-700
                       bg-white dark:bg-transparent
                       text-gray-700 dark:text-gray-200
                       inline-flex items-center gap-2"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: pc.category.color ?? '#94a3b8' }}
              aria-hidden
            />
            {pc.category.name}
          </span>
        ))}

        {data.post_badges.map(pb => (
          <span
            key={pb.badge.id}
            className="px-2 py-0.5 rounded-full text-xs border
                       border-gray-200 dark:border-gray-700
                       bg-white dark:bg-transparent
                       text-gray-700 dark:text-gray-200
                       inline-flex items-center gap-2"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: pb.badge.color ?? '#94a3b8' }}
              aria-hidden
            />
            {pb.badge.name}
          </span>
        ))}
      </div>
    </div>
  );
}
