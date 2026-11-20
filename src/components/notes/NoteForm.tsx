// src/components/notes/NoteForm.tsx
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/lib/supabase/client';
import useNotes from '@/lib/hooks/useNotes';
import useTags from '@/lib/hooks/useTags';
import { useDraftPersistence } from '@/lib/hooks/useDraftPersistence';
import Button from '../ui/Button';
import NoteEditor from './NoteEditor';
import NoteAiMenu from './NoteAiMenu';
import NotePropertiesBar from './NotePropertiesBar';
import useTopics from '@/lib/hooks/useTopics';
import { noteSpecialty } from '@/lib/utils/specialty';
import { getNoteTopicLinks, saveNoteTopics } from '@/lib/supabase/noteTopics';
import { NoteTopicLink, parseDraftLinks, sameLinks } from '@/lib/utils/noteTopicLinks';
import { useNotification } from '@/lib/context/NotificationContext';
import type { LinkDraftWithTitle } from '../links/NoteLinksField';
import useTrials from '@/lib/hooks/useTrials';
import { getNoteSummaries, getOutgoingLinks, saveOutgoingNoteLinks } from '@/lib/supabase/noteLinks';
import { draftKey, isLinkRelation } from '@/lib/utils/noteLinks';
import { trialLabel } from '@/lib/utils/trials';
import { useAnalytics } from '@/lib/analytics/useAnalytics';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { canonicalTagName, dedupeTags, hasTag } from '@/lib/utils/tagUtils';
import { ContentType, NoteStatus, isContentType, isNoteStatus } from '@/lib/utils/noteFields';

interface NoteFormProps {
  initialData?: Partial<Note>;
  isEditing?: boolean;
  /** Topic links for a new note, e.g. when started from a topic page. */
  initialTopicLinks?: NoteTopicLink[];
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

export default function NoteForm({ initialData = {}, isEditing = false, initialTopicLinks = [] }: NoteFormProps) {
  const router = useRouter();
  const { addNote, editNote, reloadNote } = useNotes();
  const { tags, addTag } = useTags();
  const { track } = useAnalytics();
  const { subscription } = useSubscription();
  const { graph: topicGraph, refreshCounts: refreshTopicCounts } = useTopics();
  const { showNotification } = useNotification();

  const [title, setTitle] = useState(initialData.title || '');

  const [content, setContent] = useState<Record<string, unknown>>(initialData.content || EMPTY_CONTENT);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData.tags || []);
  const [status, setStatus] = useState<NoteStatus>(
    isNoteStatus(initialData.status) ? initialData.status : 'answered'
  );
  const [contentType, setContentType] = useState<ContentType | ''>(
    isContentType(initialData.content_type) ? initialData.content_type : ''
  );
  const [topicLinks, setTopicLinks] = useState<NoteTopicLink[]>(initialTopicLinks);
  // Links as stored, to skip saving when they didn't change (null until loaded)
  const [savedTopicLinks, setSavedTopicLinks] = useState<NoteTopicLink[] | null>(
    initialData.id ? null : []
  );
  const topicsFromDraftRef = useRef(false);
  const [linkDrafts, setLinkDrafts] = useState<LinkDraftWithTitle[]>([]);
  // draftKeys of the links as stored (null until loaded)
  const [savedLinkKeys, setSavedLinkKeys] = useState<string[] | null>(initialData.id ? null : []);
  const linksFromDraftRef = useRef(false);
  const { byId: trialsById } = useTrials();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Draft persistence hook
  const { loadDraft, clearDraft } = useDraftPersistence(
    initialData.id,
    {
      title,
      content,
      tags: selectedTags,
      status,
      content_type: contentType,
      topics: topicLinks,
      links: linkDrafts,
    },
    true // Enable draft persistence
  );

  // Extract all tag names for suggestions
  const tagSuggestions = tags.map(tag => tag.name);

