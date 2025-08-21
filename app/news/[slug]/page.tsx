// app/news/[slug]/page.tsx
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Vendor   = { id: number; name: string };
type Category = { id: number; name: string; color: string | null };
type Badge    = { id: number; name: string; color: string | null; kind: string | null };

type Post = {
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

type ApiResponse = { data: Post };

// Next.js 15: params ist ein Promise → awaiten
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Relativer Fetch funktioniert serverseitig in App Router
  const res = await fetch(`/api/news/${slug}`, { cache: 'no-store' });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to load post: ${res.status}`);

  const { data } = (await res.json()) as ApiResponse;

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{data.title}</h1>
        {data.vendor && (
          <div className="text-sm text-gray-500 dark:text-gray-400">{data.vendor.name}</div>
        )}
        {data.summary && (
          <p className="text-gray-700 dark:text-gray-300 mt-2">{data.summary}</p>
        )}
      </header>

      {data.content && (
        <article className="prose dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.content}
          </ReactMarkdown>
        </article>
      )}

      {(data.post_categories?.length || data.post_badges?.length) ? (
        <footer className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
          {data.post_categories?.map(pc => (
            <span
              key={pc.category.id}
              className="px-2 py-0.5 rounded-full text-xs border
                         border-gray-200 dark:border-gray-700
                         bg-white dark:bg-transparent
                         text-gray-700 dark:text-gray-200 inline-flex items-center gap-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: pc.category.color ?? '#94a3b8' }}
                aria-hidden
              />
              {pc.category.name}
            </span>
          ))}
          {data.post_badges?.map(pb => (
            <span
              key={pb.badge.id}
              className="px-2 py-0.5 rounded-full text-xs border
                         border-gray-200 dark:border-gray-700
                         bg-white dark:bg-transparent
                         text-gray-700 dark:text-gray-200 inline-flex items-center gap-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: pb.badge.color ?? '#94a3b8' }}
                aria-hidden
              />
              {pb.badge.name}
            </span>
          ))}
        </footer>
      ) : null}
    </div>
  );
}

// Optional: schönes <title> pro Seite
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return { title: `News – ${slug}` };
}
