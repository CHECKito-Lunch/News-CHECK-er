'use client';

import { useEffect, useState } from 'react';

type CommentRow = {
  id: number;
  user_name: string | null;
  content: string;
  created_at: string;
};

async function safeJson(r: Response) {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

export default function EventComments({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [authErr, setAuthErr] = useState('');

  async function load() {
    setLoading(true); setErr(''); setAuthErr('');
    try {
      const r = await fetch(`/api/events/${eventId}/comments`, { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) { setAuthErr('Bitte einloggen, um zu kommentieren.'); setItems([]); return; }
      const j = await safeJson(r);
      setItems(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Fehler beim Laden.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [eventId]);

  async function submit() {
    const content = text.trim();
    if (!content) return;
    setBusy(true); setErr(''); setAuthErr('');
    try {
      const r = await fetch(`/api/events/${eventId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (r.status === 401) { setAuthErr('Bitte einloggen, um zu kommentieren.'); return; }
      const j = await safeJson(r);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setText('');
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Fehler beim Speichern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Kommentare</h2>

      {loading ? (
        <div className="text-sm text-gray-500">lädt…</div>
      ) : (
        <>
          {items.length === 0 && <div className="text-sm text-gray-500">Noch keine Kommentare.</div>}
          {items.length > 0 && (
            <ul className="space-y-3">
              {items.map((c) => (
                <li key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 p-3">
                  <div className="text-sm">
                    <span className="font-medium">{c.user_name || 'User'}</span>{' '}
                    <span className="text-gray-500">
                      · {new Date(c.created_at).toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="mt-1 text-[15px] whitespace-pre-wrap">{c.content}</div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-white/5">
            {authErr ? (
              <div className="text-sm text-amber-600">
                {authErr} <a href="/auth/login" className="underline">Login</a>
              </div>
            ) : (
              <>
                <textarea
                  className="w-full rounded-lg px-3 py-2 bg-white text-gray-900 border border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/10"
                  rows={3}
                  placeholder="Kommentar schreiben…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={submit}
                    disabled={busy || !text.trim()}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm"
                  >
                    {busy ? '…' : 'Absenden'}
                  </button>
                </div>
              </>
            )}
            {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
          </div>
        </>
      )}
    </section>
  );
}
