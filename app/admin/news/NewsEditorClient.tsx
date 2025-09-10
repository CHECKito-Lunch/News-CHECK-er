// app/admin/news/NewsEditorClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminTabs from '../shared/AdminTabs';
import { useAdminAuth } from '../shared/auth';
import { inputClass, cardClass } from '../shared/ui';
import { slugify, toLocalInput, fromLocalInput } from '../shared/helpers';
import type { Option, SourceRow, PostRow } from '../shared/types';
import RichTextEditor from '../../components/RichTextEditor';

type ImageRow = {
  url: string;
  caption?: string | null;
  // `path` kommt vom Upload-Endpunkt zurück (praktisch für DELETE).
  path?: string | null;
  sort_order?: number | null;
};

const EMOJI_CHOICES = ['📌','📅','🗓️','📣','📊','📝','🧑‍💻','🤝','☕','🎉','🛠️','🧪'];

export default function NewsEditorClient() {
  const { loading, sessionOK, isAdmin, authMsg, setAuthMsg, userEmail, setUserEmail, userPassword, setUserPassword, doLogin } = useAdminAuth();
  const search = useSearchParams();
  const router = useRouter();
  const editIdFromUrl = search.get('id');

  const [meta, setMeta] = useState<{ categories: Option[]; badges: Option[]; vendors: Option[] }>({ categories: [], badges: [], vendors: [] });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');       const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');   const [content, setContent] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [pinnedUntil, setPinnedUntil] = useState('');   const [effectiveFrom, setEffectiveFrom] = useState('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [badgeIds, setBadgeIds] = useState<number[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([{ url:'', label:'' }]);

  // >>> Bilder / Galerie
  const [images, setImages] = useState<ImageRow[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    fetch('/api/meta', { credentials:'same-origin' })
      .then(r=>r.json())
      .then(setMeta)
      .catch(()=>setMeta({categories:[],badges:[],vendors:[]}));
  }, []);
  useEffect(() => { setSlug(slugify(title)); }, [title]);

  // Falls ?id=… vorhanden: Post laden und ins Formular setzen
  useEffect(() => {
    if (!sessionOK || !isAdmin) return;
    if (!editIdFromUrl) return;
    (async () => {
      const res = await fetch(`/api/admin/posts/${editIdFromUrl}`, { credentials:'same-origin' });
      const json = await res.json().catch(()=>({}));
      const p: PostRow & { images?: ImageRow[] } | undefined = json?.data;
      if (!p) return;
      setEditingId(p.id);
      setTitle(p.title ?? ''); setSlug(p.slug ?? ''); setSummary(p.summary ?? ''); setContent(p.content ?? '');
      // @ts-ignore vendor_id steckt in PostRow
      setVendorId((p as any).vendor_id ?? null);
      setIsDraft(p.status === 'draft');
      setPinnedUntil(toLocalInput(p.pinned_until)); setEffectiveFrom(toLocalInput(p.effective_from));
      // @ts-ignore categories/badges im Admin-Detail
      setCategoryIds((p as any).categories?.map((c:any)=>c.id) ?? []);
      // @ts-ignore
      setBadgeIds((p as any).badges?.map((b:any)=>b.id) ?? []);
      setSources(((p as any).sources ?? []).map((s:any) => ({ url:s.url, label:s.label ?? '' })) || [{ url:'', label:'' }]);
      setImages(Array.isArray((p as any).images) ? (p as any).images.map((im:ImageRow, i:number)=>({
        url: im.url, caption: im.caption ?? '', path: im.path ?? null, sort_order: im.sort_order ?? i
      })) : []);
      setResult('');
    })();
  }, [editIdFromUrl, sessionOK, isAdmin]);

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
    setSources([{ url:'', label:'' }]); setImages([]); setResult('');
    if (editIdFromUrl) router.replace('/admin/news');
  }

  // ---------- Upload Helfer ----------
  async function uploadToApi(fd: FormData) {
    // 1) bevorzugt /api/uploads, 2) Fallback /api/admin/upload
    let res = await fetch('/api/uploads?bucket=uploads', { method:'POST', body: fd, credentials:'same-origin' });
    if (!res.ok) {
      res = await fetch('/api/admin/upload?bucket=uploads', { method:'POST', body: fd, credentials:'same-origin' });
    }
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Upload fehlgeschlagen');
    return res.json() as Promise<{ url:string; path?:string }>;
  }

  async function deleteFromApi(pathOrUrl: string) {
    const qs = new URLSearchParams({ bucket:'uploads', path:pathOrUrl }).toString();
    let res = await fetch(`/api/uploads?${qs}`, { method:'DELETE', credentials:'same-origin' });
    if (!res.ok) {
      res = await fetch(`/api/admin/upload?${qs}`, { method:'DELETE', credentials:'same-origin' });
    }
    // Best-effort: Fehler hier nicht hochwerfen
  }

  async function handleFiles(files: FileList | File[]) {
    if (!files || !files.length) return;
    setUploadBusy(true);
    try {
      const next: ImageRow[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        // Optional: Unterordner news/YYYY/MM
        const now = new Date();
        const folder = `news/${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}`;
        fd.append('folder', folder);
        // -> Upload
        const j = await uploadToApi(fd);
        next.push({ url: j.url, path: j.path ?? null, caption: '', sort_order: (images.length + next.length - 1) });
      }
      setImages(prev => {
        const merged = [...prev, ...next].map((im, i) => ({ ...im, sort_order: i }));
        return merged;
      });
    } finally {
      setUploadBusy(false);
    }
  }

  function moveImage(index: number, dir: -1 | 1) {
    setImages(prev => {
      const arr = [...prev];
      const ni = index + dir;
      if (ni < 0 || ni >= arr.length) return prev;
      const tmp = arr[index];
      arr[index] = arr[ni];
      arr[ni] = tmp;
      return arr.map((im, i) => ({ ...im, sort_order: i }));
    });
  }

  async function removeImage(index: number) {
    setImages(prev => {
      const target = prev[index];
      // Best-effort löschen (nicht blockierend)
      if (target?.path) deleteFromApi(target.path).catch(()=>{});
      const next = prev.filter((_, i) => i !== index).map((im, i) => ({ ...im, sort_order: i }));
      return next;
    });
  }

  // ---------- SAVE ----------
  async function save() {
    if (!sessionOK || !isAdmin) { setResult('Kein Zugriff. Bitte als Admin anmelden.'); return; }
    setSaving(true); setResult('');

    const now = new Date();
    const effIso = effectiveFrom ? fromLocalInput(effectiveFrom) : null;
    const finalStatus: PostRow['status'] = isDraft ? 'draft' : (effIso && new Date(effIso).getTime() > now.getTime()) ? 'scheduled' : 'published';

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
      // >>> Bilder an API übergeben
      images: images.map((im, i) => ({ url: im.url, caption: (im.caption ?? '').trim() || null, sort_order: i })),
    };

    const url = editingId ? `/api/admin/posts/${editingId}` : '/api/news/admin';
    const method = editingId ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, { method, headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(payload) });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) setResult(`Fehler: ${json.error || 'unbekannt'}`);
      else {
        const statusMsg = finalStatus === 'draft' ? 'als Entwurf gespeichert.' : finalStatus === 'scheduled' ? 'geplant (sichtbar ab „gültig ab …“).' : 'veröffentlicht.';
        setResult(`${editingId ? 'Aktualisiert' : 'Gespeichert'} – ${statusMsg} ${json.id ? `ID: ${json.id}` : ''}${json.slug ? `, /news/${json.slug}` : ''}`);
        if (!editingId) resetForm();
      }
    } finally { setSaving(false); }
  }

  // ---------- RENDER ----------
  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Admin · News</h1>
      <AdminTabs />

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

            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Kurzbeschreibung</label>
                <textarea value={summary} onChange={(e)=>setSummary(e.target.value)} className={inputClass + ' min-h-[80px]'} placeholder="Kurz und knackig…" />
              </div>
              <div>
                <label className="form-label">Inhalt</label>
                <RichTextEditor value={content} onChange={setContent} />
              </div>
            </div>
          </div>

          {/* --------- Bilder / Galerie --------- */}
          <div className={cardClass + ' space-y-3'}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Bilder / Galerie</h3>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e)=>{ if (e.target.files) handleFiles(e.target.files); e.currentTarget.value=''; }}
                  disabled={uploadBusy}
                  className="hidden"
                  id="news-image-input"
                />
                <button
                  type="button"
                  onClick={()=>document.getElementById('news-image-input')?.click()}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                  disabled={uploadBusy}
                >
                  {uploadBusy ? 'Lade hoch…' : '+ Bilder hochladen'}
                </button>
              </label>
            </div>

            {images.length === 0 && (
              <p className="text-sm text-gray-500">Noch keine Bilder hinzugefügt.</p>
            )}

            {images.length > 0 && (
              <ul className="grid gap-3">
                {images.map((im, i) => (
                  <li key={`${im.url}-${i}`} className="grid grid-cols-[96px_1fr_auto] gap-3 items-start rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    {/* Preview */}
                    <div className="w-24 h-20 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.url} alt="" className="w-full h-full object-cover" />
                    </div>

                    {/* Caption */}
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Bildunterschrift (optional)</label>
                      <input
                        value={im.caption ?? ''}
                        onChange={(e)=>setImages(arr => arr.map((x,idx)=> idx===i ? { ...x, caption: e.target.value } : x))}
                        className={inputClass}
                        placeholder="z. B. „Eindrücke vom Event 2025“"
                      />
                    </div>

                    {/* Actions */}
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

          {/* --------- Quellen --------- */}
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

          <div className="flex items-center gap-3">
            <button disabled={!canSave || saving} onClick={save} type="button" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{saving ? 'Speichern…' : 'Speichern'}</button>
            <button type="button" className="px-4 py-2 rounded-xl border dark:border-gray-700" onClick={resetForm}>Neu</button>
            {result && <div className="text-sm text-gray-700 dark:text-gray-300">{result}</div>}
          </div>
        </>
      )}
    </div>
  );
}
