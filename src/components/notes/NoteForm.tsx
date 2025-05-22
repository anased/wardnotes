// src/components/notes/NoteForm.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import useCategories from '@/lib/hooks/useCategories';
import useTags from '@/lib/hooks/useTags';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import TagInput from '../ui/TagInput';
import NoteEditor from './NoteEditor';
import CategoryCreationModal from '../ui/CategoryCreationModal';
import NoteImprover from './NoteImprover'; // Add this import
import PremiumFeatureGate from '../premium/PremiumFeatureGate'; // Import the premium gate

interface NoteFormProps {
  initialData?: Partial<Note>;
  isEditing?: boolean;
}
const ENABLE_PREMIUM_FEATURES = true;

const EMPTY_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: '' }],
    },
  ],
};

// Special value to indicate "Add new category" option
const ADD_NEW_CATEGORY = 'add_new_category';

// Define types for TipTap nodes
interface TextNode {
  type: 'text';
  text: string;
  marks?: { type: string }[];
}

interface ParagraphNode {
  type: 'paragraph';
  content: TextNode[];
}

interface HeadingNode {
  type: 'heading';
  attrs: { level: number };
  content: TextNode[];
}

interface ListItemNode {
  type: 'listItem';
  content: ParagraphNode[];
}

interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

type ContentNode = ParagraphNode | HeadingNode | BulletListNode;

interface TipTapDocument {
  type: 'doc';
  content: ContentNode[];
}

