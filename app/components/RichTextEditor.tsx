'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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

// --- Poll Node (Leaf/Atom: kein Content-Hole, draggable) ---
const Poll = Node.create({
  name: 'poll',
  group: 'block',
  atom: true,          // Leaf node
  selectable: true,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: el => el.getAttribute('data-id'),
        renderHTML: attrs => ({ 'data-id': attrs.id }),
      },
      question: {
        default: 'Wofür stimmst du?',
        parseHTML: el => el.getAttribute('data-question') || 'Wofür stimmst du?',
        renderHTML: attrs => ({ 'data-question': attrs.question }),
      },
      options: {
        default: ['Option A', 'Option B'],
        parseHTML: el => {
          const raw = el.getAttribute('data-options') || '[]';
          try { return JSON.parse(raw); } catch { return ['Option A', 'Option B']; }
        },
        renderHTML: attrs => ({ 'data-options': JSON.stringify(attrs.options ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="poll"]' }];
  },

  // ⚠️ KEIN `0` (kein Content-Hole) – Leaf darf keine Kinder haben
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'poll' })];
  },
});

export default function RichTextEditor({ value, onChange, placeholder = 'Schreibe den Beitrag …' }: Props) {
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
      Poll, // <-- nur einmal registrieren
    ],
    immediatelyRender: false,
    content: value || '<p></p>',
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: { class: 'prose dark:prose-invert max-w-none min-h-[220px] focus:outline-none' },
    },
  });

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

  const insertTable = () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const addRow =       () => editor?.chain().focus().addRowAfter().run();
  const addCol =       () => editor?.chain().focus().addColumnAfter().run();
  const delRow =       () => editor?.chain().focus().deleteRow().run();
  const delCol =       () => editor?.chain().focus().deleteColumn().run();
  const delTable =     () => editor?.chain().focus().deleteTable().run();

  const insertPoll = () => {
    if (!editor) return;
    const question = window.prompt('Frage der Abstimmung:', 'Wofür stimmst du?') ?? '';
    if (question === '') return;
    const raw = window.prompt('Optionen (kommagetrennt):', 'Option A, Option B') ?? '';
    const options = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (options.length === 0) return;

    editor.chain().focus().insertContent({
      type: 'poll',
      attrs: { id: nanoid(8), question, options },
    }).run();
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex flex-wrap gap-2 p-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button className={btn(!!editor?.isActive('bold'))}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!editor}
          type="button"><b>B</b></button>

        <button className={btn(!!editor?.isActive('italic'))}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!editor}
          type="button"><i>I</i></button>

        <button className={btn(!!editor?.isActive('underline'))}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!editor}
          type="button"><u>U</u></button>

        <span className="mx-1 opacity-40">|</span>

        <button className={btn(!!editor?.isActive('heading', { level: 2 }))}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={!editor}
          type="button">H2</button>

        <button className={btn(!!editor?.isActive('heading', { level: 3 }))}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={!editor}
          type="button">H3</button>

        <span className="mx-1 opacity-40">|</span>

        <button className={btn(!!editor?.isActive('bulletList'))}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!editor}
          type="button">• Liste</button>

        <button className={btn(!!editor?.isActive('orderedList'))}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={!editor}
          type="button">1. Liste</button>

        <button className={btn(!!editor?.isActive('blockquote'))}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={!editor}
          type="button">„Zitat“</button>

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

        <button className={btn(false)}
          onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
          disabled={!editor}
          type="button">Formatierung löschen</button>

        {/* Tabellen */}
        <span className="mx-1 opacity-40">|</span>
        <button className={btn(!!editor?.isActive('table'))}
          onClick={insertTable}
          disabled={!editor}
          type="button">Tabelle</button>

        <button className={btn(false)}
          onClick={addRow}
          disabled={!can(() => editor!.can().addRowAfter())}
          type="button">+ Zeile</button>

        <button className={btn(false)}
          onClick={addCol}
          disabled={!can(() => editor!.can().addColumnAfter())}
          type="button">+ Spalte</button>

        <button className={btn(false)}
          onClick={delRow}
          disabled={!can(() => editor!.can().deleteRow())}
          type="button">− Zeile</button>

        <button className={btn(false)}
          onClick={delCol}
          disabled={!can(() => editor!.can().deleteColumn())}
          type="button">− Spalte</button>

        <button className={btn(false)}
          onClick={delTable}
          disabled={!editor?.isActive('table')}
          type="button">Tabelle löschen</button>

        {/* Poll */}
        <span className="mx-1 opacity-40">|</span>
        <button className={btn(false)}
          onClick={insertPoll}
          disabled={!editor}
          type="button">Abstimmung</button>
     </div>

      <div className="bg-white dark:bg-gray-900 px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
