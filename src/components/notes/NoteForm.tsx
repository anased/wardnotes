// src/components/notes/NoteForm.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import useCategories from '@/lib/hooks/useCategories';
import useTags from '@/lib/hooks/useTags';
import { useDraftPersistence } from '@/lib/hooks/useDraftPersistence';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import TagInput from '../ui/TagInput';
import NoteEditor from './NoteEditor';
import CategoryCreationModal from '../ui/CategoryCreationModal';
import NoteImprover from './NoteImprover'; // Add this import
import LearningQuestionsInput from './LearningQuestionsInput';
import PremiumFeatureGate from '../premium/PremiumFeatureGate'; // Import the premium gate
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { useQuota } from '@/lib/hooks/useQuota';
import { supabase } from '@/lib/supabase/client';

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
  const { tags, addTag } = useTags(); // Make sure we have the addTag function
  const { track } = useAnalytics();
  const { subscription } = useSubscription();
  const { refreshQuota } = useQuota();

  const [title, setTitle] = useState(initialData.title || '');

  // Learning questions section state
  const [showLearningSection, setShowLearningSection] = useState(false);
  const [clinicalContext, setClinicalContext] = useState('');
  const [learningQuestions, setLearningQuestions] = useState<string[]>(['']);
  const [isAnsweringQuestions, setIsAnsweringQuestions] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, unknown>>(initialData.content || EMPTY_CONTENT);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData.tags || []);
  const [category, setCategory] = useState<string>(initialData.category || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // State for the category creation modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Draft persistence hook
  const { loadDraft, clearDraft } = useDraftPersistence(
    initialData.id,
    {
      title,
      content,
      category,
      tags: selectedTags,
    },
    true // Enable draft persistence
  );

  // Generate category options from the database, adding the "Add new category" option
  const categoryOptions = [
    // Add placeholder option if no categories exist
    ...(categories.length === 0 ? [{
      value: '',
      label: 'No categories yet - create one below'
    }] : []),
    // Add existing categories
    ...categories.map(cat => ({
      value: cat.name,
      label: cat.name
    })),
    // Always add the "Add new category" option
    {
      value: ADD_NEW_CATEGORY,
      label: '+ Add new category...'
    }
  ];

  // Extract all tag names for suggestions
  const tagSuggestions = tags.map(tag => tag.name);

  // Set a default category if none was selected and options are available
  // Only run this ONCE on mount, not on every re-render
  useEffect(() => {
    if (!category && categories.length > 0 && !initialData.category) {
      setCategory(categories[0].name);
    }
     
  }, [categories.length]); // Only when categories are loaded, not on every change

  // Automatically load and restore draft on component mount (silently)
  useEffect(() => {
    const draft = loadDraft();

    // Automatically restore draft if it exists and is different from initial data
    if (draft) {
      // Check if draft is different from initial data
      const isDraftDifferent =
        draft.title !== (initialData.title || '') ||
        JSON.stringify(draft.content) !== JSON.stringify(initialData.content || EMPTY_CONTENT) ||
        draft.category !== (initialData.category || '') ||
        JSON.stringify(draft.tags) !== JSON.stringify(initialData.tags || []);

      // Silently restore the draft if it's different
      if (isDraftDifferent) {
        setTitle(draft.title);
        setContent(draft.content);
        setCategory(draft.category);
        setSelectedTags(draft.tags);
      }
    }
     
  }, []); // Only run on mount

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

  // New function to handle tag changes and auto-create new tags
  const handleTagsChange = async (newTags: string[]) => {
    try {
      // Find tags that are new (not in the existing tags list)
      const existingTagNames = tags.map(tag => tag.name);
      const newTagNames = newTags.filter(tag => !existingTagNames.includes(tag));
      
      // Create new tags in the database
      for (const newTagName of newTagNames) {
        try {
          await addTag(newTagName);
          console.log(`Created new tag: ${newTagName}`);
          
          // Track tag added event
          track('tag_added', {
            tag_name: newTagName,
            note_id: initialData.id || 'new',
            subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
          });
        } catch (err) {
          // If tag creation fails (e.g., duplicate), just log it and continue
          console.warn(`Failed to create tag "${newTagName}":`, err);
        }
      }
      
      // Update the selected tags
      setSelectedTags(newTags);
    } catch (err) {
      console.error('Error handling tag changes:', err);
      // Still update the selected tags even if some tag creation failed
      setSelectedTags(newTags);
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
      else if (line.startsWith('### ')) {
        newContentNodes.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: line.substring(4).trim() }]
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

  // Helper to format Q&A as Markdown for TipTap
  const formatAnswersAsMarkdown = (
    context: string,
    answers: Array<{ question: string; answer: string }>
  ): string => {
    let markdown = `## Clinical Context\n${context}\n\n## Learning Questions & Answers\n\n`;

    answers.forEach((qa, index) => {
      markdown += `### Q${index + 1}: ${qa.question}\n\n${qa.answer}\n\n`;
    });

    return markdown;
  };

  // Handler for answering learning questions
  const handleAnswerQuestions = async () => {
    // Validate inputs
    const validQuestions = learningQuestions.filter(q => q.trim().length > 0);

    if (!clinicalContext.trim()) {
      setLearningError('Please enter clinical context');
      return;
    }

    if (validQuestions.length === 0) {
      setLearningError('Please enter at least one question');
      return;
    }

    try {
      setIsAnsweringQuestions(true);
      setLearningError(null);

      // Track event started
      track('learning_questions_started', {
        question_count: validQuestions.length,
        subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
      });

      // Get session token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('You must be logged in');
      }

      // Call API
      const response = await fetch('/api/answer-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          clinicalContext: clinicalContext.trim(),
          questions: validQuestions
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 429) {
          setLearningError(errorData.message || 'Monthly limit reached. Upgrade to Premium for unlimited access.');
          return;
        }

        throw new Error(errorData.error || 'Failed to answer questions');
      }

      const data = await response.json();

      // Convert answers to Markdown and inject into editor
      const markdownContent = formatAnswersAsMarkdown(
        clinicalContext.trim(),
        data.answers
      );

      handleImprovedContent(markdownContent);

      // Refresh quota
      await refreshQuota();

      // Track completion
      track('learning_questions_answered', {
        question_count: validQuestions.length,
        generation_time: data.metadata.generationTime,
        subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
      });

      // Reset form and collapse section
      setShowLearningSection(false);
      setClinicalContext('');
      setLearningQuestions(['']);

    } catch (err) {
      setLearningError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsAnsweringQuestions(false);
    }
  };

  // Helper function to generate a title from content if none provided
  const generateTitleFromContent = (content: Record<string, unknown>): string => {
    try {
      // Convert TipTap content to plain text
      const tipTapContent = content as any;
      let plainText = '';
      
      const extractText = (node: any): void => {
        if (node.text) {
          plainText += node.text;
        } else if (node.content && Array.isArray(node.content)) {
          node.content.forEach(extractText);
        }
      };
      
      if (tipTapContent.content) {
        extractText(tipTapContent);
      }
      
      // Take first 50 characters and clean up
      plainText = plainText.trim();
      if (plainText.length > 50) {
        plainText = plainText.substring(0, 50).trim() + '...';
      }
      
      // If we have content, use it as title, otherwise use a default with timestamp
      if (plainText.length > 0) {
        return plainText;
      } else {
        const now = new Date();
        return `Note - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (err) {
      // Fallback to timestamp-based title
      const now = new Date();
      return `Note - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category) {
      setError(categories.length === 0 ? 'Please create a category first' : 'Please select a category');
      return;
    }

    // Generate title if not provided
    const finalTitle = title.trim() || generateTitleFromContent(content);

    try {
      setIsSubmitting(true);

      if (isEditing && initialData.id) {
        // Update existing note
        await editNote(initialData.id, {
          title: finalTitle,
          content,
          tags: selectedTags,
          category,
        });

        // Clear draft after successful save
        clearDraft();

        router.push(`/notes/${initialData.id}`);
      } else {
        // Create new note
        const newNote = await addNote({
          title: finalTitle,
          content,
          tags: selectedTags,
          category,
        });

        // Clear draft after successful save
        clearDraft();

        // Track note creation
        track('note_created', {
          note_category: category,
          tag_count: selectedTags.length,
          subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
        });

        // Check if this is their first note with tags (onboarding completion)
        if (selectedTags.length > 0) {
          // This could be enhanced to check if it's truly their first note
          track('onboarding_completed', {
            subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
          });
        }

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
        label="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Auto-generated from content if left empty"
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
          onChange={handleTagsChange} // Use the new handler
          suggestions={tagSuggestions}
        />
      </div>

      {/* Learning Questions Section - Collapsible */}
      <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLearningSection(!showLearningSection)}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          <span className="flex items-center text-sm font-medium text-blue-700 dark:text-blue-300">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Learn from this encounter
          </span>
          <svg
            className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-transform ${showLearningSection ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showLearningSection && (
          <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter a brief clinical context and ask questions about what you want to learn. AI will generate educational answers that populate the note editor.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Clinical Context
              </label>
              <textarea
                value={clinicalContext}
                onChange={(e) => setClinicalContext(e.target.value)}
                placeholder="e.g., 65-year-old patient with newly diagnosed glioma presenting with first-time generalized seizure after missing ASM doses..."
                rows={3}
                disabled={isAnsweringQuestions}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                  dark:border-gray-600 dark:bg-gray-800 dark:text-white
                  focus:ring-2 focus:ring-primary-500 focus:border-transparent
                  disabled:opacity-50 disabled:cursor-not-allowed resize-none
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {clinicalContext.length}/2000 characters
              </p>
            </div>

            <LearningQuestionsInput
              questions={learningQuestions}
              onQuestionsChange={setLearningQuestions}
              maxQuestions={5}
              disabled={isAnsweringQuestions}
            />

            {learningError && (
              <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900/50 dark:text-red-200">
                {learningError}
              </div>
            )}

            <div className="pt-2">
              <PremiumFeatureGate
                featureName="Learning Questions"
                description="Get AI-powered answers to your clinical learning questions."
                featureType="note_improvement"
              >
                <Button
                  type="button"
                  onClick={handleAnswerQuestions}
                  isLoading={isAnsweringQuestions}
                  disabled={!clinicalContext.trim() || learningQuestions.every(q => !q.trim())}
                  variant="primary"
                  className="flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Answer My Questions
                </Button>
              </PremiumFeatureGate>
            </div>
          </div>
        )}
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