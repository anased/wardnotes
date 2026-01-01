import { useEditor, EditorContent, /* Editor */ } from '@tiptap/react';
import { useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useState, useMemo, useRef } from 'react';
import { /* BoldIcon, ItalicIcon, UnderlineIcon, ListBulletIcon */ } from '@heroicons/react/24/outline';

// Selection information interface
export interface SelectionInfo {
  text: string;
  from: number;
  to: number;
  coordinates: {
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
}


// Define menu button interface
interface MenuButtonProps {
  isActive?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

// Menu button component
const MenuButton = ({ isActive, onClick, title, children }: MenuButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
      isActive ? 'bg-gray-200 dark:bg-gray-700' : ''
    }`}
    title={title}
  >
    {children}
  </button>
);

interface NoteEditorProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
}

export default function NoteEditor({
  content,
  onChange,
  editable = true,
  placeholder = 'Start writing your medical note...',
  onSelectionChange,
}: NoteEditorProps) {
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Ref to store debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle selection changes with debouncing
  const handleSelectionChange = useCallback((editor: any) => {
    if (!onSelectionChange) return;

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the selection update
    debounceTimerRef.current = setTimeout(() => {
      const { from, to } = editor.state.selection;

      // Only proceed if there's actual selection
      if (from === to) {
        onSelectionChange(null);
        return;
      }

      // Extract plain text
      const text = editor.state.doc.textBetween(from, to, ' ');

      if (!text.trim()) {
        onSelectionChange(null);
        return;
      }

      // Get DOM coordinates for positioning
      try {
        const coords = editor.view.coordsAtPos(from);
        const endCoords = editor.view.coordsAtPos(to);

        onSelectionChange({
          text: text.trim(),
          from,
          to,
          coordinates: {
            top: coords.top,
            left: coords.left,
            bottom: endCoords.bottom,
            right: endCoords.right,
          },
        });
      } catch (error) {
        // If coordinate calculation fails, clear selection
        onSelectionChange(null);
      }
    }, 150);
  }, [onSelectionChange]);

  const editor = useEditor({
    immediatelyRender: false, // Prevent SSR hydration mismatches
    extensions: [
      StarterKit.configure({
        // We'll explicitly configure these to ensure they work properly
        bulletList: false,  // Disable in StarterKit so we can add our own
        orderedList: false, // Disable in StarterKit so we can add our own
        listItem: false,    // Disable in StarterKit so we can add our own
      }),// Add the list extensions separately with explicit configuration
      BulletList.configure({
        HTMLAttributes: {
          class: 'list-disc pl-6', // Tailwind classes for bullet lists
        },
      }),OrderedList.configure({
        HTMLAttributes: {
          class: 'list-decimal pl-6', // Tailwind classes for numbered lists
        },
      }),
      ListItem,
      Highlight,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Link.configure({
        openOnClick: true,
      }),
      Typography,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    onSelectionUpdate: ({ editor }) => {
      handleSelectionChange(editor);
    },
  });

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Add this useEffect to update content when it changes externally
  useEffect(() => {
    if (editor && content) {
      // Only update if the editor content differs significantly from the supplied content
      // Check if content is different from what's in the editor
      const editorContent = editor.getJSON();
      const newContentStr = JSON.stringify(content);
      const editorContentStr = JSON.stringify(editorContent);

      // Only update if they're different and editor isn't already focused
      // This prevents disrupting user typing
      if (newContentStr !== editorContentStr && !editor.isFocused) {
        // Set content, preserving selection if possible
        editor.commands.setContent(content, false);
      }
    }
  }, [editor, content]);

  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL');
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    
    const previousUrl = editor.getAttributes('link').href;
    setLinkUrl(previousUrl || '');
    setShowLinkMenu(true);
  }, [editor]);

  const confirmLink = useCallback(() => {
    if (!editor) return;
    
    // Empty link removes the link
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setShowLinkMenu(false);
      return;
    }
    
    // Check if valid URL format
    let url = linkUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setShowLinkMenu(false);
  }, [editor, linkUrl]);

  const addTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  const insertMedicalTemplate = (templateType: string) => {
    if (!editor) return;
    
    let template = '';
    
    switch (templateType) {
      case 'soap':
        template = '<h2>Subjective</h2><p></p><h2>Objective</h2><p></p><h2>Assessment</h2><p></p><h2>Plan</h2><p></p>';
        break;
      case 'physical':
        template = '<h2>Physical Examination</h2><p><strong>Vitals:</strong></p><p><strong>General:</strong></p><p><strong>HEENT:</strong></p><p><strong>Cardiovascular:</strong></p><p><strong>Respiratory:</strong></p><p><strong>Abdominal:</strong></p><p><strong>Extremities:</strong></p><p><strong>Neurological:</strong></p>';
        break;
      case 'labs':
        editor.chain().focus().insertTable({ rows: 5, cols: 3, withHeaderRow: true }).run();
        editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            // Get the newly inserted table and try to insert basic content
            // This will be a simple setup - user can customize further
            const text = 'Test\tResult\tReference\n';
            tr.insertText(text, tr.selection.from);
          }
          return true;
        });
        return;
    }
    
    editor.chain().focus().insertContent(template).run();
  };

  return (
    <div className="note-editor border border-gray-300 rounded-lg dark:border-gray-700 overflow-hidden">
      {editable && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex flex-wrap items-center gap-1">
            {/* Text formatting */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h8a4 4 0 0 0 0-8H6v8zm0 0h10a4 4 0 1 1 0 8H6v-8z" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 4h-9M14 20H5M15 4L9 20" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive('underline')}
              title="Underline"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 0 1 4-4 4 4 0 0 1 4 4m-9 5h10M12 4v8" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              isActive={editor.isActive('highlight')}
              title="Highlight"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              title="Strikethrough"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14c.5 0 .9.2 1.2.5.3.3.5.7.5 1.2 0 .5-.2.9-.5 1.2-.3.3-.7.5-1.2.5s-.9-.2-1.2-.5c-.3-.3-.5-.7-.5-1.2 0-.5.2-.9.5-1.2.3-.3.7-.5 1.2-.5zM5 12h14M7 8h1.5c.9 0 1.7.5 1.9 1.4l.1.6M17 8h-1.5c-.9 0-1.7.5-1.9 1.4l-.1.6" />
              </svg>
            </MenuButton>
            
            <div className="w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600" />
            
            {/* Headings */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <span className="font-bold">H1</span>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <span className="font-bold">H2</span>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              isActive={editor.isActive('heading', { level: 3 })}
              title="Heading 3"
            >
              <span className="font-bold">H3</span>
            </MenuButton>
            
            <div className="w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600" />
            
            {/* Lists */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet List"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>

            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Numbered List"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <line x1="9" y1="6" x2="20" y2="6" strokeWidth="2" strokeLinecap="round" />
                <line x1="9" y1="12" x2="20" y2="12" strokeWidth="2" strokeLinecap="round" />
                <line x1="9" y1="18" x2="20" y2="18" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="6" x2="4" y2="6.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="12" x2="4" y2="12.01" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="18" x2="4" y2="18.01" strokeWidth="2" strokeLinecap="round" />
              </svg>

            </MenuButton>
            
            <div className="w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600" />
            
            {/* Block types */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Blockquote"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10.5L4 14.5V6.5L8 10.5Z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 10.5L12 14.5V6.5L16 10.5Z" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={() => editor.chain().focus().toggleCode().run()}
              isActive={editor.isActive('code')}
              title="Inline Code"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </MenuButton>
          </div>
          
          <div className="flex flex-wrap items-center gap-1 ml-auto">
            {/* Special content */}
            <MenuButton
              onClick={setLink}
              isActive={editor.isActive('link')}
              title="Add Link"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={addImage}
              title="Add Image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </MenuButton>
            
            <MenuButton
              onClick={addTable}
              title="Add Table"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </MenuButton>
            
            <div className="relative ml-2">
              <select 
                className="px-2 py-1 text-sm bg-white border rounded-md dark:bg-gray-700 dark:border-gray-600"
                onChange={(e) => {
                  if (e.target.value !== 'none') {
                    insertMedicalTemplate(e.target.value);
                    e.target.value = 'none';
                  }
                }}
                defaultValue="none"
              >
                <option value="none">Insert Template...</option>
                <option value="soap">SOAP Note</option>
                <option value="physical">Physical Exam</option>
                <option value="labs">Lab Results Table</option>
              </select>
            </div>
          </div>
        </div>
      )}
      
      {/* Link menu popup */}
      {showLinkMenu && (
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center">
          <input
            type="text"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            className="flex-1 px-2 py-1 mr-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="https://example.com"
          />
          <button
            onClick={confirmLink}
            className="px-2 py-1 text-white bg-primary-600 rounded hover:bg-primary-700"
          >
            Save
          </button>
          <button
            onClick={() => setShowLinkMenu(false)}
            className="px-2 py-1 ml-2 text-gray-600 bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      )}
      
      <div className="p-4">
        <EditorContent editor={editor} className="min-h-[200px] prose dark:prose-invert max-w-none" />
      </div>
    </div>
  );
}