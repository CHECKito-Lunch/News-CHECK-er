// app/(site)/events/[slug]/EventComments.tsx
'use client';

import { useEffect, useState } from 'react';

export default function EventComments({ eventId }: { eventId: number }) {
  const [items, setItems] = useState<Array<{id:number; user_id:string; author_name?:string|null; message:string; created_at:string}>>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    const r = await fetch(`/api/events/${eventId}/comments`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(()=>null);
    if (r.ok && j?.ok && Array.isArray(j.items)) setItems(j.items);
  }

  useEffect(()=>{ load(); }, [eventId]);

  async function submit() {
    const msg = text.trim();
    if (!msg) { setErr('Bitte einen Kommentar eingeben.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/events/${eventId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },      // ❗️WICHTIG
        body: JSON.stringify({ message: msg }),               // ❗️WICHTIG
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setText('');
      await load();
    } catch (e:any) {
      setErr(e?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <h3 className="font-semibold">Kommentare</h3>

      {items.length === 0 ? (
        <div className="text-sm text-gray-500">Noch keine Kommentare.</div>
      ) : (
        <ul className="space-y-2">
          {items.map(c=>(
            <li key={c.id} className="text-sm">
              <div className="font-medium">{c.author_name || c.user_id}</div>
              <div className="opacity-70">{new Date(c.created_at).toLocaleString('de-DE')}</div>
              <div className="mt-1">{c.message}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-2">
        <input
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10"
          placeholder="Kommentar schreiben…"
          value={text}
          onChange={e=>setText(e.target.value)}
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
        >
          {busy ? '…' : 'Senden'}
        </button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
    </div>
  );
}
