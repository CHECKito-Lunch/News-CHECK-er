'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
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

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

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

/* ---------------- Poll Picker Modal ---------------- */
function PollPickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: PollListItem) => void;
}) {
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
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
          >
            Schließen
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10"
              placeholder="Suche nach Frage, Option oder ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

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
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded-full border ${
                              isClosed
                                ? 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                                : 'border-green-300 text-green-700 dark:border-green-900 dark:text-green-300'
                            }`}
                          >
                            {isClosed ? 'geschlossen' : 'offen'}
                          </span>
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
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border dark:border-gray-700">
                              {o}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => onPick(p)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Verknüpfen
                        </button>
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

/* -------- Poll NodeView (Editor-Vorschau) -------- */
function PollView({ node, selected }: any) {
  const q = node.attrs.question as string;
  const options = (node.attrs.options as string[]) ?? [];

  return (
    <NodeViewWrapper
      as="div"
      className={`rounded-xl border p-3 my-2 bg-white/60 dark:bg-white/5 border-gray-200 dark:border-gray-700 ${
        selected ? 'ring-2 ring-blue-400' : ''
      }`}
      data-type="poll"
    >
      <div className="text-xs font-medium text-gray-500 mb-1">Abstimmung</div>
      <div className="text-sm font-semibold mb-2">{q || '— Frage —'}</div>
      <div className="flex flex-wrap gap-2">
        {options.length ? (
          options.map((o: string, i: number) => (
            <span key={i} className="px-2 py-1 text-xs rounded-full border dark:border-gray-700">
              {o}
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-500">Keine Optionen</span>
        )}
      </div>
      <div className="mt-2 text-[11px] text-gray-500">Wird als Datenblock gespeichert und im Frontend gerendert.</div>
    </NodeViewWrapper>
  );
}

/* -------- Poll Node (Leaf/Atom: kein Content-Hole) -------- */
const Poll = Node.create({
  name: 'poll',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => ({ 'data-id': attrs.id }),
      },
      question: {
        default: 'Wofür stimmst du?',
        parseHTML: (el) => el.getAttribute('data-question') || 'Wofür stimmst du?',
        renderHTML: (attrs) => ({ 'data-question': attrs.question }),
      },
      options: {
        default: ['Option A', 'Option B'],
        parseHTML: (el) => {
          const raw = el.getAttribute('data-options') || '[]';
          try {
            return JSON.parse(raw);
          } catch {
            return ['Option A', 'Option B'];
          }
        },
        renderHTML: (attrs) => ({ 'data-options': JSON.stringify(attrs.options ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="poll"]' }];
  },

  // Leaf: kein Content-Hole
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'poll' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PollView);
  },
});

export default function RichTextEditor({ value, onChange, placeholder = 'Schreibe den Beitrag …' }: Props) {
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
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: { class: 'tiptap prose dark:prose-invert max-w-none min-h-[220px] focus:outline-none' },
    },
  });

  // <<< Alignment-Helper JETZT innerhalb der Komponente >>>
  const isAlign = useCallback(
    (dir: 'left' | 'center' | 'right') => !!editor?.isActive({ textAlign: dir }),
    [editor]
  );
  const setAlign = useCallback(
    (dir: 'left' | 'center' | 'right') => editor?.chain().focus().setTextAlign(dir).run(),
    [editor]
  );
  // =====================================================

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || '') !== (current || '')) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    }
  }, [value, editor]);

  const btn = (active: boolean) =>
    `px-2 py-1 rounded border text-sm transition ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'
    }`;

  const can = (fn: () => boolean) => !!editor && fn();

  const insertTable = () =>
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const addRow = () => editor?.chain().focus().addRowAfter().run();
  const addCol = () => editor?.chain().focus().addColumnAfter().run();
  const delRow = () => editor?.chain().focus().deleteRow().run();
  const delCol = () => editor?.chain().focus().deleteColumn().run();
  const delTable = () => editor?.chain().focus().deleteTable().run();

  // Ad-hoc neue Poll (Prompts)
  const insertPoll = () => {
    if (!editor) return;
    const question = window.prompt('Frage der Abstimmung:', 'Wofür stimmst du?') ?? '';
    if (question === '') return;
    const raw = window.prompt('Optionen (kommagetrennt):', 'Option A, Option B') ?? '';
    const options = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (options.length === 0) return;

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'poll',
        attrs: { id: nanoid(8), question, options },
      })
      .run();
  };

  // Aus Picker verknüpfen
  const linkExistingPoll = (p: PollListItem) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'poll',
        attrs: {
          id: p.id,
          question: p.question ?? '',
          options: Array.isArray(p.options) ? p.options : [],
        },
      })
      .run();
    setPickerOpen(false);
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap gap-2 p-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          className={btn(!!editor?.isActive('bold'))}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!editor}
          type="button"
        >
          <b>B</b>
        </button>

        <button
          className={btn(!!editor?.isActive('italic'))}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!editor}
          type="button"
        >
          <i>I</i>
        </button>

        <button
          className={btn(!!editor?.isActive('underline'))}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!editor}
          type="button"
        >
          <u>U</u>
        </button>

        <span className="mx-1 opacity-40">|</span>

        <button
          className={btn(!!editor?.isActive('heading', { level: 2 }))}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={!editor}
          type="button"
        >
          H2
        </button>

        <button
          className={btn(!!editor?.isActive('heading', { level: 3 }))}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={!editor}
          type="button"
        >
          H3
        </button>

        <span className="mx-1 opacity-40">|</span>

        <button
          className={btn(!!editor?.isActive('bulletList'))}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!editor}
          type="button"
        >
          • Liste
        </button>

        <button
          className={btn(!!editor?.isActive('orderedList'))}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={!editor}
          type="button"
        >
          1. Liste
        </button>

        <button
          className={btn(!!editor?.isActive('blockquote'))}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={!editor}
          type="button"
        >
          „Zitat“
        </button>

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
          disabled={!editor}
          type="button"
        >
          Link
        </button>

        <button
          className={btn(false)}
          onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
          disabled={!editor}
          type="button"
        >
          Formatierung löschen
        </button>

        {/* Tabellen */}
        <span className="mx-1 opacity-40">|</span>
        <button className={btn(!!editor?.isActive('table'))} onClick={insertTable} disabled={!editor} type="button">
          Tabelle
        </button>

        <button className={btn(false)} onClick={addRow} disabled={!can(() => editor!.can().addRowAfter())} type="button">
          + Zeile
        </button>

        <button className={btn(false)} onClick={addCol} disabled={!can(() => editor!.can().addColumnAfter())} type="button">
          + Spalte
        </button>

        <button className={btn(false)} onClick={delRow} disabled={!can(() => editor!.can().deleteRow())} type="button">
          − Zeile
        </button>

        <button className={btn(false)} onClick={delCol} disabled={!can(() => editor!.can().deleteColumn())} type="button">
          − Spalte
        </button>

        {/* --- TABLE: Header-Toggle + Alignment --- */}
        <span className="mx-1 opacity-40">|</span>

        <button
          className={btn(false)}
          onClick={() => editor?.chain().focus().toggleHeaderRow().run()}
          disabled={!editor?.isActive('table')}
          type="button"
        >
          Headerzeile
        </button>

        <button
          className={btn(false)}
          onClick={() => editor?.chain().focus().toggleHeaderColumn().run()}
          disabled={!editor?.isActive('table')}
          type="button"
        >
          Headerspalte
        </button>

        <button
          className={btn(false)}
          onClick={() => editor?.chain().focus().toggleHeaderCell().run()}
          disabled={!editor?.isActive('table')}
          type="button"
        >
          Headerzelle
        </button>

        <span className="mx-1 opacity-40">|</span>

        <button className={btn(isAlign('left'))} onClick={() => setAlign('left')} disabled={!editor} type="button">
          Links
        </button>

        <button className={btn(isAlign('center'))} onClick={() => setAlign('center')} disabled={!editor} type="button">
          Zentriert
        </button>

        <button className={btn(isAlign('right'))} onClick={() => setAlign('right')} disabled={!editor} type="button">
          Rechts
        </button>

        <button
          className={btn(false)}
          onClick={delTable}
          disabled={!editor?.isActive('table')}
          type="button"
        >
          Tabelle löschen
        </button>

        {/* Polls */}
        <span className="mx-1 opacity-40">|</span>
        <button className={btn(false)} onClick={insertPoll} disabled={!editor} type="button">
          Abstimmung (neu)
        </button>

        <button className={btn(false)} onClick={() => setPickerOpen(true)} disabled={!editor} type="button">
          Poll verknüpfen
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 px-4 py-3">
        {/* TippTap Tabellen-Styling via .tiptap-Klasse */}
        <EditorContent editor={editor} />
      </div>

      {/* Modal mounten */}
      <PollPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={linkExistingPoll} />
    </div>
  );
}
