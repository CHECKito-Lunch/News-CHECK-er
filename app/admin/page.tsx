'use client';

import { useEffect, useMemo, useState } from 'react';
import TaxonomyEditor from './TaxonomyEditor';
import VendorGroups from './VendorGroups';
import RichTextEditor from '../components/RichTextEditor';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseClient';

// Kalender (JS-Plugins – CSS kommt via CDN aus layout.tsx)
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import iCalendarPlugin from '@fullcalendar/icalendar';
import interactionPlugin from '@fullcalendar/interaction';

// === EINMALIGE Supabase-Instanz
const sb = supabaseBrowser();

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

type Option = { id: number; name: string; color?: string; kind?: string };
type SourceRow = { url: string; label: string };
type Revision = {
  id: number;
  action: 'create' | 'update' | 'delete';
  changed_at: string;
  editor_name: string | null;
  changes: {
    fields?: { key: string; from: unknown; to: unknown }[];
    categories?: { added: number[]; removed: number[] };
    badges?: { added: number[]; removed: number[] };
    sources?: { added: string[]; removed: string[] };
  } | null;
};

type PostRow = {
  id: number;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string | null;
  status: 'draft' | 'scheduled' | 'published';
  pinned_until: string | null;
  effective_from: string | null;
  vendor_id: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  author_name?: string | null;
  categories: { id: number; name: string; color: string | null }[];
  badges: { id: number; name: string; color: string | null; kind: string | null }[];
  sources?: { url: string; label: string | null; sort_order?: number }[];
};

// Admin-Tools
type ToolRow = { id:number; title:string; icon:string|null; href:string; sort:number };
// Admin-Termine (mit Uhrzeit + All-Day + Icon + Color)
type TerminRow = { id:number; title:string; starts_at:string; ends_at:string|null; all_day:boolean; icon:string|null; color:string|null };

// >>> News-Agent: Typen
type AgentConfig = {
  enabled: boolean;
  language: 'de'|'en'|'fr'|'it'|'es';
  countries: string[];
  terms: string[];
  times: string[];
  maxArticles: number;
  autoPublish: boolean;
  defaultVendorId: number|null;
  defaultCategoryId: number|null;
  defaultBadgeIds: number[];
  model?: string;
  temperature?: number;
};
type AgentLog = {
  id: string;
  ranAt: string;
  tookMs: number;
  found: number;
  inserted: number;
  dryRun: boolean;
  note?: string;
};

