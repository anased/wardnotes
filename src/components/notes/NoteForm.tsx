import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import TagInput from '../ui/TagInput';
import NoteEditor from './NoteEditor';

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

const CATEGORY_OPTIONS = [
  { value: 'Neurology', label: 'Neurology' },
  { value: 'Cardiology', label: 'Cardiology' },
  { value: 'General', label: 'General' },
  { value: 'Procedures', label: 'Procedures' },
];

export default function NoteForm({ initialData = {}, isEditing = false }: NoteFormProps) {
  const router = useRouter();
  const { addNote, editNote } = useNotes();
  
  const [title, setTitle] = useState(initialData.title || '');
  const [content, setContent] = useState(initialData.content || EMPTY_CONTENT);
  const [tags, setTags] = useState<string[]>(initialData.tags || []);
  const [category, setCategory] = useState<"Neurology" | "Cardiology" | "General" | "Procedures">(initialData.category as "Neurology" | "Cardiology" | "General" | "Procedures" || 'General');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      if (isEditing && initialData.id) {
        // Update existing note
        await editNote(initialData.id, {
          title,
          content,
          tags,
          category,
        });
        
        router.push(`/notes/${initialData.id}`);
      } else {
        // Create new note
        const newNote = await addNote({
          title,
          content,
          tags,
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
          onChange={(e) => setCategory(e.target.value as "Neurology" | "Cardiology" | "General" | "Procedures")}
          options={CATEGORY_OPTIONS}
        />
        
        <TagInput
          label="Tags"
          value={tags}
          onChange={setTags}
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
    </form>
  );
}