  // Automatically load and restore draft on component mount (silently)
  useEffect(() => {
    const draft = loadDraft();

    // Automatically restore draft if it exists and is different from initial data
    if (draft) {
      // Check if draft is different from initial data
      const isDraftDifferent =
        draft.title !== (initialData.title || '') ||
        JSON.stringify(draft.content) !== JSON.stringify(initialData.content || EMPTY_CONTENT) ||
        JSON.stringify(draft.tags) !== JSON.stringify(initialData.tags || []) ||
        (draft.status !== undefined && draft.status !== (initialData.status || 'answered')) ||
        (draft.content_type !== undefined && draft.content_type !== (initialData.content_type || ''));

      // Silently restore the draft if it's different
      if (isDraftDifferent) {
        setTitle(draft.title);
        setContent(draft.content);
        setSelectedTags(draft.tags);
        if (isNoteStatus(draft.status)) setStatus(draft.status);
        if (draft.content_type === '' || isContentType(draft.content_type)) {
          setContentType(draft.content_type);
        }
      }

      if (Array.isArray(draft.links)) {
        const restored = (draft.links as Record<string, unknown>[]).filter(
          (l): l is Record<string, unknown> & LinkDraftWithTitle =>
            !!l &&
            isLinkRelation(l.relation) &&
            (l.target_type === 'note' || l.target_type === 'trial') &&
            typeof l.target_id === 'string'
        ).map((l) => ({ relation: l.relation, target_type: l.target_type, target_id: l.target_id, title: String(l.title ?? '') }));
        if (restored.length > 0 || initialData.id) {
          linksFromDraftRef.current = true;
          setLinkDrafts(restored);
        }
      }

      const draftTopics = parseDraftLinks(draft.topics);
      if (draftTopics && (draftTopics.length > 0 || initialData.id)) {
        topicsFromDraftRef.current = true;
        setTopicLinks(draftTopics);
      }
    }
     
  }, []); // Only run on mount

  // Load an existing note's outgoing links (a restored draft keeps its own)
  useEffect(() => {
    if (!initialData.id) return;
    let cancelled = false;
    getOutgoingLinks('note', initialData.id)
      .then(async (links) => {
        const noteTitles = await getNoteSummaries(
          links.filter((l) => l.target_type === 'note').map((l) => l.target_id)
        );
        if (cancelled) return;
        setSavedLinkKeys(links.map(draftKey));
        if (!linksFromDraftRef.current) {
          setLinkDrafts(
            links.map((l) => ({
              relation: l.relation,
              target_type: l.target_type,
              target_id: l.target_id,
              title: l.target_type === 'note' ? noteTitles[l.target_id]?.title ?? 'Note' : '',
            }))
          );
        }
      })
      .catch((err) => console.error('Error loading note links:', err));
    return () => {
      cancelled = true;
    };
  }, [initialData.id]);

  // Load an existing note's topic links (a restored draft keeps its own)
  useEffect(() => {
    if (!initialData.id) return;
    let cancelled = false;
    getNoteTopicLinks(initialData.id)
      .then((links) => {
        if (cancelled) return;
        setSavedTopicLinks(links);
        if (!topicsFromDraftRef.current) setTopicLinks(links);
      })
      .catch((err) => console.error('Error loading note topics:', err));
    return () => {
      cancelled = true;
    };
  }, [initialData.id]);

