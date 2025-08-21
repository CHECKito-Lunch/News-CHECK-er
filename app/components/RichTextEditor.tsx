'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';

type Props = {
  value: string;                   // gespeichertes HTML
  onChange: (html: string) => void;
  placeholder?: string;
};

export default function RichTextEditor({ value, onChange, placeholder = 'Schreibe den Beitrag …' }: Props) {
  // ⚠️ KEIN Early return vor useEditor!
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    immediatelyRender: false,                 // vermeidet SSR/Hydration-Mismatch
    content: value || '<p></p>',
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose dark:prose-invert max-w-none min-h-[220px] focus:outline-none',
      },
    },
  });

  // externes value → Editor synchronisieren, ohne Hooks neu zu ordnen
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || '') !== (current || '')) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
    }
  }, [value, editor]);

  const btn = (active: boolean) =>
    `px-2 py-1 rounded border text-sm transition
     ${active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
          'dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`;

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
     </div>

      <div className="bg-white dark:bg-gray-900 px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}