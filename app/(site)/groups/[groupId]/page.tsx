// app/groups/[groupId]/page.tsx
'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'isomorphic-dompurify';
import { useParams } from 'next/navigation';
import { authedFetch } from '@/lib/fetchWithSupabase';

/* ===========================
   TipTap / RichText + Poll Node
=========================== */
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { Node, mergeAttributes } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { nanoid } from 'nanoid';

/* ===========================
   Types
=========================== */
type Post = {
  id: number;
  title: string;
  summary?: string | null;
  content?: string | null;           // HTML (TipTap) ODER Markdown – wir erkennen’s
  effective_from?: string | null;
  slug?: string | null;
  hero_image_url?: string | null;
};
type Comment = { id:number; user_name?:string|null; content:string; created_at:string };

type PollListItem = {
  id: string;
  question: string;
  options: string[];
  multi_choice?: boolean;
  max_choices?: number;
  allow_change?: boolean;
  closed_at?: string | null;
  updated_at?: string | null;
};

/* ===========================
   Utils
=========================== */
function isProbablyHTML(s?: string|null){ return !!s && /<\/?[a-z][\s\S]*>/i.test(s); }
function sanitize(html:string){ return DOMPurify.sanitize(html, { ADD_ATTR: ['target','rel'] }); }

function contentHasOwnSources(content?: string | null) {
  if (!content) return false;
  return /\n?#{2,3}\s*Quellen\b/i.test(content);
}
function prettySourceLabel(url: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback.trim();
  try { const u = new URL(url); return u.host.replace(/^www\./,'') + (u.pathname !== '/' ? u.pathname : ''); }
  catch { return url; }
}

/* ===========================
   PollsClient – rendert/verknüpft Poll-Blöcke im veröffentlichten HTML
=========================== */
function PollsClient({ containerSelector, postId, postSlug }: { containerSelector: string; postId?: number; postSlug?: string|null }) {
  useEffect(() => {
    const root = document.querySelector(containerSelector) as HTMLElement | null;
    if (!root) return;

    const nodes = Array.from(root.querySelectorAll<HTMLDivElement>('div[data-type="poll"]'));
    if (!nodes.length) return;

    nodes.forEach((el) => {
      const pollId = el.getAttribute('data-id') || '';
      const question = el.getAttribute('data-question') || 'Abstimmung';
      let options: string[] = [];
      try { options = JSON.parse(el.getAttribute('data-options') || '[]'); } catch { options = []; }

      const wrapper = document.createElement('div');
      wrapper.className = 'rounded-xl border p-4 my-4 bg-white/60 dark:bg-white/5 border-gray-200 dark:border-gray-700';
      wrapper.innerHTML = `
        <div class="text-xs font-medium text-gray-500 mb-2">Abstimmung</div>
        <div class="text-sm font-semibold mb-3">${escapeHtml(question)}</div>
        <div data-role="opts" class="flex flex-wrap gap-2 mb-2">
          ${options.map((o, i) => `
            <button data-idx="${i}" class="px-3 py-1.5 rounded border text-sm border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              ${escapeHtml(o)}
            </button>
          `).join('')}
        </div>
        <div data-role="result" class="text-xs text-gray-500"></div>
      `;
      el.replaceWith(wrapper);

      wrapper.querySelectorAll<HTMLButtonElement>('button[data-idx]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.idx);
          btn.disabled = true;
          try {
            const res = await fetch('/api/polls/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pollId, optionIndex: idx, postId, postSlug }),
            }).then(r => r.json());

            const result = wrapper.querySelector('[data-role="result"]') as HTMLDivElement;
            if (res?.counts && Array.isArray(res.counts)) {
              const total = res.counts.reduce((s: number, c: any) => s + Number(c.votes || 0), 0) || 0;
              const lines = res.counts.map((c: any) => {
                const name = options[c.option_index] ?? `Option ${c.option_index}`;
                const votes = Number(c.votes || 0);
                const pct = total ? Math.round((votes / total) * 100) : 0;
                return `${escapeHtml(name)}: ${votes} (${pct}%)`;
              });
              result.textContent = total ? lines.join(' · ') : 'Noch keine Stimmen';
            } else {
              result.textContent = res?.alreadyVoted ? 'Du hast bereits abgestimmt.' : 'Danke für deine Stimme!';
            }
            wrapper.querySelectorAll<HTMLButtonElement>('button[data-idx]').forEach(b => (b.disabled = true));
          } catch {
            btn.disabled = false;
          }
        });
      });
    });
  }, [containerSelector, postId, postSlug]);

  return null;
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (m) =>
    m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : m === '"' ? '&quot;' : '&#39;'
  );
}