export default function NoteForm({ initialData = {}, isEditing = false }: NoteFormProps) {
  const router = useRouter();
  const { addNote, editNote } = useNotes();
  const { categories, addCategory } = useCategories();
  const { tags } = useTags();
  
  const [title, setTitle] = useState(initialData.title || '');
  const [content, setContent] = useState<Record<string, unknown>>(initialData.content || EMPTY_CONTENT);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData.tags || []);
  const [category, setCategory] = useState<string>(initialData.category || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // State for the category creation modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Generate category options from the database, adding the "Add new category" option
  const categoryOptions = [
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.name
    })),
    {
      value: ADD_NEW_CATEGORY,
      label: '+ Add new category...'
    }
  ];

  // Extract all tag names for suggestions
  const tagSuggestions = tags.map(tag => tag.name);

  // Set a default category if none was selected and options are available
  useEffect(() => {
    if (!category && categories.length > 0) {
      setCategory(categories[0].name);
    }
  }, [category, categories]);

  // Handle category change with special handling for "Add new category" option
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    
    if (value === ADD_NEW_CATEGORY) {
      setShowCategoryModal(true);
    } else {
      setCategory(value);
    }
  };

  // Handle creating a new category from the modal
  const handleCreateCategory = async (name: string, color: string) => {
    try {
      // Create the new category
      const newCategory = await addCategory(name, color);
      
      // Set the new category as the selected one
      setCategory(newCategory.name);
    } catch (err) {
      console.error('Error creating category:', err);
      throw err; // Let the modal handle the error
    }
  };

  // Helper function to parse text with bold and italic marks
  function parseBoldItalicText(text: string): TextNode[] {
    const segments: TextNode[] = [];
    let currentIndex = 0;
    
    // Find bold patterns like **text**
    const boldPattern = /\*\*(.*?)\*\*/g;
    let boldMatch;
    
    while ((boldMatch = boldPattern.exec(text)) !== null) {
      // Add normal text before the match
      if (boldMatch.index > currentIndex) {
        segments.push({
          type: 'text',
          text: text.substring(currentIndex, boldMatch.index)
        });
      }
      
      // Add the bold text
      segments.push({
        type: 'text',
        text: boldMatch[1],
        marks: [{ type: 'bold' }]
      });
      
      currentIndex = boldMatch.index + boldMatch[0].length;
    }
    
    // Add any remaining text after the last match
    if (currentIndex < text.length) {
      segments.push({
        type: 'text',
        text: text.substring(currentIndex)
      });
    }
    
    // If no segments were created (no bold text), just return the whole text
    if (segments.length === 0) {
      return [{ type: 'text', text }];
    }
    
    return segments;
  }

  // Updated function to handle improved content with better Markdown parsing
  const handleImprovedContent = (improvedContent: string) => {
    console.log("Original improved content:", improvedContent);
    
    // First, split the content into lines
    const lines = improvedContent.split('\n');
    const newContentNodes: ContentNode[] = [];
    
    // Process each line and convert to appropriate TipTap nodes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Handle headings
      if (line.startsWith('# ')) {
        newContentNodes.push({
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: line.substring(2).trim() }]
        });
      } 
      else if (line.startsWith('## ')) {
        newContentNodes.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: line.substring(3).trim() }]
        });
      }
      // Handle bold text (entire line is bold)
      else if (line.startsWith('**') && line.endsWith('**')) {
        newContentNodes.push({
          type: 'paragraph',
          content: [{
            type: 'text',
            text: line.substring(2, line.length - 2),
            marks: [{ type: 'bold' }]
          }]
        });
      }
      // Handle list items
      else if (line.trim().startsWith('- ')) {
        // If this is the first list item, start a new bullet list
        const lastNode = newContentNodes.length > 0 ? newContentNodes[newContentNodes.length - 1] : null;
        
        if (!lastNode || lastNode.type !== 'bulletList') {
          newContentNodes.push({
            type: 'bulletList',
            content: []
          } as BulletListNode);
        }
        
        // Get the text content (strip the "- " prefix)
        const itemText = line.trim().substring(2);
        
        // Create list item with any bold/italic formatting
        const listItemContent = parseBoldItalicText(itemText);
        
        // Add this list item to the last bullet list
        const lastList = newContentNodes[newContentNodes.length - 1] as BulletListNode;
        if (lastList.type === 'bulletList' && Array.isArray(lastList.content)) {
          lastList.content.push({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: listItemContent
            }]
          });
        }
      }
      // Handle empty lines
      else if (line.trim() === '') {
        // Only add empty paragraph if it's not after a list or before a heading
        const prevNode = newContentNodes.length > 0 ? newContentNodes[newContentNodes.length - 1] : null;
        const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
        
        if (!(prevNode?.type === 'bulletList' || 
              nextLine.startsWith('# ') || 
              nextLine.startsWith('## '))) {
          newContentNodes.push({
            type: 'paragraph',
            content: []
          });
        }
      }
      // Regular paragraph with potential formatting
      else {
        newContentNodes.push({
          type: 'paragraph',
          content: parseBoldItalicText(line)
        });
      }
    }
    
    // Create the final content structure
    const newContent: TipTapDocument = {
      type: 'doc',
      content: newContentNodes
    };
    
    console.log("Converted TipTap content:", newContent);
    setContent(newContent as unknown as Record<string, unknown>);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    
    if (!category) {
      setError('Please select a category');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      if (isEditing && initialData.id) {
        // Update existing note
        await editNote(initialData.id, {
          title,
          content,
          tags: selectedTags,
          category,
        });
        
        router.push(`/notes/${initialData.id}`);
      } else {
        // Create new note
        const newNote = await addNote({
          title,
          content,
          tags: selectedTags,
          category,
        });
        
        router.push(`/notes/${newNote.id}`);
      }
    } catch (err) {
      console.error('Error saving note:', err);
      setError('Failed to save note. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter a descriptive title"
        required
      />
      
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Select
          label="Category"
          value={category}
          onChange={handleCategoryChange}
          options={categoryOptions}
        />
        
        <TagInput
          label="Tags"
          value={selectedTags}
          onChange={setSelectedTags}
          suggestions={tagSuggestions}
        />
      </div>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Note Content
        </label>
        <NoteEditor
          content={content}
          onChange={setContent}
        />
      </div>
      
      {/* Note Improver Component */}
      <div className="mt-4">
        <NoteImprover 
          content={content} 
          onImproveSuccess={handleImprovedContent} 
        />
      </div>
      
      <div className="flex justify-end space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          isLoading={isSubmitting}
        >
          {isEditing ? 'Update Note' : 'Save Note'}
        </Button>
      </div>

      {/* Category Creation Modal */}
      <CategoryCreationModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSave={handleCreateCategory}
      />
    </form>
  );
}