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

interface NoteFormProps {
  initialData?: Partial<Note>;
  isEditing?: boolean;
}

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

export default function NoteForm({ initialData = {}, isEditing = false }: NoteFormProps) {
  const router = useRouter();
  const { addNote, editNote } = useNotes();
  const { categories, addCategory } = useCategories();
  const { tags } = useTags();
  
  const [title, setTitle] = useState(initialData.title || '');
  const [content, setContent] = useState(initialData.content || EMPTY_CONTENT);
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