/* ===========================
   TipTap Poll Node (Editor-Vorschau & Speicherung als Datenblock)
=========================== */
function PollView({ node, selected }: any) {
  const q = node.attrs.question as string;
  const options = (node.attrs.options as string[]) ?? [];
  return (
    <NodeViewWrapper
      as="div"
      className={`rounded-xl border p-3 my-2 bg-white/60 dark:bg-white/5 border-gray-200 dark:border-gray-700 ${selected ? 'ring-2 ring-blue-400' : ''}`}
      data-type="poll"
    >
      <div className="text-xs font-medium text-gray-500 mb-1">Abstimmung</div>
      <div className="text-sm font-semibold mb-2">{q || '— Frage —'}</div>
      <div className="flex flex-wrap gap-2">
        {options.length ? options.map((o, i) => (
          <span key={i} className="px-2 py-1 text-xs rounded-full border dark:border-gray-700">{o}</span>
        )) : <span className="text-xs text-gray-500">Keine Optionen</span>}
      </div>
      <div className="mt-2 text-[11px] text-gray-500">Wird als Datenblock gespeichert und im Frontend gerendert.</div>
    </NodeViewWrapper>
  );
}
const Poll = Node.create({
  name: 'poll',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: el => el.getAttribute('data-id'), renderHTML: attrs => ({ 'data-id': attrs.id }) },
      question: {
        default: 'Wofür stimmst du?',
        parseHTML: el => el.getAttribute('data-question') || 'Wofür stimmst du?',
        renderHTML: attrs => ({ 'data-question': attrs.question }),
      },
      options: {
        default: ['Option A', 'Option B'],
        parseHTML: el => { try { return JSON.parse(el.getAttribute('data-options') || '[]'); } catch { return ['Option A','Option B']; } },
        renderHTML: attrs => ({ 'data-options': JSON.stringify(attrs.options ?? []) }),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="poll"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'poll' })]; },
  addNodeView() { return ReactNodeViewRenderer(PollView); },
});

/* ===========================
   UploadButton (Cover oder Inline)
=========================== */
function UploadButton({
  onUploaded, multiple = true, children,
}: { onUploaded: (urls: string[]) => void; multiple?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          const fd = new FormData();
          files.forEach(f => fd.append('files', f));
          const r = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
          const j = await r.json().catch(()=> ({}));
          if (r.ok && j.ok && Array.isArray(j.urls)) onUploaded(j.urls);
          else alert(j.error || 'Upload fehlgeschlagen');
          if (ref.current) ref.current.value = '';
        }}
      />
      <button type="button" className="px-3 py-2 rounded-lg border bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 border-gray-300 dark:border-gray-700" onClick={()=>ref.current?.click()}>
        {children}
      </button>
    </>
  );
}

