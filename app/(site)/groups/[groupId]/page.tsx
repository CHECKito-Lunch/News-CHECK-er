'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'isomorphic-dompurify';
import { useParams } from 'next/navigation';
import { authedFetch } from '@/lib/fetchWithSupabase';

type Post = { id: number; title: string; summary?: string|null; content?: string|null; effective_from?: string|null };
type Comment = { id:number; user_name?:string|null; content:string; created_at:string };

function isProbablyHTML(s?: string|null){ return !!s && /<\/?[a-z][\s\S]*>/i.test(s); }
function sanitize(html:string){ return DOMPurify.sanitize(html, { ADD_ATTR: ['target','rel'] }); }

export default function GroupRoom() {
  const params = useParams<{ groupId: string }>();
  const groupId = Number(params.groupId);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    const r = await authedFetch(`/api/groups/${groupId}/posts?page=1&pageSize=20`);
    if (!r.ok) { setError(r.status === 403 ? 'Kein Zugriff (nur für Mitglieder).' : 'Konnte Beiträge nicht laden.'); setPosts([]); setLoading(false); return; }
    const j = await r.json().catch(()=>({ data: [] }));
    setPosts(j.data || []);
    setLoading(false);
  }
  useEffect(()=>{ load(); },[groupId]);

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    const r = await authedFetch(`/api/groups/${groupId}/posts`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: title.trim(), content: content.trim(), summary: null }),
    });
    if (!r.ok) { alert('Konnte Beitrag nicht erstellen.'); return; }
    setTitle(''); setContent(''); await load();
  }

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Gruppe #{groupId}</h1>

      {/* Composer */}
      <section className="p-4 rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <form onSubmit={createPost} className="grid gap-3">
          <input
            placeholder="Titel"
            value={title}
            onChange={e=>setTitle(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700"
          />
          <textarea
            placeholder="Inhalt (Markdown oder HTML)"
            value={content}
            onChange={e=>setContent(e.target.value)}
            rows={6}
            className="px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700"
          />
          <div className="flex justify-end">
            <button className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Beitrag veröffentlichen</button>
          </div>
        </form>
      </section>

      {/* Feed */}
      {loading && <div>Lade…</div>}
      {!loading && error && <div className="text-amber-700 dark:text-amber-400">{error}</div>}
      {!loading && !error && posts.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed text-center text-gray-600 dark:text-gray-300">Noch keine Beiträge.</div>
      )}
      {!loading && !error && posts.length > 0 && (
        <ul className="grid gap-4">
          {posts.map(p => (
            <li key={p.id} className="p-5 rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
              <div className="text-xl font-semibold">{p.title}</div>
              {p.summary && <p className="mt-1 text-gray-700 dark:text-gray-300">{p.summary}</p>}
              {p.content && (
                <div className="prose dark:prose-invert max-w-none mt-3">
                  {isProbablyHTML(p.content) ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: sanitize(p.content) }}
                      className="[&_a]:underline [&_img]:max-w-full"
                    />
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.content}</ReactMarkdown>
                  )}
                </div>
              )}

              <Comments postId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comments({ postId }: { postId: number }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [val, setVal] = useState('');
  useEffect(()=>{ (async ()=>{
    const r = await authedFetch(`/api/group-posts/${postId}/comments`);
    const j = await r.json().catch(()=>({items:[]}));
    setItems(Array.isArray(j.items)? j.items : []);
  })(); },[postId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = val.trim();
    if (!content) return;
    setVal('');
    // optimistic
    const temp: Comment = { id: Math.random(), user_name: 'Ich', content, created_at: new Date().toISOString() } as any;
    setItems(prev => [...prev, temp]);
    const r = await authedFetch(`/api/group-posts/${postId}/comments`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content })
    });
    if (!r.ok) { alert('Kommentar fehlgeschlagen'); setItems(prev => prev.filter(x => x !== temp)); }
    else {
      const j = await r.json().catch(()=>({}));
      setItems(prev => prev.map(x => x===temp ? { ...temp, id: j.id ?? temp.id, created_at: j.created_at ?? temp.created_at } : x));
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
      <div className="text-sm font-semibold mb-2">Kommentare</div>
      {items.length === 0 && <div className="text-sm text-gray-500 mb-2">Noch keine Kommentare.</div>}

      <ul className="space-y-2">
        {items.map(c => (
          <li key={c.id} className="text-sm">
            <div className="text-gray-700 dark:text-gray-300">
              <span className="font-medium">{c.user_name ?? 'User'}</span>{' '}
              <span className="text-gray-500">· {new Date(c.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className="whitespace-pre-wrap">{c.content}</div>
          </li>
        ))}
      </ul>

      <form onSubmit={send} className="mt-3 flex items-start gap-2">
        <textarea
          value={val}
          onChange={e=>setVal(e.target.value)}
          rows={2}
          placeholder="Kommentieren…"
          className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700 text-sm"
        />
        <button className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm">Senden</button>
      </form>
    </div>
  );
}
