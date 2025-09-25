// app/admin/news/NewsEditorClient.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '../shared/auth';
import { inputClass, cardClass } from '../shared/ui';
import { slugify, toLocalInput, fromLocalInput } from '../shared/helpers';
import type { Option, SourceRow, PostRow } from '../shared/types';
import RichTextEditor from '../../components/RichTextEditor';

type ImageRow = {
  url: string;
  path?: string | null;
  caption?: string | null;
  sort_order?: number | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

function publicUrlFromPath(path?: string | null, bucket = 'uploads'): string {
  if (!path || !SUPABASE_URL) return '';
  return `${SUPABASE_URL.replace(/\/+$/,'')}/storage/v1/object/public/${bucket}/${String(path).replace(/^\/+/,'')}`;
}
function guessPathFromUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
  return m?.[1] ?? null;
}

/* ───────────────────────── Fullscreen-Editor (Modal) ───────────────────────── */
function FullscreenEditorModal({
  open, value, onClose, onChange, onSave,
}: {
  open: boolean;
  value: string;
  onClose: () => void;
  onChange: (html: string) => void;
  onSave: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-4 md:inset-8 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-800">
          <div className="font-semibold">Editor im Vollbild</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              Speichern (⌘/Ctrl+S)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
            >
              Schließen
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-3 overflow-auto">
          {/* Im Modal bekommt der Editor mehr Höhe */}
          <div className="min-h-[60vh]">
            <RichTextEditor value={value} onChange={onChange} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────── */

type OptionMeta = { categories: Option[]; badges: Option[]; vendors: Option[] };

export default function NewsEditorClient() {
  const {
    loading, sessionOK, isAdmin, authMsg, setAuthMsg, userEmail, setUserEmail, userPassword, setUserPassword, doLogin,
  } = useAdminAuth();
  const search = useSearchParams();
  const router = useRouter();
  const editIdFromUrl = search.get('id');

  const [meta, setMeta] = useState<OptionMeta>({ categories: [], badges: [], vendors: [] });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');       const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');   const [content, setContent] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [pinnedUntil, setPinnedUntil] = useState('');   const [effectiveFrom, setEffectiveFrom] = useState('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [badgeIds, setBadgeIds] = useState<number[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([{ url:'', label:'' }]);

  const [images, setImages] = useState<ImageRow[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [dirty, setDirty] = useState(false);

  // UI niceties
  const [editorOpen, setEditorOpen] = useState(false);         // fullscreen modal
  const contentPaneRef = useRef<HTMLDivElement | null>(null);  // resizable wrapper

  // Meta laden
  useEffect(() => {
    fetch('/api/meta', { credentials:'same-origin' })
      .then(r=>r.json())
      .then(setMeta)
      .catch(()=>setMeta({categories:[],badges:[],vendors:[]}));
  }, []);
  useEffect(() => { setSlug(slugify(title)); }, [title]);

  // Daten laden (Edit)
  useEffect(() => {
    if (!sessionOK || !isAdmin || !editIdFromUrl) return;
    (async () => {
      const res = await fetch(`/api/admin/posts/${editIdFromUrl}`, { credentials:'same-origin' });
      const json = await res.json().catch(()=>({}));
      const p: (PostRow & { images?: any[] }) | undefined = json?.data;
      if (!p) return;

      setEditingId(p.id);
      setTitle(p.title ?? ''); setSlug(p.slug ?? ''); setSummary(p.summary ?? ''); setContent(p.content ?? '');
      // @ts-ignore
      setVendorId((p as any).vendor_id ?? null);
      setIsDraft(p.status === 'draft');
      setPinnedUntil(toLocalInput(p.pinned_until)); setEffectiveFrom(toLocalInput(p.effective_from));
      // @ts-ignore
      setCategoryIds((p as any).categories?.map((c:any)=>c.id) ?? []);
      // @ts-ignore
      setBadgeIds((p as any).badges?.map((b:any)=>b.id) ?? []);
      setSources(((p as any).sources ?? []).map((s:any) => ({ url:s.url, label:s.label ?? '' })) || [{ url:'', label:'' }]);

      const imgs = Array.isArray((p as any).images) ? (p as any).images : [];
      const norm: ImageRow[] = imgs.map((im: any, i: number) => {
        const path = (im.path ?? null) as string | null;
        const url  = im.url ?? publicUrlFromPath(path) ?? '';
        return {
          url,
          path,
          caption: im.caption ?? im.title ?? '',
          sort_order: Number.isFinite(Number(im.sort_order)) ? Number(im.sort_order) : i,
        };
      });
      setImages(norm);
      setResult('');
      setDirty(false);
    })();
  }, [editIdFromUrl, sessionOK, isAdmin]);

  // Unsaved guard (Tab schließen/Reload)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Ctrl/Cmd+S -> save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';
      if (isSave) {
        e.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, title, content, summary, isDraft, pinnedUntil, effectiveFrom, categoryIds, badgeIds, sources, vendorId]);

  // dirty tracking
  useEffect(() => { setDirty(true); }, [title, slug, summary, content, vendorId, isDraft, pinnedUntil, effectiveFrom, categoryIds, badgeIds, JSON.stringify(sources), JSON.stringify(images)]);

  const canSave = useMemo(() => title.trim().length>0, [title]);

  const effectiveHint = useMemo(() => {
    if (isDraft) return 'Entwurf – nicht sichtbar für Nutzer.';
    if (!effectiveFrom) return 'Ohne Datum sofort sichtbar (als „Veröffentlicht“).';
    const eff = new Date(effectiveFrom);
    return eff.getTime() > Date.now() ? `Sichtbar ab ${eff.toLocaleString()} (als „Geplant“).` : `Bereits gültig (als „Veröffentlicht“).`;
  }, [effectiveFrom, isDraft]);

  const pinHint = useMemo(() => {
    if (!pinnedUntil) return 'Optional: ohne Datum wird nicht angepinnt.';
    const pin = new Date(pinnedUntil);
    return pin.getTime() > Date.now() ? `Angepinnt bis ${pin.toLocaleString()} (bleibt in der Liste oben).` : `Datum liegt in der Vergangenheit – wird nicht mehr angepinnt.`;
  }, [pinnedUntil]);

  function resetForm() {
    setEditingId(null); setTitle(''); setSlug(''); setSummary(''); setContent(''); setVendorId(null);
    setIsDraft(false); setPinnedUntil(''); setEffectiveFrom(''); setCategoryIds([]); setBadgeIds([]);
    setSources([{ url:'', label:'' }]); setImages([]); setResult(''); setDirty(false);
    if (editIdFromUrl) router.replace('/admin/news');
  }

  // Upload-Helfer
  async function uploadToApi(fd: FormData) {
    let res = await fetch('/api/uploads?bucket=uploads', { method:'POST', body: fd, credentials:'same-origin' });
    if (!res.ok) res = await fetch('/api/admin/upload?bucket=uploads', { method:'POST', body: fd, credentials:'same-origin' });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Upload fehlgeschlagen');
    return res.json() as Promise<{ url:string; path?:string }>;
  }
  async function deleteFromApi(pathOrUrl: string) {
    const qs = new URLSearchParams({ bucket:'uploads', path:pathOrUrl }).toString();
    let res = await fetch(`/api/uploads?${qs}`, { method:'DELETE', credentials:'same-origin' });
    if (!res.ok) res = await fetch(`/api/admin/upload?${qs}`, { method:'DELETE', credentials:'same-origin' });
  }
  async function handleFiles(files: FileList | File[]) {
    if (!files || !files.length) return;
    setUploadBusy(true);
    try {
      const next: ImageRow[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        const now = new Date();
        const folder = `news/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}`;
        fd.append('folder', folder);
        const j = await uploadToApi(fd);
        const path = j.path ?? guessPathFromUrl(j.url) ?? null;
        next.push({ url: j.url, path, caption: '', sort_order: images.length + next.length - 1 });
      }
      setImages(prev => [...prev, ...next].map((im, i) => ({ ...im, sort_order: i })));
    } finally { setUploadBusy(false); }
  }
  function moveImage(index: number, dir: -1 | 1) {
    setImages(prev => {
      const arr = [...prev];
      const ni = index + dir;
      if (ni < 0 || ni >= arr.length) return prev;
      [arr[index], arr[ni]] = [arr[ni], arr[index]];
      return arr.map((im, i) => ({ ...im, sort_order: i }));
    });
  }
  async function removeImage(index: number) {
    setImages(prev => {
      const target = prev[index];
      if (target?.path) deleteFromApi(target.path).catch(()=>{});
      return prev.filter((_, i) => i !== index).map((im, i) => ({ ...im, sort_order: i }));
    });
  }

  // SAVE
  async function save() {
    if (!sessionOK || !isAdmin) { setResult('Kein Zugriff. Bitte als Admin anmelden.'); return; }
    setSaving(true); setResult('');

    const now = new Date();
    const effIso = effectiveFrom ? fromLocalInput(effectiveFrom) : null;
    const finalStatus: PostRow['status'] =
      isDraft ? 'draft' : (effIso && new Date(effIso).getTime() > now.getTime()) ? 'scheduled' : 'published';

    const imagesForDb = images
      .map((im, i) => ({
        path: im.path ?? guessPathFromUrl(im.url),
        title: (im.caption ?? '').trim() || null,
        sort_order: Number.isFinite(Number(im.sort_order)) ? Number(im.sort_order) : i,
      }))
      .filter(x => !!x.path);

    const payload: any = {
      post: {
        title, summary, content, slug,
        vendor_id: vendorId ?? null,
        status: finalStatus,
        pinned_until: pinnedUntil ? fromLocalInput(pinnedUntil) : null,
        effective_from: effIso,
      },
      categoryIds,
      badgeIds,
      sources: sources.map((s,i)=>({ url:s.url.trim(), label:s.label?.trim() || null, sort_order:i })).filter(s=>s.url),
      images: imagesForDb,
    };

    const url = editingId ? `/api/admin/posts/${editingId}` : '/api/news/admin';
    const method = editingId ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers:{ 'Content-Type':'application/json' },
        credentials:'same-origin',
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) setResult(`Fehler: ${json.error || 'unbekannt'}`);
      else {
        const statusMsg =
          finalStatus === 'draft'     ? 'als Entwurf gespeichert.' :
          finalStatus === 'scheduled' ? 'geplant (sichtbar ab „gültig ab …“).' :
                                        'veröffentlicht.';
        setResult(`${editingId ? 'Aktualisiert' : 'Gespeichert'} – ${statusMsg} ${json.id ? `ID: ${json.id}` : ''}${json.slug ? `, /news/${json.slug}` : ''}`);
        setDirty(false);
        if (!editingId) resetForm();
      }
    } finally { setSaving(false); }
  }

  /* ───────────────────────────── Render ───────────────────────────── */
  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Admin · News</h1>

      {/* Login/Role gates */}
      {!loading && !sessionOK && (
        <div className={cardClass + ' space-y-3'}>
          <h2 className="text-lg font-semibold">Login</h2>
          <form onSubmit={doLogin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="email" required placeholder="E-Mail" value={userEmail} onChange={(e)=>setUserEmail(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Passwort" value={userPassword} onChange={(e)=>setUserPassword(e.target.value)} className={inputClass} />
            <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Anmelden</button>
          </form>
          {authMsg && <p className="text-sm text-gray-600 dark:text-gray-300">{authMsg}</p>}
        </div>
      )}

      {sessionOK && !isAdmin && (
        <div className={cardClass + ' space-y-2'}>
          <h2 className="text-lg font-semibold">Kein Zugriff</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Du bist angemeldet, aber dein Konto hat keine <strong>Admin-Rolle</strong>.</p>
        </div>
      )}

      {sessionOK && isAdmin && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Linke Spalte */}
            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Titel</label>
                <input value={title} onChange={(e)=>setTitle(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="form-label">URL-ID (nicht anpassen)</label>
                <input value={slug} onChange={(e)=>setSlug(slugify(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="form-label">Veranstalter</label>
                <select value={vendorId ?? ''} onChange={(e)=>setVendorId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
                  <option value="">– optional –</option>
                  {meta.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input id="draft-checkbox" type="checkbox" checked={isDraft} onChange={(e)=>setIsDraft(e.target.checked)} />
                <label htmlFor="draft-checkbox" className="select-none">Als Entwurf speichern</label>
              </div>
              <p className="text-xs text-gray-500 -mt-2">Ohne Entwurf wird der Status aus „gültig ab …“ abgeleitet.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">anpinnen bis …</label>
                  <input type="datetime-local" value={pinnedUntil} onChange={(e)=>setPinnedUntil(e.target.value)} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-1">{pinHint}</p>
                </div>
                <div>
                  <label className="form-label">gültig ab …</label>
                  <input type="datetime-local" value={effectiveFrom} onChange={(e)=>setEffectiveFrom(e.target.value)} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-1">{effectiveHint}</p>
                </div>
              </div>
            </div>

            {/* Rechte Spalte */}
            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Kurzbeschreibung</label>
                <textarea
                  value={summary}
                  onChange={(e)=>setSummary(e.target.value)}
                  className={inputClass + ' min-h-[120px] resize-y'}
                  placeholder="Kurz und knackig…"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="form-label">Inhalt</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={()=>setEditorOpen(true)}
                      className="px-2 py-1.5 rounded-lg border text-sm dark:border-gray-700"
                    >
                      Editor im Vollbild
                    </button>
                  </div>
                </div>

                {/* Resizable Editor-Pane */}
                <div
                  ref={contentPaneRef}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden resize-y min-h-[360px] max-h-[80vh]"
                >
                  <RichTextEditor value={content} onChange={setContent} />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Tipp: Ecke unten rechts ziehen, um die Höhe anzupassen.</p>
              </div>
            </div>
          </div>

          {/* Bilder / Galerie */}
          <div className={cardClass + ' space-y-3'}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Bilder / Galerie</h3>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="file" accept="image/*" multiple
                  onChange={(e)=>{ if (e.target.files) handleFiles(e.target.files); e.currentTarget.value=''; }}
                  disabled={uploadBusy}
                  className="hidden" id="news-image-input"
                />
                <button type="button" onClick={()=>document.getElementById('news-image-input')?.click()}
                        className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                        disabled={uploadBusy}>
                  {uploadBusy ? 'Lade hoch…' : '+ Bilder hochladen'}
                </button>
              </label>
            </div>

            {images.length === 0 && <p className="text-sm text-gray-500">Noch keine Bilder hinzugefügt.</p>}

            {images.length > 0 && (
              <ul className="grid gap-3">
                {images.map((im, i) => (
                  <li key={`${im.url}-${i}`} className="grid grid-cols-[96px_1fr_auto] gap-3 items-start rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <div className="w-24 h-20 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.url || publicUrlFromPath(im.path)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Bildunterschrift (optional)</label>
                      <input
                        value={im.caption ?? ''}
                        onChange={(e)=>setImages(arr => arr.map((x,idx)=> idx===i ? { ...x, caption: e.target.value } : x))}
                        className={inputClass}
                        placeholder="z. B. „Eindrücke vom Event 2025“"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={()=>moveImage(i,-1)} className="px-3 py-1.5 rounded border dark:border-gray-700 disabled:opacity-50" disabled={i===0}>↑</button>
                      <button type="button" onClick={()=>moveImage(i, 1)} className="px-3 py-1.5 rounded border dark:border-gray-700 disabled:opacity-50" disabled={i===images.length-1}>↓</button>
                      <button type="button" onClick={()=>removeImage(i)} className="px-3 py-1.5 rounded border border-red-300 text-red-700 dark:border-red-700/60 dark:text-red-300">Entfernen</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quellen */}
          <div className={cardClass + ' space-y-3'}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Quellen (am Beitragsende)</h3>
              <button type="button" onClick={()=>setSources(arr => [...arr, { url:'', label:'' }])} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">+ Quelle</button>
            </div>
            <div className="space-y-2">
              {sources.map((s, idx)=>(
                <div key={idx} className="grid md:grid-cols-7 gap-2 items-center">
                  <input placeholder="https://…" value={s.url} onChange={(e)=>setSources(arr => arr.map((x,i)=> i===idx ? { ...x, url:e.target.value } : x))} className={inputClass + ' md:col-span-4'} />
                  <input placeholder="Label (optional)" value={s.label} onChange={(e)=>setSources(arr => arr.map((x,i)=> i===idx ? { ...x, label:e.target.value } : x))} className={inputClass + ' md:col-span-2'} />
                  <div className="md:col-span-1 flex justify-end">
                    <button type="button" onClick={()=>setSources(arr => arr.filter((_,i)=>i!==idx))} className="px-3 py-1.5 rounded border dark:border-gray-700">Entfernen</button>
                  </div>
                </div>
              ))}
              {sources.length===0 && <p className="text-sm text-gray-500">Noch keine Quelle hinzugefügt.</p>}
            </div>
          </div>

          {/* Kategorien/Badges */}
          <div className={cardClass}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Kategorien</div>
                <div className="flex flex-wrap gap-2">
                  {meta.categories.map(c=>{
                    const active = categoryIds.includes(c.id);
                    return (
                      <button key={c.id} onClick={()=>setCategoryIds(sel => sel.includes(c.id) ? sel.filter(x=>x!==c.id) : [...sel, c.id])}
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm font-medium border inline-flex items-center gap-2
                          ${active ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                                   : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color ?? '#94a3b8' }} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Badges</div>
                <div className="flex flex-wrap gap-2">
                  {meta.badges.map(b=>{
                    const active = badgeIds.includes(b.id);
                    return (
                      <button key={b.id} onClick={()=>setBadgeIds(sel => sel.includes(b.id) ? sel.filter(x=>x!==b.id) : [...sel, b.id])}
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm font-medium border inline-flex items-center gap-2
                          ${active ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                                   : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color ?? '#94a3b8' }} />
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Action Bar */}
          <div className="sticky bottom-4 z-10">
            <div className="mx-auto max-w-7xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/80 backdrop-blur px-3 py-2 flex items-center gap-3 shadow-sm">
              <button disabled={!canSave || saving} onClick={save} type="button" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{saving ? 'Speichern…' : 'Speichern'}</button>
              <button type="button" className="px-4 py-2 rounded-xl border dark:border-gray-700" onClick={resetForm}>Neu</button>
              {result && <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{result}</div>}
              {dirty && <span className="ml-auto text-xs text-amber-600">Nicht gespeicherte Änderungen</span>}
            </div>
          </div>
        </>
      )}

      {/* Vollbild-Editor Modal */}
      <FullscreenEditorModal
        open={editorOpen}
        value={content}
        onClose={()=>setEditorOpen(false)}
        onChange={setContent}
        onSave={save}
      />
    </div>
  );
}
  