// app/news/[slug]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type PageProps = { params: { slug: string } | Promise<{ slug: string }> };

type PostImage = {
  url: string;
  caption?: string | null;
  sort_order?: number | null;
};

type ApiData = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null; // Achtung: bei dir aktuell HTML
  author_name?: string | null;
  vendor?: { id: number; name: string } | null;
  post_categories?: { category: { id: number; name: string; color: string | null } }[];
  post_badges?: { badge: { id: number; name: string; color: string | null; kind: string | null } }[];
  sources?: { url: string; label: string | null; sort_order: number | null }[];
  images?: PostImage[];
};

export default async function Page({ params }: PageProps) {
  // Next 14/15: params kann Objekt ODER Promise sein
  const { slug } = await (params as any);

  // RELATIVE URL verwenden -> gleiche Origin (Vercel, Codespaces, lokal)
  const res = await fetch(`/api/news/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error('API /api/news/[slug] status', res.status);
    notFound();
  }

  const { data } = (await res.json()) as { data: ApiData | null };
  if (!data) notFound();

  const sources = (data.sources ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    );

  return (
    <div className="container max-w-3xl mx-auto py-8 space-y-6">
      <Link prefetch={false} href="/news" className="text-sm text-blue-600 hover:underline">
        ← Zurück zur Übersicht
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{data.title}</h1>

        {(data.vendor?.name || data.author_name) && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {data.vendor?.name}
            {data.vendor?.name && data.author_name ? ' · ' : ''}
            {data.author_name ? `von ${data.author_name}` : ''}
          </div>
        )}

        {!!(data.post_badges?.length ?? 0) && (
          <div className="flex flex-wrap gap-1.5">
            {data.post_badges!.map(({ badge }) => (
              <span
                key={badge.id}
                title={badge.name}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4
                           border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
              >
                {badge.name}
              </span>
            ))}
          </div>
        )}
      </header>

      {data.summary && (
        <p className="text-lg text-gray-700 dark:text-gray-300">{data.summary}</p>
      )}

      {!!data.images?.length && <Gallery images={data.images} />}

      {/* Inhalt: Du lieferst HTML; wenn du Markdown liefern willst, lass ReactMarkdown. */}
      {data.content && (
        // Variante A (HTML, wie in deiner API):
        <article
          className="prose dark:prose-invert max-w-none prose-p:my-3 prose-li:my-1"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
        // Variante B (Markdown): 
        // <article className="prose dark:prose-invert max-w-none prose-p:my-3 prose-li:my-1">
        //   <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
        // </article>
      )}

      {!!data.post_categories?.length && (
        <div className="flex flex-wrap gap-2">
          {data.post_categories!.map(({ category }) => (
            <span
              key={category.id}
              className="px-2 py-0.5 rounded-full text-xs border border-gray-200 dark:border-gray-700
                         bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 inline-flex items-center gap-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: category.color ?? '#94a3b8' }}
                aria-hidden
              />
              {category.name}
            </span>
          ))}
        </div>
      )}

      {!!sources.length && (
        <section className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Quellen</h2>
          <ol className="list-decimal pl-5 space-y-1">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="break-words">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 dark:text-blue-400 underline break-words"
                >
                  {prettySourceLabel(s.url, s.label ?? undefined)}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function prettySourceLabel(url: string, fallback?: string) {
  if (fallback && fallback.trim()) return fallback.trim();
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

function Gallery({ images }: { images: PostImage[] }) {
  const sorted = images
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {sorted.map((im, idx) => (
        <figure
          key={`${im.url}-${idx}`}
          className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
        >
          <img src={im.url} alt={im.caption ?? ''} className="w-full h-40 object-cover" />
          {im.caption && (
            <figcaption className="px-2 py-1 text-[11px] text-gray-600 dark:text-gray-400">
              {im.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