function Tabs({
  current,
  onChange,
}: {
  current: 'post' | 'vendors' | 'categories' | 'badges' | 'vendor-groups' | 'tools' | 'termine' | 'agent';
  onChange: (v: 'post' | 'vendors' | 'categories' | 'badges' | 'vendor-groups' | 'tools' | 'termine' | 'agent') => void;
}) {
  const tabs = [
    { k: 'post',           label: 'Beitrag anlegen' },
    { k: 'vendors',        label: 'Veranstalter' },
    { k: 'categories',     label: 'Kategorien' },
    { k: 'badges',         label: 'Badges' },
    { k: 'vendor-groups',  label: 'Veranstalter-Gruppen' },
    { k: 'tools',          label: 'Tools' },
    { k: 'termine',        label: 'Termine' },
    { k: 'agent',          label: 'News-Agent' },
  ] as const;

  return (
    <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
      {tabs.map((t) => {
        const active = current === (t.k as any);
        return (
          <button
            key={t.k}
            onClick={() => onChange(t.k as any)}
            className={`px-3 py-2 rounded-t-lg text-sm font-medium
              ${active
                ? 'bg-white text-gray-900 border border-b-0 border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/40'}`}
            type="button"
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const cardClass =
  'card p-4 rounded-2xl shadow-sm bg-white border border-gray-200 ' +
  'dark:bg-gray-900 dark:border-gray-800';

function statusDE(s: PostRow['status']) {
  if (s === 'draft') return 'Entwurf';
  if (s === 'scheduled') return 'Geplant';
  return 'Veröffentlicht';
}

// === Token-Header holen (nur wenn Session existiert)
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Helpers für datetime-local ↔ ISO
function toLocalInput(iso?: string|null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local: string) {
  return new Date(local).toISOString();
}
function contrastText(hex?: string|null) {
  if (!hex) return '#fff';
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const yiq = (r*299 + g*587 + b*114)/1000;
  return yiq >= 128 ? '#111' : '#fff';
}
const EMOJI_CHOICES = ['📌','📅','🗓️','📣','📊','📝','🧑‍💻','🤝','☕','🎉','🛠️','🧪'];

export default function AdminPage() {
  // === Auth-Zustand
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionOK, setSessionOK] = useState(false);
  const [authMsg, setAuthMsg] = useState<string>('');

  // === Stammdaten
  const [meta, setMeta] = useState<{ categories: Option[]; badges: Option[]; vendors: Option[] }>({
    categories: [],
    badges: [],
    vendors: [],
  });

  // Formularzustand (Neu/Update Post)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [isDraft, setIsDraft] = useState<boolean>(false);
  const [pinnedUntil, setPinnedUntil] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [badgeIds, setBadgeIds] = useState<number[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([{ url: '', label: '' }]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string>('');
  const [tab, setTab] = useState<'post' | 'vendors' | 'categories' | 'badges' | 'vendor-groups' | 'tools' | 'termine' | 'agent'>('post');

  // Beiträge Liste
  const [postRows, setPostRows] = useState<PostRow[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [postsQ, setPostsQ] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const pageSize = 20;

  // Historie-Popover
  const [historyOpenFor, setHistoryOpenFor] = useState<number | null>(null);
  const [historyItems, setHistoryItems] = useState<Revision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // === Tools State
  const [toolsRows, setToolsRows] = useState<ToolRow[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolEditId, setToolEditId] = useState<number|null>(null);
  const [toolTitle, setToolTitle] = useState('');
  const [toolIcon, setToolIcon] = useState('');
  const [toolHref, setToolHref] = useState('');
  const [toolSort, setToolSort] = useState<number>(0);

  // === Termine State (erweitert)
  const [termRows, setTermRows] = useState<TerminRow[]>([]);
  const [termLoading, setTermLoading] = useState(false);
  const [termEditId, setTermEditId] = useState<number|null>(null);
  const [termTitle, setTermTitle] = useState('');
  const [termStartLocal, setTermStartLocal] = useState<string>(''); // YYYY-MM-DDTHH:mm (oder YYYY-MM-DD für all-day)
  const [termEndLocal, setTermEndLocal] = useState<string>('');     // optional
  const [termAllDay, setTermAllDay] = useState<boolean>(false);
  const [termIcon, setTermIcon] = useState<string>('📌');
  const [termColor, setTermColor] = useState<string>('#2563eb');

  // >>> News-Agent: State
  const [agent, setAgent] = useState<AgentConfig>({
    enabled: true,
    language: 'de',
    countries: ['DE','AT','CH','EU'],
    terms: ['Streik Flughafen', 'Lufthansa Streik', 'GDL Bahn', 'Reisewarnung', 'Sicherheitskontrolle Ausfall'],
    times: ['08:00','12:00','17:00'],
    maxArticles: 30,
    autoPublish: false,
    defaultVendorId: null,
    defaultCategoryId: null,
    defaultBadgeIds: [],
    model: undefined,
    temperature: 0.2,
  });
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMsg, setAgentMsg] = useState<string>('');
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [agentLogsLoading, setAgentLogsLoading] = useState(false);

  // === Session prüfen
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await sb.auth.getUser();
        if (!isMounted) return;
        setSessionOK(!!data?.user && !error);
      } catch {
        setSessionOK(false);
      } finally {
        setAuthLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // === Metadaten (keine Auth nötig)
  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({ categories: [], badges: [], vendors: [] }));
  }, []);

  useEffect(() => { setSlug(slugify(title)); }, [title]);

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  // === Auth-UI-Aktionen
  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthMsg('');
    try {
      const { error } = await sb.auth.signInWithPassword({ email: userEmail.trim(), password: userPassword });
      if (error) { setAuthMsg(error.message); setSessionOK(false); return; }
      setSessionOK(true);
      setAuthMsg('Erfolgreich angemeldet.');
      await loadPosts(1, postsQ);
      if (tab === 'agent') await agentLoad();
    } catch (err: any) {
      setAuthMsg(err?.message ?? 'Login fehlgeschlagen.'); setSessionOK(false);
    }
  }
  async function doLogout() {
    await sb.auth.signOut();
    setSessionOK(false);
    setPostRows([]); setPostsTotal(0); setResult('');
  }

  function resetForm() {
    setEditingId(null); setTitle(''); setSlug(''); setSummary(''); setContent(''); setVendorId(null);
    setIsDraft(false); setPinnedUntil(''); setEffectiveFrom(''); setCategoryIds([]); setBadgeIds([]);
    setSources([{ url:'', label:'' }]); setResult('');
  }

  async function save() {
    if (!sessionOK) { setResult('Bitte zuerst anmelden.'); return; }
    setSaving(true); setResult('');

    const now = new Date();
    const eff = effectiveFrom ? new Date(effectiveFrom) : null;

    const finalStatus: PostRow['status'] = isDraft
      ? 'draft'
      : eff && eff.getTime() > now.getTime()
      ? 'scheduled'
      : 'published';

    const payload = {
      post: {
        title, summary, content, slug,
        vendor_id: vendorId ?? null,
        status: finalStatus,
        pinned_until: pinnedUntil ? new Date(pinnedUntil).toISOString() : null,
        effective_from: eff ? eff.toISOString() : null,
      },
      categoryIds, badgeIds,
      sources: sources.map((s, i) => ({ url: s.url.trim(), label: s.label?.trim() || null, sort_order: i })).filter(s=>s.url),
    };

    const url = editingId ? `/api/admin/posts/${editingId}` : '/api/news/admin';
    const method = editingId ? 'PATCH' : 'POST';

    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(`Fehler: ${json.error || 'unbekannt'}`);
      } else {
        const statusMsg =
          finalStatus === 'draft' ? 'als Entwurf gespeichert.' :
          finalStatus === 'scheduled' ? 'geplant (sichtbar ab „gültig ab …“).' :
          'veröffentlicht.';
        setResult(`${editingId ? 'Aktualisiert' : 'Gespeichert'} – ${statusMsg} ${json.id ? `ID: ${json.id}` : ''}${json.slug ? `, /news/${json.slug}` : ''}`);
        await loadPosts();
        if (!editingId) resetForm();
      }
    } finally { setSaving(false); }
  }

  async function loadPosts(p = postsPage, q = postsQ) {
    if (!sessionOK) return;
    setLoadingPosts(true);
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('pageSize', String(pageSize));
    if (q) params.set('q', q);
    try {
      const res = await fetch(`/api/admin/posts?${params.toString()}`, { headers: await authHeaders() });
      const json = await res.json().catch(() => ({}));
      setPostRows(json.data ?? []); setPostsTotal(json.total ?? 0); setPostsPage(p);
    } finally { setLoadingPosts(false); }
  }

  useEffect(() => {
    if (!sessionOK) return;
    if (tab === 'post')    loadPosts(1, postsQ);
    if (tab === 'tools')   toolsLoad();
    if (tab === 'termine') termsLoad();
    if (tab === 'agent')   agentLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sessionOK]);

  async function startEdit(id: number) {
    if (!sessionOK) { alert('Bitte zuerst anmelden.'); return; }
    const res = await fetch(`/api/admin/posts/${id}`, { headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    const p: PostRow | undefined = json?.data;
    if (!p) { alert('Beitrag konnte nicht geladen werden.'); return; }

    setEditingId(p.id);
    setTitle(p.title ?? ''); setSlug(p.slug ?? ''); setSummary(p.summary ?? ''); setContent(p.content ?? '');
    setVendorId(p.vendor_id); setIsDraft(p.status === 'draft');
    setPinnedUntil(p.pinned_until ? p.pinned_until.slice(0, 16) : '');
    setEffectiveFrom(p.effective_from ? p.effective_from.slice(0, 16) : '');
    setCategoryIds(p.categories?.map((c) => c.id) ?? []);
    setBadgeIds(p.badges?.map((b) => b.id) ?? []);
    setSources((p.sources ?? []).map((s) => ({ url: s.url, label: s.label ?? '' })) || [{ url: '', label: '' }]);
    setResult('');
  }

  async function deletePost(id: number) {
    if (!sessionOK) { alert('Bitte zuerst anmelden.'); return; }
    if (!confirm('Wirklich löschen?')) return;
    const res = await fetch(`/api/admin/posts/${id}`, { method: 'DELETE', headers: await authHeaders() });
    if (res.ok) { await loadPosts(); if (editingId === id) resetForm(); }
    else {
      const j = await res.json().catch(() => ({}));
      alert(`Löschen fehlgeschlagen: ${j.error ?? 'unbekannt'}`);
    }
  }

  async function openHistory(id: number) {
    setHistoryOpenFor(id); setHistoryLoading(true); setHistoryError('');
    try {
      const res = await fetch(`/api/admin/posts/${id}/history`, { headers: await authHeaders() });
      const j = await res.json();
      setHistoryItems(j.data ?? []);
    } catch {
      setHistoryError('Konnte Historie nicht laden.');
    } finally { setHistoryLoading(false); }
  }

  const effectiveHint = useMemo(() => {
    if (isDraft) return 'Entwurf – nicht sichtbar für Nutzer.';
    if (!effectiveFrom) return 'Ohne Datum sofort sichtbar (als „Veröffentlicht“).';
    const eff = new Date(effectiveFrom);
    return eff.getTime() > Date.now()
      ? `Sichtbar ab ${eff.toLocaleString()} (als „Geplant“).`
      : `Bereits gültig (als „Veröffentlicht“).`;
  }, [effectiveFrom, isDraft]);

  const pinHint = useMemo(() => {
    if (!pinnedUntil) return 'Optional: ohne Datum wird nicht angepinnt.';
    const pin = new Date(pinnedUntil);
    return pin.getTime() > Date.now()
      ? `Angepinnt bis ${pin.toLocaleString()} (bleibt in der Liste oben).`
      : `Datum liegt in der Vergangenheit – der Beitrag wird nicht mehr angepinnt.`;
  }, [pinnedUntil]);

  const scheduledFor = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.getTime() > Date.now() ? d.toLocaleString() : '—';
  };

  // ===== Tools CRUD =====
  async function toolsLoad() {
    setToolsLoading(true);
    const r = await fetch('/api/admin/tools');
    const j = await r.json().catch(()=>({}));
    setToolsRows(j.data ?? []);
    setToolsLoading(false);
  }
  function toolsReset() {
    setToolEditId(null); setToolTitle(''); setToolIcon(''); setToolHref(''); setToolSort(0);
  }
  async function toolsSave() {
    const body = { title: toolTitle.trim(), icon: toolIcon || null, href: toolHref.trim(), sort: toolSort };
    if (!body.title || !body.href) { alert('Titel und Link sind Pflicht.'); return; }
    const url = toolEditId ? `/api/admin/tools/${toolEditId}` : '/api/admin/tools';
    const method = toolEditId ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const j = await r.json().catch(()=>({})); alert(j.error || 'Fehler beim Speichern'); return; }
    await toolsLoad(); if (!toolEditId) toolsReset();
  }
  function toolsStartEdit(t: ToolRow) {
    setToolEditId(t.id); setToolTitle(t.title); setToolIcon(t.icon ?? ''); setToolHref(t.href); setToolSort(t.sort ?? 0);
    window.scrollTo({ top: 0, behavior:'smooth' });
  }
  async function toolsDelete(id:number) {
    if (!confirm('Tool wirklich löschen?')) return;
    const r = await fetch(`/api/admin/tools/${id}`, { method:'DELETE' });
    if (!r.ok) { const j = await r.json().catch(()=>({})); alert(j.error || 'Löschen fehlgeschlagen'); return; }
    await toolsLoad(); if (toolEditId===id) toolsReset();
  }
  async function toolsMove(id:number, dir:-1|1) {
    const idx = toolsRows.findIndex(r => r.id===id);
    const swap = toolsRows[idx+dir]; if (!swap) return;
    const a = toolsRows[idx], b = swap;
    await fetch(`/api/admin/tools/${a.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sort: b.sort }) });
    await fetch(`/api/admin/tools/${b.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sort: a.sort }) });
    await toolsLoad();
  }

  // ===== Termine CRUD (mit Uhrzeit, Ganztägig, Icon, Farbe) =====
  async function termsLoad() {
    setTermLoading(true);
    const r = await fetch('/api/admin/termine');
    const j = await r.json().catch(()=>({}));
    setTermRows((j.data ?? []) as TerminRow[]);
    setTermLoading(false);
  }
  function termsReset() {
    setTermEditId(null);
    setTermTitle('');
    setTermStartLocal('');
    setTermEndLocal('');
    setTermAllDay(false);
    setTermIcon('📌');
    setTermColor('#2563eb');
  }
  async function termsSave() {
    const payload: any = {
      title: termTitle.trim(),
      all_day: termAllDay,
      icon: termIcon || null,
      color: termColor || null,
    };
    if (!payload.title) { alert('Titel ist Pflicht.'); return; }

    if (termAllDay) {
      if (!termStartLocal) { alert('Bitte Start-Datum wählen.'); return; }
      const d = termStartLocal.slice(0,10);
      payload.starts_at = fromLocalInput(`${d}T00:00`);
      payload.ends_at = null;
    } else {
      const starts = termStartLocal ? fromLocalInput(termStartLocal) : '';
      const ends = termEndLocal ? fromLocalInput(termEndLocal) : null;
      if (!starts) { alert('Start (Datum+Uhrzeit) ist Pflicht.'); return; }
      if (ends && new Date(ends).getTime() < new Date(starts).getTime()) {
        alert('Ende darf nicht vor Start liegen.'); return;
      }
      payload.starts_at = starts;
      payload.ends_at = ends;
    }

    const url = termEditId ? `/api/admin/termine/${termEditId}` : '/api/admin/termine';
    const method = termEditId ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { const j = await r.json().catch(()=>({})); alert(j.error || 'Fehler beim Speichern'); return; }
    await termsLoad(); if (!termEditId) termsReset();
  }
  function termsStartEdit(t: TerminRow) {
    setTermEditId(t.id);
    setTermTitle(t.title);
    setTermAllDay(!!t.all_day);
    setTermIcon(t.icon ?? '📌');
    setTermColor(t.color ?? '#2563eb');
    setTermStartLocal(toLocalInput(t.starts_at));
    setTermEndLocal(toLocalInput(t.ends_at));
    window.scrollTo({ top: 0, behavior:'smooth' });
  }
  async function termsDelete(id:number) {
    if (!confirm('Termin wirklich löschen?')) return;
    const r = await fetch(`/api/admin/termine/${id}`, { method:'DELETE' });
    if (!r.ok) { const j = await r.json().catch(()=>({})); alert(j.error || 'Löschen fehlgeschlagen'); return; }
    await termsLoad(); if (termEditId===id) termsReset();
  }

  const calendarEvents = [
    ...termRows.map(t => {
      const color = t.color ?? '#2563eb';
      const textColor = contrastText(color);
      const prefix = (t.icon || '📌') + ' ';
      return {
        id: String(t.id),
        title: prefix + t.title,
        start: t.starts_at,
        end: t.ends_at || undefined,
        allDay: !!t.all_day,
        color,
        textColor,
        extendedProps: { own: true, tid: t.id },
      };
    }),
    { url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical', format:'ics' },
    { url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics', format:'ics' },
  ];

  // >>> News-Agent: Loader/Saver/Actions
  async function agentLoad() {
    setAgentLoading(true); setAgentMsg('');
    try {
      const r = await fetch('/api/admin/news-agent', { headers: await authHeaders() });
      const j = await r.json().catch(()=>({}));
      if (j?.data) setAgent((prev)=>({ ...prev, ...j.data }));
    } catch {
      setAgentMsg('Konnte Konfiguration nicht laden.');
    } finally { setAgentLoading(false); }
  }
  async function agentSave() {
    setAgentLoading(true); setAgentMsg('');
    const body: AgentConfig = {
      ...agent,
      terms: agent.terms.map(t => t.trim()).filter(Boolean),
      times: agent.times.map(t => t.trim()).filter(Boolean),
    };
    try {
      const r = await fetch('/api/admin/news-agent', {
        method:'PUT',
        headers: { 'Content-Type':'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || 'Fehler beim Speichern');
      setAgentMsg('Gespeichert.');
    } catch (e:any) {
      setAgentMsg(e?.message || 'Speichern fehlgeschlagen.');
    } finally { setAgentLoading(false); }
  }
  async function agentRunDry() {
    setAgentLoading(true); setAgentMsg('');
    try {
      const r = await fetch('/api/admin/news-agent/run?dry=1', { method:'POST', headers: await authHeaders() });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || 'Fehler beim Testlauf');
      setAgentMsg(`Testlauf ok – gefunden: ${j.found ?? '—'}, Vorschläge: ${j.proposed ?? '—'}`);
      await agentLoadLogs();
    } catch (e:any) {
      setAgentMsg(e?.message || 'Testlauf fehlgeschlagen.');
    } finally { setAgentLoading(false); }
  }
  async function agentLoadLogs() {
    setAgentLogsLoading(true);
    try {
      const r = await fetch('/api/admin/news-agent/logs', { headers: await authHeaders() });
      const j = await r.json().catch(()=>({}));
      setAgentLogs(Array.isArray(j?.data) ? j.data : []);
    } finally { setAgentLogsLoading(false); }
  }

  return (
    <div className="container max-w-5xl mx-auto py-6 space-y-5">
      {/* Seitentitel + Auth Controls */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin</h1>
        <div className="flex items-center gap-2">
          {sessionOK ? (
            <button onClick={doLogout} className="px-3 py-2 rounded-lg border text-sm dark:border-gray-700" type="button">
              Abmelden
            </button>
          ) : (
            <span className="text-sm text-red-600">Nicht angemeldet</span>
          )}
          <Link
            href="/"
            className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
          >
            ← Zur Startseite
          </Link>
        </div>
      </div>

      <Tabs current={tab} onChange={setTab} />

      {/* Login Panel (nur wenn nicht angemeldet) */}
      {!authLoading && !sessionOK && (
        <div className={cardClass + ' space-y-3'}>
          <h2 className="text-lg font-semibold">Login</h2>
          <form onSubmit={doLogin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="email" required placeholder="E-Mail" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Passwort" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} className={inputClass} />
            <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Anmelden</button>
          </form>
          {authMsg && <p className="text-sm text-gray-600 dark:text-gray-300">{authMsg}</p>}
        </div>
      )}

      {/* ========== POSTS ========== */}
      {sessionOK && tab === 'post' && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Linke Karte */}
            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Titel</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="form-label">URL-ID (nicht anpassen)</label>
                <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="form-label">Veranstalter</label>
                <select
                  value={vendorId ?? ''}
                  onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">– optional –</option>
                  {meta.vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Entwurfs-Checkbox */}
              <div className="flex items-center gap-2">
                <input id="draft-checkbox" type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />
                <label htmlFor="draft-checkbox" className="select-none">Als Entwurf speichern</label>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                Wenn nicht als Entwurf markiert, wird der Status automatisch aus „gültig ab …“ abgeleitet
                (vor Zukunftsdatum: „Geplant“, sonst „Veröffentlicht“).
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">anpinnen bis …</label>
                  <input type="datetime-local" value={pinnedUntil} onChange={(e) => setPinnedUntil(e.target.value)} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-1">{pinHint}</p>
                </div>
                <div>
                  <label className="form-label">gültig ab …</label>
                  <input type="datetime-local" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputClass} />
                  <p className="text-xs text-gray-500 mt-1">{effectiveHint}</p>
                </div>
              </div>
            </div>

            {/* Rechte Karte */}
            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Kurzbeschreibung</label>
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className={inputClass + ' min-h-[80px]'} placeholder="Kurz und knackig…" />
              </div>
              <div>
                <label className="form-label">Inhalt</label>
                <RichTextEditor value={content} onChange={setContent} />
              </div>
            </div>
          </div>

          {/* Quellen */}
          <div className={cardClass + ' space-y-3'}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Quellen (am Beitragsende)</h3>
              <button type="button" onClick={() => setSources((arr) => [...arr, { url: '', label: '' }])} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">
                + Quelle
              </button>
            </div>
            <div className="space-y-2">
              {sources.map((s, idx) => (
                <div key={idx} className="grid md:grid-cols-7 gap-2 items-center">
                  <input placeholder="https://…" value={s.url} onChange={(e) => setSources((arr) => arr.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))} className={inputClass + ' md:col-span-4'} />
                  <input placeholder="Label (optional)" value={s.label} onChange={(e) => setSources((arr) => arr.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} className={inputClass + ' md:col-span-2'} />
                  <div className="md:col-span-1 flex justify-end">
                    <button type="button" onClick={() => setSources((arr) => arr.filter((_, i) => i !== idx))} className="px-3 py-1.5 rounded border dark:border-gray-700" aria-label="Quelle entfernen">Entfernen</button>
                  </div>
                </div>
              ))}
              {sources.length === 0 && <p className="text-sm text-gray-500">Noch keine Quelle hinzugefügt.</p>}
            </div>
          </div>

          {/* Kategorien & Badges */}
          <div className={cardClass}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Kategorien</div>
                <div className="flex flex-wrap gap-2">
                  {meta.categories.map((c) => {
                    const active = categoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCategoryIds((sel) => (sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]))}
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm font-medium border transition inline-flex items-center gap-2
                          ${active
                            ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color ?? '#94a3b8' }} aria-hidden />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Badges</div>
                <div className="flex flex-wrap gap-2">
                  {meta.badges.map((b) => {
                    const active = badgeIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => setBadgeIds((sel) => (sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id]))}
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm font-medium border transition inline-flex items-center gap-2
                          ${active
                            ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color ?? '#94a3b8' }} aria-hidden />
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Save-Bar */}
          <div className="flex items-center gap-3">
            <button disabled={!canSave || saving} onClick={save} type="button" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button type="button" className="px-4 py-2 rounded-xl border dark:border-gray-700" onClick={resetForm}>Neu</button>
            {result && <div className="text-sm text-gray-700 dark:text-gray-300">{result}</div>}
          </div>
        </>
      )}

      {/* ========== VENDORS / CATEGORIES / BADGES / GROUPS ========== */}
      {sessionOK && tab === 'vendors' && (
        <div className={cardClass}>
          <TaxonomyEditor title="Veranstalter" endpoint="/api/admin/vendors" columns={['name']} allowGroups />
        </div>
      )}
      {sessionOK && tab === 'categories' && (
        <div className={cardClass}>
          <TaxonomyEditor title="Kategorien" endpoint="/api/admin/categories" columns={['name', 'color']} />
        </div>
      )}
      {sessionOK && tab === 'badges' && (
        <div className={cardClass}>
          <TaxonomyEditor title="Badges" endpoint="/api/admin/badges" columns={['name', 'color', 'kind']} />
        </div>
      )}
      {sessionOK && tab === 'vendor-groups' && (
        <div className={cardClass}>
          <VendorGroups />
        </div>
      )}

      {/* ========== TOOLS ========== */}
      {sessionOK && tab === 'tools' && (
        <>
          <div className={cardClass + ' space-y-3'}>
            <h2 className="text-lg font-semibold">{toolEditId ? `Tool bearbeiten (ID ${toolEditId})` : 'Neues Tool anlegen'}</h2>
            <div className="grid md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="form-label">Titel</label>
                <input className={inputClass} value={toolTitle} onChange={e=>setToolTitle(e.target.value)} placeholder="z. B. Dashboard" />
              </div>
              <div>
                <label className="form-label">Icon (Emoji/Code)</label>
                <input className={inputClass} value={toolIcon} onChange={e=>setToolIcon(e.target.value)} placeholder="z. B. 📊" />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Link</label>
                <input className={inputClass} value={toolHref} onChange={e=>setToolHref(e.target.value)} placeholder="/tools/dashboard oder https://…" />
              </div>
              <div>
                <label className="form-label">Sort</label>
                <input className={inputClass} type="number" value={toolSort} onChange={e=>setToolSort(Number(e.target.value))} />
              </div>
              <div className="flex gap-2">
                <button onClick={toolsSave} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white" type="button">Speichern</button>
                <button onClick={toolsReset} className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700" type="button">Neu</button>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            {toolsLoading ? (
              <div className="text-sm text-gray-500">lädt…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                    <tr>
                      <th className="px-3 py-2">Titel</th>
                      <th className="px-3 py-2">Icon</th>
                      <th className="px-3 py-2">Link</th>
                      <th className="px-3 py-2">Sort</th>
                      <th className="px-3 py-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toolsRows.map((t) => (
                      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 font-medium">{t.title}</td>
                        <td className="px-3 py-2">{t.icon ?? '—'}</td>
                        <td className="px-3 py-2 truncate max-w-[40ch]">{t.href}</td>
                        <td className="px-3 py-2">{t.sort}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <button className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700" onClick={()=>toolsMove(t.id,-1)} title="hoch">↑</button>
                            <button className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700" onClick={()=>toolsMove(t.id,+1)} title="runter">↓</button>
                            <button className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700" onClick={()=>toolsStartEdit(t)}>Bearbeiten</button>
                            <button className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white" onClick={()=>toolsDelete(t.id)}>Löschen</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {toolsRows.length===0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Keine Tools.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========== TERMINE ========== */}
      {sessionOK && tab === 'termine' && (
        <>
          <div className={cardClass + ' space-y-3'}>
            <h2 className="text-lg font-semibold">{termEditId ? `Termin bearbeiten (ID ${termEditId})` : 'Neuen Termin anlegen'}</h2>

            {/* Zeile 1: Titel, Ganztägig, Icon, Farbe */}
            <div className="grid md:grid-cols-8 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="form-label">Titel</label>
                <input className={inputClass} value={termTitle} onChange={e=>setTermTitle(e.target.value)} placeholder="z. B. Q3 Review" />
              </div>

              <div className="md:col-span-2">
                <label className="form-label">Ganztägig</label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={termAllDay}
                    onChange={(e)=>{
                      const on = e.target.checked;
                      setTermAllDay(on);
                      if (on) {
                        // auf Datum normalisieren & Ende leeren
                        setTermStartLocal(prev => prev ? `${prev.slice(0,10)}T00:00` : '');
                        setTermEndLocal('');
                      }
                    }}
                  />
                  <span>{termAllDay ? 'Ja' : 'Nein'}</span>
                </label>
              </div>

              <div>
                <label className="form-label">Icon</label>
                <input className={inputClass} value={termIcon} onChange={e=>setTermIcon(e.target.value)} placeholder="z. B. 📌" />
              </div>

              <div>
                <label className="form-label">Farbe</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={termColor} onChange={e=>setTermColor(e.target.value)} className="h-10 w-12 rounded border" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{termColor}</span>
                </div>
              </div>
            </div>

            {/* Mini Emoji-Picker unter Icon */}
            <div className="flex flex-wrap gap-1">
              {EMOJI_CHOICES.map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={()=>setTermIcon(em)}
                  className="px-2 py-1 rounded border text-lg"
                  title={em}
                >
                  {em}
                </button>
              ))}
            </div>

            {/* Zeile 2: Start / Ende (Ende ausgeblendet bei All-Day) */}
            <div className="grid md:grid-cols-8 gap-3 items-end">
              <div className={termAllDay ? 'md:col-span-4' : 'md:col-span-4'}>
                <label className="form-label">{termAllDay ? 'Datum' : 'Start'}</label>
                <input
                  className={inputClass}
                  type={termAllDay ? 'date' : 'datetime-local'}
                  value={termAllDay ? (termStartLocal ? termStartLocal.slice(0,10) : '') : termStartLocal}
                  onChange={e=>{
                    if (termAllDay) {
                      const v = e.target.value; // YYYY-MM-DD
                      setTermStartLocal(v ? `${v}T00:00` : '');
                    } else {
                      setTermStartLocal(e.target.value);
                    }
                  }}
                />
              </div>

              {!termAllDay && (
                <div className="md:col-span-4">
                  <label className="form-label">Ende (optional)</label>
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={termEndLocal}
                    onChange={e=>setTermEndLocal(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Aktionen */}
            <div className="flex gap-2">
              <button onClick={termsSave} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white" type="button">Speichern</button>
              <button onClick={termsReset} className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700" type="button">Neu</button>
            </div>
          </div>

          <div className={cardClass + ' space-y-4'}>
            <h3 className="text-lg font-semibold">Kalender-Vorschau</h3>
            <FullCalendar
              plugins={[dayGridPlugin, listPlugin, iCalendarPlugin, interactionPlugin]}
              initialView="listMonth"
              headerToolbar={{ start:'prev,next today', center:'title', end:'listMonth,dayGridMonth' }}
              locale="de"
              height={520}
              events={calendarEvents}
              dateClick={(arg) => {
                if (termAllDay) {
                  const d = arg.dateStr.slice(0,10);
                  setTermStartLocal(`${d}T00:00`);
                  setTermEndLocal('');
                } else {
                  const base = arg.dateStr.length === 10 ? `${arg.dateStr}T09:00` : arg.dateStr.slice(0,16);
                  setTermStartLocal(base);
                  setTermEndLocal('');
                }
              }}
              eventClick={(info) => {
                if (info.event.extendedProps && (info.event.extendedProps as any).own) {
                  const idNum = Number(info.event.id);
                  const t = termRows.find(x => x.id === idNum);
                  if (t) termsStartEdit(t);
                }
              }}
            />
          </div>

          <div className={cardClass}>
            {termLoading ? (
              <div className="text-sm text-gray-500">lädt…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                    <tr>
                      <th className="px-3 py-2">Titel</th>
                      <th className="px-3 py-2">Start</th>
                      <th className="px-3 py-2">Ende</th>
                      <th className="px-3 py-2">Ganztägig</th>
                      <th className="px-3 py-2">Icon</th>
                      <th className="px-3 py-2">Farbe</th>
                      <th className="px-3 py-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termRows.map(t => (
                      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 font-medium">{t.title}</td>
                        <td className="px-3 py-2">{new Date(t.starts_at).toLocaleString('de-DE')}</td>
                        <td className="px-3 py-2">{t.ends_at ? new Date(t.ends_at).toLocaleString('de-DE') : '—'}</td>
                        <td className="px-3 py-2">{t.all_day ? 'Ja' : 'Nein'}</td>
                        <td className="px-3 py-2">{t.icon ?? '—'}</td>
                        <td className="px-3 py-2">
                          {t.color ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                              <span className="text-xs text-gray-600 dark:text-gray-300">{t.color}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <button className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700" onClick={()=>termsStartEdit(t)}>Bearbeiten</button>
                            <button className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white" onClick={()=>termsDelete(t.id)}>Löschen</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {termRows.length===0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Keine Termine.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========== NEWS-AGENT ========== */}
      {sessionOK && tab === 'agent' && (
        <>
          <div className={cardClass + ' space-y-4'}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">News-Agent (Reise & Tourismus)</h2>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={agent.enabled}
                    onChange={(e)=>setAgent(a=>({ ...a, enabled: e.target.checked }))}
                  />
                  Aktiv
                </label>
                <button
                  type="button"
                  onClick={agentRunDry}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Jetzt ausführen (Dry-Run)
                </button>
                <button
                  type="button"
                  onClick={agentSave}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Speichern
                </button>
              </div>
            </div>

            {agentMsg && (
              <div className="text-sm text-gray-700 dark:text-gray-300">{agentMsg}</div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="form-label">Schlagwörter / Suchabfragen</label>
                  <textarea
                    className={inputClass + ' min-h-[180px]'}
                    value={agent.terms.join('\n')}
                    onChange={(e)=>setAgent(a=>({ ...a, terms: e.target.value.split('\n') }))}
                    placeholder={`z. B.:\nStreik Flughafen\nLufthansa Streik\nDeutsche Bahn Ausfall\nSicherheitskontrolle Frankfurt\nReisewarnung Auswärtiges Amt`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Eine Zeile pro Suchbegriff. Du kannst boolsche Operatoren der News-API benutzen (AND/OR/“-”).
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: Math.max(3, agent.times.length || 0) }).map((_, i) => (
                    <div key={i}>
                      <label className="form-label">Zeit {i+1}</label>
                      <input
                        type="time"
                        className={inputClass}
                        value={agent.times[i] ?? ''}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setAgent(a=>{
                            const arr = [...a.times];
                            arr[i] = v;
                            return { ...a, times: arr.filter(Boolean) };
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="form-label">Sprache</label>
                    <select
                      className={inputClass}
                      value={agent.language}
                      onChange={(e)=>setAgent(a=>({ ...a, language: e.target.value as AgentConfig['language'] }))}
                    >
                      <option value="de">Deutsch</option>
                      <option value="en">Englisch</option>
                      <option value="fr">Französisch</option>
                      <option value="it">Italienisch</option>
                      <option value="es">Spanisch</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Max. Artikel pro Lauf</label>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      className={inputClass}
                      value={agent.maxArticles}
                      onChange={(e)=>setAgent(a=>({ ...a, maxArticles: Math.max(1, Number(e.target.value||10)) }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Länder (ISO-2, komma-separiert)</label>
                  <input
                    className={inputClass}
                    value={agent.countries.join(',')}
                    onChange={(e)=>setAgent(a=>({ ...a, countries: e.target.value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean) }))}
                    placeholder="DE,AT,CH,EU"
                  />
                  <p className="text-xs text-gray-500 mt-1">„EU“ steht für EU-weite Quellen (intern behandelt).</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="form-label">Modell (optional)</label>
                    <input
                      className={inputClass}
                      placeholder="z. B. gpt-4o-mini"
                      value={agent.model || ''}
                      onChange={(e)=>setAgent(a=>({ ...a, model: e.target.value.trim() || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Temperature (0–1)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      className={inputClass}
                      value={agent.temperature ?? 0.2}
                      onChange={(e)=>setAgent(a=>({ ...a, temperature: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Auto-Publish</div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={agent.autoPublish}
                        onChange={(e)=>setAgent(a=>({ ...a, autoPublish: e.target.checked }))}
                      />
                      aktiv
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Wenn deaktiviert, legt der Agent Beiträge als <em>Entwurf</em> an.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="form-label">Standard-Kategorie</label>
                      <select
                        className={inputClass}
                        value={agent.defaultCategoryId ?? ''}
                        onChange={(e)=>setAgent(a=>({ ...a, defaultCategoryId: e.target.value ? Number(e.target.value) : null }))}
                      >
                        <option value="">—</option>
                        {meta.categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Standard-Veranstalter</label>
                      <select
                        className={inputClass}
                        value={agent.defaultVendorId ?? ''}
                        onChange={(e)=>setAgent(a=>({ ...a, defaultVendorId: e.target.value ? Number(e.target.value) : null }))}
                      >
                        <option value="">—</option>
                        {meta.vendors.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Standard-Badges</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {meta.badges.map(b => {
                        const active = agent.defaultBadgeIds.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={()=>setAgent(a=>{
                              const on = a.defaultBadgeIds.includes(b.id);
                              return { ...a, defaultBadgeIds: on ? a.defaultBadgeIds.filter(x=>x!==b.id) : [...a.defaultBadgeIds, b.id] };
                            })}
                            className={`px-3 py-1 rounded-full text-sm font-medium border transition inline-flex items-center gap-2
                              ${active
                                ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color ?? '#94a3b8' }} aria-hidden />
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Letzte Läufe</div>
                    <button
                      className="px-3 py-1.5 rounded border text-sm dark:border-gray-700"
                      onClick={agentLoadLogs}
                      type="button"
                    >
                      Aktualisieren
                    </button>
                  </div>
                  {agentLogsLoading ? (
                    <div className="text-sm text-gray-500 mt-2">lädt…</div>
                  ) : agentLogs.length === 0 ? (
                    <div className="text-sm text-gray-500 mt-2">Noch keine Einträge.</div>
                  ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-800 mt-2">
                      {agentLogs.map(l => (
                        <li key={l.id} className="py-2 text-sm flex items-center justify-between">
                          <div>
                            <div className="font-medium">{new Date(l.ranAt).toLocaleString()}</div>
                            <div className="text-gray-500">
                              gefunden: {l.found} · eingefügt: {l.inserted} · {l.dryRun ? 'Dry-Run' : 'Live'}{l.note ? ` · ${l.note}` : ''}
                            </div>
                          </div>
                          <div className="text-gray-500">{Math.round(l.tookMs)} ms</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={agentSave}
                disabled={agentLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {agentLoading ? 'Speichert…' : 'Speichern'}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Der Server-Cron liest diese Konfiguration und triggert den Agenten zu den Zeiten.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
