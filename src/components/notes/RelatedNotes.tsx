// src/components/notes/RelatedNotes.tsx
import { useEffect, useMemo, useState } from 'react';
import { Note, getRelatedNoteCandidates } from '@/lib/supabase/client';
import {
  rankRelatedNotes,
  relatedTopicIds,
  describeRelatedNote,
  RelatedNote,
  DEFAULT_RELATED_LIMIT,
} from '@/lib/utils/relatedNotes';
import useTopics from '@/lib/hooks/useTopics';
import NoteCard from './NoteCard';

interface RelatedNotesProps {
  note: Note;
  limit?: number;
}

export default function RelatedNotes({ note, limit = DEFAULT_RELATED_LIMIT }: RelatedNotesProps) {
  const { graph, loading: topicsLoading } = useTopics();
  const [related, setRelated] = useState<RelatedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Re-run only when the fields that drive matching change, not on every new note object.
  const tagsKey = (note.tags || []).join('\u0000');
  const topicsKey = (note.note_topics || []).map((l) => l.topic_id).sort().join('\u0000');
  const lookupTopicIds = useMemo(
    () => relatedTopicIds(graph, (note.note_topics || []).map((l) => l.topic_id)),
    [graph, topicsKey]
  );

  useEffect(() => {
    if (topicsLoading) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const candidates = await getRelatedNoteCandidates(note, lookupTopicIds);
        if (!cancelled) setRelated(rankRelatedNotes(note, candidates, graph, limit));
      } catch {
        if (!cancelled) {
          setRelated([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [note.id, tagsKey, lookupTopicIds, topicsLoading, limit]);

  return (
    <section aria-labelledby="related-notes-heading" className="space-y-3">
      <h2 id="related-notes-heading" className="text-lg font-medium">
        Related notes
      </h2>

      {loading ? (
        <div className="flex justify-center py-6" role="status" aria-label="Loading related notes">
          <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : failed ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Couldn&apos;t load related notes right now.
        </p>
      ) : related.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No related notes yet. Notes on the same or nearby topics, or with shared labels, will show up here.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {related.map(item => (
            <li key={item.note.id} className="flex flex-col gap-1">
              <NoteCard note={item.note} highlightTags={item.sharedTags} />
              <p className="px-1 text-xs text-gray-500 dark:text-gray-400">{describeRelatedNote(item, graph)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
