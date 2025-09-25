'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type EventRow = {
  id: number; slug: string; title: string; summary: string|null; content: string|null;
  location: string|null; starts_at: string; ends_at: string|null; capacity: number|null;
  status: 'draft'|'published'|'cancelled';
  confirmed_count: number; waitlist_count: number;
  hero_image_url?: string | null;
  gallery_json?: string | null; // JSON-Array string
};

const card = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const input = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 border border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/10';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20';

/* ---------- Zeit-Helfer ---------- */
// lokale Eingabe 'YYYY-MM-DDTHH:mm' -> ISO (UTC) oder null
const toIso = (v: string) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
// ISO (UTC) -> Wert für <input type="datetime-local"> in lokaler TZ
const toInputFromIso = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ---------- Teilnehmer ---------- */
type Attendee = {
  event_id: number;
  user_id: string;
  state: 'confirmed' | 'waitlist';
  created_at: string;
  updated_at?: string;
  name?: string | null;
  email?: string | null;
};

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

export default function AdminEventsPage() {
  // liste
  const [rows, setRows] = useState<EventRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // form
  const [editing, setEditing] = useState<number|null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState(''); // Markdown
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState<number|null>(null);
  const [status, setStatus] = useState<'draft'|'published'|'cancelled'>('published');

  // media
  const [heroUrl, setHeroUrl] = useState<string>('');
  const [gallery, setGallery] = useState<string[]>([]);

  // --- Teilnehmer-Modal State ---
  const [attModalOpen, setAttModalOpen] = useState(false);
  const [attEvent, setAttEvent] = useState<EventRow | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [attErr, setAttErr] = useState('');
  const [attRows, setAttRows] = useState<Attendee[]>([]);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());

      const url = p.toString() ? `/api/admin/events?${p}` : '/api/admin/events';
      const r = await fetch(url, { credentials: 'include' });

      const raw = await r.text();
      const j = raw ? JSON.parse(raw) : { ok: false, error: `HTTP ${r.status}` };

      if (!r.ok || !j.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows(j.data ?? []);
    } catch (e: any) {
      setRows([]);
      setMsg(e?.message ?? 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{ load(); }, []);

  function reset() {
    setEditing(null);
    setTitle(''); setStartsAt(''); setEndsAt('');
    setSummary(''); setContent('');
    setLocation(''); setCapacity(null); setStatus('published');
    setHeroUrl(''); setGallery([]);
    setMsg('');
  }

  async function save() {
    setMsg('');

    // einfache Pflichtfeld-Checks wie vom Server erwartet
    if (!title.trim()) { setMsg('Bitte einen Titel eingeben.'); return; }
    if (!startsAt)     { setMsg('Bitte Beginn (Datum/Uhrzeit) wählen.'); return; }

    const payload: any = {
      title: title.trim(),
      starts_at: toIso(startsAt),
      ends_at: toIso(endsAt),
      summary,
      content,         // Markdown
      location,
      capacity,
      status,
      hero_image_url: heroUrl || null,
      gallery,         // Array<string> (URLs)
    };

    try {
      const url = editing ? `/api/admin/events/${editing}` : '/api/admin/events';
      const method = editing ? 'PATCH' : 'POST';

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const raw = await r.text();
      const j = raw ? JSON.parse(raw) : { ok: false, error: `HTTP ${r.status}` };

      if (!r.ok || !j.ok) throw new Error(j?.error || 'save_failed');

      await load();
      reset();
      setMsg('Gespeichert.');
    } catch (e: any) {
      setMsg(e?.message ?? 'Fehler');
      console.error('save() failed:', e);
    }
  }

  async function del(id:number) {
    if (!confirm('Event löschen?')) return;
    const r = await fetch(`/api/admin/events/${id}`, { method:'DELETE', credentials: 'include' });
    if (r.ok) { await load(); if (editing===id) reset(); }
  }

  function startEdit(ev: EventRow) {
    setEditing(ev.id);
    setTitle(ev.title);
    setStartsAt(toInputFromIso(ev.starts_at));             // ⬅️ statt slice
    setEndsAt(toInputFromIso(ev.ends_at));                 // ⬅️ statt slice
    setSummary(ev.summary || '');
    setContent(ev.content || '');
    setLocation(ev.location || '');
    setCapacity(ev.capacity ?? null);
    setStatus(ev.status);
    const gal = safeParseArray(ev.gallery_json);
    setGallery(gal);
    setHeroUrl(ev.hero_image_url || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Teilnehmer-Modal Logik ---------- */
  async function loadAttendees(event: EventRow) {
    setAttErr(''); setAttLoading(true);
    try {
      const r = await fetch(`/api/admin/events/${event.id}/attendees`, { credentials: 'include' });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setAttRows(Array.isArray(j.data) ? j.data : []);
    } catch (e:any) {
      setAttRows([]); setAttErr(e?.message || 'Fehler beim Laden');
    } finally {
      setAttLoading(false);
    }
  }

  function openAttendees(event: EventRow) {
    setAttEvent(event);
    setAttModalOpen(true);
    loadAttendees(event);
  }

  async function setStateFor(user_id: string, next: 'confirmed'|'waitlist') {
    if (!attEvent) return;
    const prev = attRows.slice();
    // optimistic
    setAttRows(rs => rs.map(r => r.user_id===user_id ? { ...r, state: next } : r));
    try {
      const r = await fetch(`/api/admin/events/${attEvent.id}/attendees`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, state: next })
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({})))?.error || 'Fehler');
      await load(); // Zähler der Eventliste auffrischen
    } catch (e:any) {
      setAttRows(prev); setAttErr(e?.message || 'Änderung fehlgeschlagen');
    }
  }

  async function removeAttendee(user_id: string) {
    if (!attEvent) return;
    const prev = attRows.slice();
    setAttRows(rs => rs.filter(r => r.user_id !== user_id)); // optimistic
    try {
      const r = await fetch(`/api/admin/events/${attEvent.id}/attendees`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id })
      });
      if (!r.ok) throw new Error((await r.json().catch(()=>({})))?.error || 'Fehler');
      await load();
    } catch (e:any) {
      setAttRows(prev); setAttErr(e?.message || 'Entfernen fehlgeschlagen');
    }
  }

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
      </div>

      {/* Formular */}
      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">
          {editing ? `Event bearbeiten (#${editing})` : 'Neues Event anlegen'}
        </h2>

        {/* Basisdaten */}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Titel</label>
            <input className={input} value={title} onChange={e=>setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm">Ort</label>
            <input className={input} value={location} onChange={e=>setLocation(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Beginn</label>
            <input
              className={input}
              type="datetime-local"
              value={startsAt}
              onChange={e=>setStartsAt(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm">Ende (optional)</label>
            <input className={input} type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Kapazität (leer = unbegrenzt)</label>
            <input
              className={input}
              type="number"
              value={capacity ?? ''}
              onChange={e=>setCapacity(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="text-sm">Status</label>
            <select className={input} value={status} onChange={e=>setStatus(e.target.value as any)}>
              <option value="published">published</option>
              <option value="draft">draft</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm">Kurzbeschreibung</label>
            <textarea className={input} rows={2} value={summary} onChange={e=>setSummary(e.target.value)} />
          </div>

          {/* Medien */}
          <div>
            <label className="text-sm">Cover-Bild (URL oder Upload)</label>
            <div className="flex gap-2">
              <input
                className={input + ' flex-1'}
                placeholder="https://…"
                value={heroUrl}
                onChange={e=>setHeroUrl(e.target.value)}
              />
              <UploadButton onUploaded={(urls)=> setHeroUrl(urls[0] || '')} multiple={false} />
            </div>
            {heroUrl && (
              <div className="mt-2">
                <img src={heroUrl} alt="Cover" className="h-28 rounded-xl object-cover border border-gray-200 dark:border-gray-800" />
              </div>
            )}
          </div>

          <div>
            <label className="text-sm">Galerie (URLs oder Upload)</label>
            <div className="flex gap-2">
              <input
                className={input + ' flex-1'}
                placeholder="URL einfügen und Enter…"
                onKeyDown={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (e.key === 'Enter' && v) {
                    setGallery(g => [...g, v]); (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <UploadButton onUploaded={(urls)=> setGallery(g => [...g, ...urls])} multiple />
            </div>
            {gallery.length > 0 && (
              <ul className="mt-2 grid grid-cols-3 gap-2">
                {gallery.map((u, i) => (
                  <li key={u + i} className="relative">
                    <img src={u} alt="" className="h-20 w-full object-cover rounded-lg border border-gray-200 dark:border-gray-800" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 text-xs px-2 py-0.5 rounded bg-white/90 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700"
                      onClick={()=> setGallery(g => g.filter((x,idx)=> idx!==i))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Rich Text */}
          <div className="md:col-span-2">
            <label className="text-sm">Inhalt (Rich Text / Markdown)</label>
            <MarkdownEditor value={content} onChange={setContent} />
          </div>
        </div>

        <div className="flex gap-2">
          <button className={btn} onClick={save}>{editing ? 'Aktualisieren' : 'Anlegen'}</button>
          <button className={btn} onClick={reset}>Neu</button>
        </div>
        {msg && <div className="text-sm text-gray-600">{msg}</div>}
      </div>

      {/* Liste */}
      <div className={card + ' space-y-3'}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Liste</h2>
          <div className="flex gap-2">
            <input placeholder="Suche…" className={input + ' w-64'} value={q} onChange={e=>setQ(e.target.value)} />
            <button className={btn} onClick={load}>Event suchen</button>
          </div>
        </div>

        {loading ? <div>lädt…</div> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr>
                <th className="px-3 py-2 text-left">Beginn</th>
                <th className="px-3 py-2 text-left">Titel</th>
                <th className="px-3 py-2">Kap.</th>
                <th className="px-3 py-2">Bestätigt</th>
                <th className="px-3 py-2">Warteliste</th>
                <th className="px-3 py-2">Bild</th>
                <th className="px-3 py-2 text-right">Aktionen</th>
              </tr></thead>
              <tbody>
                {rows.map(ev=>(
                  <tr key={ev.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2">{new Date(ev.starts_at).toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2">{ev.title}</td>
                    <td className="px-3 py-2 text-center">{ev.capacity ?? '∞'}</td>
                    <td className="px-3 py-2 text-center">{ev.confirmed_count}</td>
                    <td className="px-3 py-2 text-center">{ev.waitlist_count}</td>
                    <td className="px-3 py-2">
                      {ev.hero_image_url ? <img src={ev.hero_image_url} className="h-8 w-8 rounded object-cover" alt="" /> : '—'}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <a className={btn} href={`/events/${ev.slug}`} target="_blank">Öffnen</a>
                      <button className={btn} onClick={()=>startEdit(ev)}>Bearbeiten</button>
                      <button className={btn} onClick={()=>openAttendees(ev)}>Teilnehmer</button>
                      <button className={btn} onClick={()=>del(ev.id)}>Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Teilnehmer-Modal */}
      <Modal
        open={attModalOpen}
        onClose={()=> setAttModalOpen(false)}
        title={attEvent ? `Teilnehmer – ${attEvent.title}` : 'Teilnehmer'}
      >
        {/* Kopf: Kapazität & Zähler */}
        {attEvent && (
          <div className="mb-3 text-sm text-gray-600 dark:text-gray-300 flex flex-wrap items-center gap-3">
            <span>Kapazität: <b>{attEvent.capacity ?? '∞'}</b></span>
            <span>Bestätigt: <b>{attRows.filter(r=>r.state==='confirmed').length}</b></span>
            <span>Warteliste: <b>{attRows.filter(r=>r.state==='waitlist').length}</b></span>
            <button
              className={btn + ' ml-auto'}
              onClick={()=> loadAttendees(attEvent)}
              disabled={attLoading}
            >
              {attLoading ? 'Aktualisiere…' : 'Neu laden'}
            </button>
          </div>
        )}

        {attErr && <div className="mb-3 text-sm text-red-600">{attErr}</div>}

        {/* Liste */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {attRows.length === 0 && (
                <tr><td className="px-3 py-6 text-gray-500" colSpan={4}>Keine Anmeldungen.</td></tr>
              )}
              {attRows.map(r => (
                <tr key={r.user_id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2">{r.name || '—'}</td>
                  <td className="px-3 py-2">{r.email || '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={classNames(
                        'inline-flex items-center px-2 py-0.5 rounded-full border text-xs',
                        r.state==='confirmed'
                          ? 'border-emerald-300 text-emerald-700 dark:border-emerald-600/50 dark:text-emerald-300'
                          : 'border-amber-300 text-amber-700 dark:border-amber-600/50 dark:text-amber-300'
                      )}
                    >
                      {r.state === 'confirmed' ? 'bestätigt' : 'Warteliste'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {r.state === 'waitlist' ? (
                      <button className={btn} onClick={()=> setStateFor(r.user_id, 'confirmed')}>Bestätigen</button>
                    ) : (
                      <button className={btn} onClick={()=> setStateFor(r.user_id, 'waitlist')}>Auf Warteliste</button>
                    )}
                    <button className={btn} onClick={()=> removeAttendee(r.user_id)}>Entfernen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- Hilfskomponenten ---------- */

function safeParseArray(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const j = JSON.parse(v);
    return Array.isArray(j) ? j.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

function UploadButton({
  onUploaded,
  multiple = true
}: { onUploaded: (urls: string[]) => void; multiple?: boolean }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          const fd = new FormData();
          files.forEach(f => fd.append('files', f));
          const r = await fetch('/api/upload', {
            method: 'POST',
            body: fd,
            credentials: 'include'
          });
          const j = await r.json().catch(()=> ({}));
          if (r.ok && j.ok && Array.isArray(j.urls)) onUploaded(j.urls);
          else alert(j.error || 'Upload fehlgeschlagen');
          if (fileRef.current) fileRef.current.value = '';
        }}
      />
      <button type="button" className={btn} onClick={()=> fileRef.current?.click()}>
        Bild{multiple ? 'er' : ''} hochladen
      </button>
    </>
  );
}

function MarkdownEditor({
  value, onChange
}: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<'edit'|'preview'>('edit');

  // einfache Toolbar-Helper
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  function surround(left: string, right = left) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);
    onChange(before + left + sel + right + after);
    // Fokus halten
    requestAnimationFrame(()=> {
      ta.focus();
      const pos = start + left.length + sel.length + right.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800">
        <button className={toolBtn} onClick={()=> surround('**')}>B</button>
        <button className={toolBtn} onClick={()=> surround('_')}>I</button>
        <button className={toolBtn} onClick={()=> surround('## ', '')}>H2</button>
        <button className={toolBtn} onClick={()=> surround('- ', '')}>• Liste</button>
        <button className={toolBtn} onClick={()=> surround('1. ', '')}>1. Liste</button>
        <button className={toolBtn} onClick={()=> surround('[Text](', ')')}>Link</button>
        <button className={toolBtn} onClick={()=> surround('![Alt](', ')')}>Bild</button>

        <div className="ml-auto inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <button
            className={`px-3 py-1 text-sm ${tab==='edit' ? 'bg-white dark:bg-white/10' : 'bg-transparent'}`}
            onClick={()=> setTab('edit')}
          >Bearbeiten</button>
          <button
            className={`px-3 py-1 text-sm border-l border-gray-200 dark:border-gray-700 ${tab==='preview' ? 'bg-white dark:bg-white/10' : 'bg-transparent'}`}
            onClick={()=> setTab('preview')}
          >Vorschau</button>
        </div>
      </div>

      {tab === 'edit' ? (
        <textarea
          ref={taRef}
          className="w-full min-h-[220px] p-3 bg-transparent outline-none resize-y"
          value={value}
          onChange={(e)=> onChange(e.target.value)}
          placeholder="Markdown tippen…"
        />
      ) : (
        <div className="prose dark:prose-invert max-w-none p-3 text-[15px]">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <div className="text-sm text-gray-500">Keine Inhalte</div>
          )}
        </div>
      )}
    </div>
  );
}
const toolBtn = 'px-2 py-1 text-sm rounded hover:bg-white/70 dark:hover:bg-white/10';

/* ---------- Modal ---------- */
function Modal({
  open, onClose, children, title
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button className={btn} onClick={onClose}>Schließen</button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
