import { useEffect, useState } from 'react';
import Link from 'next/link';
import useTopics from '@/lib/hooks/useTopics';
import { NoteTopicDisplay, getNoteTopicsForDisplay } from '@/lib/supabase/noteTopics';

interface NoteTopicChipsProps {
  noteId: string;
}

/** The topics a note is filed under, primary first, each linking to its topic page. */
export default function NoteTopicChips({ noteId }: NoteTopicChipsProps) {
  const { graph } = useTopics();
  const [links, setLinks] = useState<NoteTopicDisplay[]>([]);

  useEffect(() => {
    let cancelled = false;
    getNoteTopicsForDisplay(noteId)
      .then((rows) => {
        if (!cancelled) setLinks(rows);
      })
      .catch((err) => console.error('Error loading note topics:', err));
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const visible = links.filter((l) => graph.byId.has(l.topic_id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3" aria-label="Topics">
      <span className="text-sm text-gray-600 dark:text-gray-400">Topics:</span>
      {visible.map((l) => {
        const name = graph.byId.get(l.topic_id)!.name;
        return (
          <Link
            key={l.topic_id}
            href={`/topics/${l.topic_id}`}
            title={l.is_primary ? 'Primary topic' : undefined}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-sm rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:focus-visible:ring-primary-400 ${
              l.is_primary
                ? 'bg-primary-50 text-primary-800 ring-1 ring-primary-200 hover:bg-primary-100 dark:bg-primary-900/60 dark:text-primary-100 dark:ring-primary-700'
                : 'bg-gray-50 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'
            }`}
          >
            {name}
            {l.section_name && <span className="text-gray-500 dark:text-gray-400">· {l.section_name}</span>}
            {l.is_primary && <span className="sr-only">(primary topic)</span>}
          </Link>
        );
      })}
    </div>
  );
}