  // Create any tags on the note that aren't in the user's tag list yet.
  // Runs when the note is saved, so tags typed and removed again aren't kept.
  // Returns the note's tags using the saved spelling of existing tags.
  const saveNewTags = async (noteTags: string[]): Promise<string[]> => {
    const finalTags = dedupeTags(noteTags.map(tag => canonicalTagName(tag, tagSuggestions)));
    const newTagNames = finalTags.filter(tag => !hasTag(tagSuggestions, tag));

    for (const newTagName of newTagNames) {
      try {
        await addTag(newTagName);

        track('tag_added', {
          tag_name: newTagName,
          note_id: initialData.id || 'new',
          subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
        });
      } catch (err) {
        // The note still saves with this tag; it can be managed later in settings
        console.warn(`Failed to create tag "${newTagName}":`, err);
      }
    }

    return finalTags;
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

  /**
   * Saves topic links when they changed. The note itself is already saved at
   * this point, so a failure is reported without failing the whole save
   * (retrying would otherwise create a second copy of a new note).
   */
  const saveTopicLinks = async (noteId: string) => {
    // Existing links not loaded yet (and none restored from a draft): the
    // user can't have changed them, and saving would wipe them.
    if (savedTopicLinks === null && !topicsFromDraftRef.current) return;
    if (savedTopicLinks && sameLinks(topicLinks, savedTopicLinks)) return;
    try {
      await saveNoteTopics(noteId, topicLinks);
      setSavedTopicLinks(topicLinks);
      refreshTopicCounts();
      reloadNote(noteId);
    } catch (err) {
      console.error('Error saving note topics:', err);
      showNotification('The note was saved, but its topics could not be updated. Edit the note to try again.', 'error', 8000);
    }
  };

  /** Saves outgoing links when they changed; like topics, a failure doesn't fail the note save. */
  const saveLinks = async (noteId: string) => {
    if (savedLinkKeys === null && !linksFromDraftRef.current) return;
    const keys = linkDrafts.map(draftKey);
    if (savedLinkKeys && keys.length === savedLinkKeys.length && keys.every((k) => savedLinkKeys.includes(k))) return;
    try {
      await saveOutgoingNoteLinks(noteId, linkDrafts);
      setSavedLinkKeys(keys);
    } catch (err) {
      console.error('Error saving note links:', err);
      showNotification('The note was saved, but its links could not be updated. Edit the note to try again.', 'error', 8000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Generate title if not provided
    const finalTitle = title.trim() || generateTitleFromContent(content);

    try {
      setIsSubmitting(true);

      const finalTags = await saveNewTags(selectedTags);

      if (isEditing && initialData.id) {
        // Update existing note
        await editNote(initialData.id, {
          title: finalTitle,
          content,
          tags: finalTags,
          status,
          content_type: contentType || null,
        });
        await saveTopicLinks(initialData.id);
        await saveLinks(initialData.id);

        // Clear draft after successful save
        clearDraft();

        router.push(`/notes/${initialData.id}`);
      } else {
        // Create new note
        const newNote = await addNote({
          title: finalTitle,
          content,
          tags: finalTags,
          status,
          content_type: contentType || null,
        });
        await saveTopicLinks(newNote.id);
        await saveLinks(newNote.id);

        // Clear draft after successful save
        clearDraft();

        // Track note creation
        track('note_created', {
          note_category: noteSpecialty(topicGraph, { note_topics: topicLinks })?.name,
          tag_count: finalTags.length,
          subscription_status: subscription?.subscription_status === 'active' ? 'premium' : 'free'
        });

        // Check if this is their first note with tags (onboarding completion)
        if (finalTags.length > 0) {
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
          {error}
        </div>
      )}
      
      <div className="space-y-3">
        <input
          type="text"
          aria-label="Note title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled — we'll name it from your content"
          className="w-full px-0 py-1 text-2xl font-bold tracking-tight text-gray-900 bg-transparent border-0 outline-none sm:text-[1.75rem] placeholder:text-gray-400 placeholder:font-semibold focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
        />

        {/* Type and status are hidden for now; existing values are kept on save */}
        <NotePropertiesBar
          noteId={initialData.id}
          topics={topicLinks}
          onTopicsChange={setTopicLinks}
          labels={selectedTags}
          onLabelsChange={setSelectedTags}
          labelSuggestions={tagSuggestions}
          links={linkDrafts.map((l) =>
            // Trial titles come from the trials list (always current)
            l.target_type === 'trial' && trialsById.has(l.target_id)
              ? { ...l, title: trialLabel(trialsById.get(l.target_id)!) }
              : l
          )}
          onLinksChange={setLinkDrafts}
        />
      </div>

      <NoteEditor
        content={content}
        onChange={setContent}
        toolbarEnd={<NoteAiMenu content={content} onApplyMarkdown={handleImprovedContent} />}
      />
      
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