/* ===========================
   RichTextEditor (TipTap + Toolbar + Poll Picker)
=========================== */
function PollPickerModal({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (p: PollListItem) => void }) {
  const [loading, setLoading] = useState(false);
  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/admin/polls', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => setPolls(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setPolls([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return polls;
    return polls.filter((p) => {
      const hay = `${p.id} ${p.question} ${(p.options || []).join(' ')}`.toLowerCase();
      return hay.includes(s);
    });
  }, [polls, q]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-10 mx-auto max-w-3xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-lg font-semibold">Abstimmung verknüpfen</div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700">Schließen</button>
        </div>
        <div className="p-4 space-y-3">
          <input
            className="w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10"
            placeholder="Suche nach Frage, Option oder ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading ? (
            <div className="text-sm text-gray-500">lädt…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-500">Keine Abstimmungen gefunden.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((p) => {
                const isClosed = !!p.closed_at;
                return (
                  <li key={p.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="px-1.5 py-0.5 text-[11px] rounded bg-gray-100 dark:bg-gray-800">{p.id}</code>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${
                            isClosed
                              ? 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                              : 'border-green-300 text-green-700 dark:border-green-900 dark:text-green-300'
                          }`}>{isClosed ? 'geschlossen' : 'offen'}</span>
                          {p.multi_choice ? (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-blue-300 text-blue-700 dark:border-blue-900 dark:text-blue-300">
                              Mehrfach{p.max_choices ? ` (max ${p.max_choices})` : ''}
                            </span>
                          ) : (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                              Einfach
                            </span>
                          )}
                          {p.allow_change === false && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                              Änderung gesperrt
                            </span>
                          )}
                        </div>
                        <div className="font-medium mt-1">{p.question}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(p.options || []).map((o, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border dark:border-gray-700">{o}</span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <button type="button" onClick={() => onPick(p)} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Verknüpfen</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RichTextEditor({
  value,
  onChange,
  placeholder = 'Schreibe den Beitrag …',
  onInsertImages,
}: { value: string; onChange: (html: string) => void; placeholder?: string; onInsertImages?: (urls: string[]) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Poll,
    ],
    immediatelyRender: false,
    content: value || '<p></p>',
    onUpdate({ editor }) { onChange(editor.getHTML()); },
    editorProps: { attributes: { class: 'tiptap prose dark:prose-invert max-w-none min-h-[220px] focus:outline-none' } },
  });

  // Alignment helpers
  const isAlign = useCallback((dir: 'left'|'center'|'right') => !!editor?.isActive({ textAlign: dir }), [editor]);
  const setAlign = useCallback((dir: 'left'|'center'|'right') => editor?.chain().focus().setTextAlign(dir).run(), [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || '') !== (current || '')) editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
  }, [value, editor]);

  const btn = (active: boolean) =>
    `px-2 py-1 rounded border text-sm transition ${active
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`;

  const can = (fn: () => boolean) => !!editor && fn();
  const insertTable = () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const addRow = () => editor?.chain().focus().addRowAfter().run();
  const addCol = () => editor?.chain().focus().addColumnAfter().run();
  const delRow = () => editor?.chain().focus().deleteRow().run();
  const delCol = () => editor?.chain().focus().deleteColumn().run();
  const delTable = () => editor?.chain().focus().deleteTable().run();

  const insertPoll = () => {
    if (!editor) return;
    const question = window.prompt('Frage der Abstimmung:', 'Wofür stimmst du?') ?? '';
    if (question === '') return;
    const raw = window.prompt('Optionen (kommagetrennt):', 'Option A, Option B') ?? '';
    const options = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!options.length) return;
    editor.chain().focus().insertContent({ type: 'poll', attrs: { id: nanoid(8), question, options } }).run();
  };

  const linkExistingPoll = (p: PollListItem) => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'poll',
      attrs: { id: p.id, question: p.question ?? '', options: Array.isArray(p.options) ? p.options : [] },
    }).run();
    setPickerOpen(false);
  };

  // Bilder ins Dokument einfügen
  const insertImages = (urls: string[]) => {
    if (!editor || urls.length === 0) return;
    const html = urls.map(u => `<figure><img src="${u}" alt="" /></figure>`).join('');
    editor.chain().focus().insertContent(html).run();
    onInsertImages?.(urls);
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap gap-2 p-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button className={btn(!!editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()} type="button"><b>B</b></button>
        <button className={btn(!!editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()} type="button"><i>I</i></button>
        <button className={btn(!!editor?.isActive('underline'))} onClick={() => editor?.chain().focus().toggleUnderline().run()} type="button"><u>U</u></button>

        <span className="mx-1 opacity-40">|</span>

        <button className={btn(!!editor?.isActive('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} type="button">H2</button>
        <button className={btn(!!editor?.isActive('heading', { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} type="button">H3</button>

        <span className="mx-1 opacity-40">|</span>

        <button className={btn(!!editor?.isActive('bulletList'))} onClick={() => editor?.chain().focus().toggleBulletList().run()} type="button">• Liste</button>
        <button className={btn(!!editor?.isActive('orderedList'))} onClick={() => editor?.chain().focus().toggleOrderedList().run()} type="button">1. Liste</button>
        <button className={btn(!!editor?.isActive('blockquote'))} onClick={() => editor?.chain().focus().toggleBlockquote().run()} type="button">„Zitat“</button>

        <span className="mx-1 opacity-40">|</span>

        <button
          className={btn(!!editor?.isActive('link'))}
          onClick={() => {
            if (!editor) return;
            const prev = editor.getAttributes('link')?.href as string | undefined;
            const url = window.prompt('Link-URL:', prev ?? '');
            if (url === null) return;
            if (url === '') editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
          type="button"
        >Link</button>

        <span className="mx-1 opacity-40">|</span>
        <UploadButton multiple onUploaded={insertImages}>Bilder einfügen…</UploadButton>

        <button className={btn(false)} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} type="button">Formatierung löschen</button>

        <span className="mx-1 opacity-40">|</span>
        <button className={btn(!!editor?.isActive('table'))} onClick={insertTable} type="button">Tabelle</button>
        <button className={btn(false)} onClick={addRow} disabled={!can(() => editor!.can().addRowAfter())} type="button">+ Zeile</button>
        <button className={btn(false)} onClick={addCol} disabled={!can(() => editor!.can().addColumnAfter())} type="button">+ Spalte</button>
        <button className={btn(false)} onClick={delRow} disabled={!can(() => editor!.can().deleteRow())} type="button">− Zeile</button>
        <button className={btn(false)} onClick={delCol} disabled={!can(() => editor!.can().deleteColumn())} type="button">− Spalte</button>

        <span className="mx-1 opacity-40">|</span>
        <button className={btn(false)} onClick={() => editor?.chain().focus().toggleHeaderRow().run()} disabled={!editor?.isActive('table')} type="button">Headerzeile</button>
        <button className={btn(false)} onClick={() => editor?.chain().focus().toggleHeaderColumn().run()} disabled={!editor?.isActive('table')} type="button">Headerspalte</button>
        <button className={btn(false)} onClick={() => editor?.chain().focus().toggleHeaderCell().run()} disabled={!editor?.isActive('table')} type="button">Headerzelle</button>

        <span className="mx-1 opacity-40">|</span>
        <button className={btn(isAlign('left'))} onClick={() => setAlign('left')} type="button">Links</button>
        <button className={btn(isAlign('center'))} onClick={() => setAlign('center')} type="button">Zentriert</button>
        <button className={btn(isAlign('right'))} onClick={() => setAlign('right')} type="button">Rechts</button>

        <button className={btn(false)} onClick={delTable} disabled={!editor?.isActive('table')} type="button">Tabelle löschen</button>

        <span className="mx-1 opacity-40">|</span>
        <button className={btn(false)} onClick={insertPoll} type="button">Abstimmung (neu)</button>
        <button className={btn(false)} onClick={() => setPickerOpen(true)} type="button">Poll verknüpfen</button>
      </div>

      <div className="bg-white dark:bg-gray-900 px-4 py-3">
        <EditorContent editor={editor} />
      </div>

      <PollPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={linkExistingPoll} />
    </div>
  );
}

/* ===========================
   GroupRoom – mit Gruppennamen, Suche, aufklappbarem Composer,
   Cover-Upload, Quellenformular, RichText & Polls
=========================== */
export default function GroupRoom() {
  const params = useParams<{ groupId: string }>();
  const groupId = Number(params.groupId);

  const [groupName, setGroupName] = useState<string>('');
  const [composerOpen, setComposerOpen] = useState<boolean>(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Suche
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Composer-State
  const [title, setTitle] = useState('');
  const [contentHtml, setContentHtml] = useState(''); // TipTap liefert HTML
  const [summary, setSummary] = useState<string>('');
  const [heroUrl, setHeroUrl] = useState<string>('');

  // Quellen
  type Source = { url: string; label?: string };
  const [sources, setSources] = useState<Source[]>([]);
  const [srcUrl, setSrcUrl] = useState('');
  const [srcLabel, setSrcLabel] = useState('');

  // ---- Helper: Gruppennamen sicherstellen (Fallback über /api/groups)
  async function ensureGroupName(current?: string) {
    if (current && current.trim()) return current;
    try {
      const r2 = await authedFetch('/api/groups');
      if (r2.ok) {
        const j2 = await r2.json().catch(()=> ({}));
        const list: Array<{id:number; name:string}> = Array.isArray(j2?.data) ? j2.data : [];
        const hit = list.find(g => g.id === groupId);
        if (hit?.name) return hit.name;
      }
    } catch {}
    return '';
  }

  // -------- Laden
  async function load() {
    setLoading(true); setError('');
    const r = await authedFetch(`/api/groups/${groupId}/posts?` + new URLSearchParams({
      page: '1', pageSize: '20', q: debouncedQ || '',
    }));
    const j = await r.json().catch(()=>({}));
    if (!('ok' in (j||{})) && !Array.isArray(j?.items) && !Array.isArray(j?.data)) {
      setError('Konnte Beiträge nicht laden.'); setPosts([]); setLoading(false);
    } else {
      const arr = Array.isArray(j?.items) ? j.items : Array.isArray(j?.data) ? j.data : [];
      setPosts(arr);
      const n = (j?.group_name || j?.meta?.group_name) as string | undefined;
      setLoading(false);
      setGroupName(await ensureGroupName(n));
    }
  }
  useEffect(()=>{ load(); /* eslint-disable-next-line */ },[groupId, debouncedQ]);

  // Clientseitiger Fallback für Suche
  const visiblePosts = useMemo(() => {
    const s = debouncedQ.toLowerCase();
    if (!s) return posts;
    return posts.filter(p => {
      const hay = `${p.title||''} ${p.summary||''} ${p.content||''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [posts, debouncedQ]);

  // -------- Speichern
  function buildContentWithSources(): string {
    if (sources.length === 0 || contentHasOwnSources(contentHtml)) return contentHtml;
    const htmlSuffix = `
      <h3>Quellen</h3>
      <ol>
        ${sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${prettySourceLabel(s.url, s.label)}</a></li>`).join('')}
      </ol>
    `;
    return (contentHtml || '') + htmlSuffix;
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    const titleTrim = title.trim();
    const contentTrim = (contentHtml || '').trim();
    if (!titleTrim || !contentTrim) return;

    const body = {
      title: titleTrim,
      content: buildContentWithSources(), // ggf. mit „Quellen“ appended
      summary: summary.trim() || null,
      hero_image_url: heroUrl || null,
    };

    const r = await authedFetch(`/api/groups/${groupId}/posts`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!r.ok) { alert('Konnte Beitrag nicht erstellen.'); return; }
    setTitle(''); setSummary(''); setContentHtml(''); setHeroUrl(''); setSources([]);
    setComposerOpen(false);
    await load();
  }

  // Quellen-UI
  function addSource() {
    const url = srcUrl.trim();
    if (!url) return;
    setSources(prev => {
      const set = new Set(prev.map(s => s.url.trim()));
      if (set.has(url)) return prev;
      return [...prev, { url, label: srcLabel.trim() || undefined }];
    });
    setSrcUrl(''); setSrcLabel('');
  }
  function removeSource(url: string) { setSources(prev => prev.filter(s => s.url !== url)); }

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{groupName ? groupName : `Gruppe #${groupId}`}</h1>
        {/* Suche */}
        <div className="flex items-center gap-2">
          <label htmlFor="group-search" className="text-sm text-gray-500 dark:text-gray-400">Suche:</label>
          <input
            id="group-search"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="Titel, Inhalt, …"
            className="rounded-xl px-3 py-2 w-[min(420px,70vw)] bg-white text-gray-900 placeholder-gray-500 border border-gray-300 shadow-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500
                       dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10"
          />
          {q && (
            <button
              type="button"
              onClick={()=>setQ('')}
              className="px-3 py-2 rounded-xl text-sm border bg-white hover:bg-gray-50
                         dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
            >
              Löschen
            </button>
          )}
        </div>
      </div>

      {/* Composer (aufklappbar) */}
      <section className="rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 overflow-hidden">
        <button
          type="button"
          onClick={()=> setComposerOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          aria-expanded={composerOpen}
        >
          <span className="font-medium">Beitrag anlegen</span>
          <svg className={`h-4 w-4 transition-transform ${composerOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/>
          </svg>
        </button>

        {composerOpen && (
          <form onSubmit={createPost} className="grid gap-3 px-4 pb-4">
            {/* Cover */}
            <div className="grid md:grid-cols-[1fr_auto] gap-2 items-center">
              <input
                placeholder="Titel"
                value={title}
                onChange={e=>setTitle(e.target.value)}
                className="px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700"
                required
              />
              <UploadButton multiple={false} onUploaded={(urls)=> setHeroUrl(urls[0] || '')}>Cover hochladen…</UploadButton>
            </div>
            {heroUrl && (
              <div className="flex items-center gap-2">
                <img src={heroUrl} alt="Cover" className="h-20 rounded-xl object-cover border border-gray-200 dark:border-gray-800" />
                <button type="button" className="px-3 py-2 rounded-lg border bg-white dark:bg-white/10" onClick={()=>setHeroUrl('')}>Cover entfernen</button>
              </div>
            )}

            <textarea
              placeholder="Kurzbeschreibung (optional)"
              value={summary}
              onChange={e=>setSummary(e.target.value)}
              rows={2}
              className="px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700"
            />

            <RichTextEditor value={contentHtml} onChange={setContentHtml} onInsertImages={()=>{}} />

            {/* Quellenformular */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <div className="text-sm font-semibold mb-2">Quellen</div>
              <div className="flex flex-wrap gap-2 mb-2">
                <input
                  value={srcUrl}
                  onChange={e=>setSrcUrl(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 min-w-[16rem] px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700"
                />
                <input
                  value={srcLabel}
                  onChange={e=>setSrcLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border bg-white dark:bg-white/10 border-gray-300 dark:border-gray-700"
                />
                <button type="button" onClick={addSource} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Quelle hinzufügen</button>
              </div>
              {sources.length > 0 && (
                <ol className="list-decimal pl-5 space-y-1">
                  {sources.map(s => (
                    <li key={s.url} className="flex items-center gap-2 break-words">
                      <span className="flex-1">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline text-blue-700 dark:text-blue-400">
                          {prettySourceLabel(s.url, s.label)}
                        </a>
                      </span>
                      <button type="button" className="px-2 py-1 rounded border text-xs" onClick={()=>removeSource(s.url)}>Entfernen</button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-2 text-xs text-gray-500">
                Wird beim Speichern als Abschnitt „Quellen“ ans Ende des Inhalts angehängt (sofern nicht bereits vorhanden).
              </div>
            </div>

            <div className="flex justify-end">
              <button className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Beitrag veröffentlichen</button>
            </div>
          </form>
        )}
      </section>

      {/* Feed */}
      {loading && <div>Lade…</div>}
      {!loading && error && <div className="text-amber-700 dark:text-amber-400">{error}</div>}
      {!loading && !error && visiblePosts.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed text-center text-gray-600 dark:text-gray-300">Keine Beiträge gefunden.</div>
      )}
      {!loading && !error && visiblePosts.length > 0 && (
        <ul className="grid gap-4">
          {visiblePosts.map(p => {
            const isHtml = isProbablyHTML(p.content);
            const containerId = `post-content-${p.id}`;
            return (
              <li key={p.id} className="p-5 rounded-2xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                <div className="flex items-start gap-3">
                  {p.hero_image_url && (
                    <img src={p.hero_image_url} alt="" className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xl font-semibold">{p.title}</div>
                    {p.summary && <p className="mt-1 text-gray-700 dark:text-gray-300">{p.summary}</p>}
                  </div>
                </div>

                {p.content && (
                  <div className="prose dark:prose-invert max-w-none mt-3" id={containerId}>
                    {isHtml ? (
                      <>
                        <div
                          dangerouslySetInnerHTML={{ __html: sanitize(p.content!) }}
                          className="[&_a]:underline [&_a]:break-words [&_img]:max-w-full [&_img]:h-auto"
                        />
                        <PollsClient containerSelector={`#${containerId}`} postId={p.id} postSlug={p.slug ?? null} />
                      </>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.content!}</ReactMarkdown>
                    )}
                  </div>
                )}

                <Comments postId={p.id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ===========================
   Kommentare
=========================== */
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
