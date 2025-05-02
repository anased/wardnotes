import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback } from 'react';

interface NoteEditorProps {
  content: any;
  onChange: (content: any) => void;
  editable?: boolean;
}

export default function NoteEditor({
  content,
  onChange,
  editable = true,
}: NoteEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  const toggleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleCode = useCallback(() => {
    editor?.chain().focus().toggleCode().run();
  }, [editor]);

  const toggleBlockquote = useCallback(() => {
    editor?.chain().focus().toggleBlockquote().run();
  }, [editor]);

  const toggleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run();
  }, [editor]);

  const toggleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const setHeading = useCallback((level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="note-editor border border-gray-300 rounded-lg dark:border-gray-700 overflow-hidden">
      {editable && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => setHeading(1)}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('heading', { level: 1 }) ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Heading 1"
          >
            <span className="font-bold">H1</span>
          </button>
          
          <button
            type="button"
            onClick={() => setHeading(2)}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('heading', { level: 2 }) ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Heading 2"
          >
            <span className="font-bold">H2</span>
          </button>
          
          <button
            type="button"
            onClick={() => setHeading(3)}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('heading', { level: 3 }) ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Heading 3"
          >
            <span className="font-bold">H3</span>
          </button>
          
          <div className="w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600" />
          
          <button
            type="button"
            onClick={toggleBold}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 5a2 2 0 012 2v4a2 2 0 01-2 2h-5v-2h5a1 1 0 001-1V7a1 1 0 00-1-1h-5v2h5zm-5 8v2h5a1 1 0 001-1v-4a1 1 0 00-1-1h-5v2h5a1 1 0 011 1v1a1 1 0 01-1 1h-5z" />
            </svg>
          </button>
          
          <button
            type="button"
            onClick={toggleItalic}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Italic"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4h-8M6 16h8" />
            </svg>
          </button>
          
          <button
            type="button"
            onClick={toggleCode}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('code') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Inline Code"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4H8m0 0l4 4m-4-4v12" />
            </svg>
          </button>
          
          <div className="w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600" />
          
          <button
            type="button"
            onClick={toggleBulletList}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('bulletList') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Bullet List"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          
          <button
            type="button"
            onClick={toggleOrderedList}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('orderedList') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Numbered List"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20h10M7 4h10M7 12h10M3 20h.01M3 4h.01M3 12h.01" />
            </svg>
          </button>
          
          <button
            type="button"
            onClick={toggleBlockquote}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('blockquote') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Blockquote"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 17h3l2 2h4l2-2h3M6 7h3l2-2h4l2 2h3" />
            </svg>
          </button>
        </div>
      )}
      
      <div className="p-4">
        <EditorContent editor={editor} className="min-h-[150px] prose dark:prose-invert max-w-none" />
      </div>
    </div>
  );
}