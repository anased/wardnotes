'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/hooks/useAuth';
import useTopics from '@/lib/hooks/useTopics';
import PageContainer from '@/components/layout/PageContainer';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import TopicSidebar from '@/components/topics/TopicSidebar';
import TopicFormModal from '@/components/topics/TopicFormModal';
import SectionManagerModal from '@/components/topics/SectionManagerModal';
import TopicNoteRow from '@/components/topics/TopicNoteRow';
import { PencilIcon, PlusIcon } from '@/components/topics/icons';
import { supabase } from '@/lib/supabase/client';
import {
  TopicNoteLink,
  TopicSection,
  getPrimaryTopicIds,
  getTopicNotes,
  getTopicSections,
  moveNoteToSection,
} from '@/lib/supabase/topicSections';
import { groupBySection } from '@/lib/utils/topicSections';
import { ancestorPaths, childIds } from '@/lib/utils/topicTree';

export default function TopicPage() {
  const { user, loading: authLoading } = useAuth();
  const { graph, noteCounts, loading: topicsLoading, refreshCounts } = useTopics();
  const params = useParams();
  const router = useRouter();
  const topicId = typeof params.id === 'string' ? params.id : '';
  const topic = graph.byId.get(topicId);

  const [sections, setSections] = useState<TopicSection[]>([]);
  const [links, setLinks] = useState<TopicNoteLink[]>([]);
  const [primaryOf, setPrimaryOf] = useState<Record<string, string>>({});
  const [withSubtopicsCount, setWithSubtopicsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingNoteId, setMovingNoteId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showSections, setShowSections] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth');
  }, [user, authLoading, router]);

  /** Loads sections and notes; `quiet` keeps the current list on screen meanwhile. */
  const load = useCallback(async (quiet = false) => {
    if (!user || !topicId) return;
    try {
      if (!quiet) setLoading(true);
      setError(null);
      const [secs, noteLinks, total] = await Promise.all([
        getTopicSections(topicId),
        getTopicNotes(topicId),
        supabase.rpc('notes_in_topic', { p_topic_id: topicId }, { count: 'exact', head: true }),
      ]);
      setSections(secs);
      setLinks(noteLinks);
      setWithSubtopicsCount(total.error ? null : total.count ?? null);
      const notPrimaryHere = noteLinks.filter((l) => !l.is_primary).map((l) => l.note.id);
      setPrimaryOf(await getPrimaryTopicIds(notPrimaryHere));
    } catch (err) {
      console.error('Error loading topic:', err);
      setError('Failed to load this topic.');
    } finally {
      setLoading(false);
    }
  }, [user, topicId]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => groupBySection(sections, links), [sections, links]);
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of links) if (l.section_id) counts[l.section_id] = (counts[l.section_id] ?? 0) + 1;
    return counts;
  }, [links]);

  const handleMove = async (noteId: string, sectionId: string | null) => {
    const previous = links;
    setMovingNoteId(noteId);
    setLinks((ls) => ls.map((l) => (l.note.id === noteId ? { ...l, section_id: sectionId } : l)));
    try {
      await moveNoteToSection(noteId, topicId, sectionId);
    } catch (err) {
      console.error('Error moving note:', err);
      setLinks(previous);
      setError('Could not move the note. Please try again.');
    } finally {
      setMovingNoteId(null);
    }
  };

  if (authLoading || (topicsLoading && !topic)) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Spinner size="md" color="primary" />
        </div>
      </PageContainer>
    );
  }

  if (!topic) {
    return (
      <PageContainer title="Topic Not Found">
        <div className="p-4 text-yellow-700 bg-yellow-100 rounded-lg dark:bg-yellow-900 dark:text-yellow-200">
          The requested topic could not be found.{' '}
          <Link href="/notes" className="underline">
            Back to the library
          </Link>
        </div>
      </PageContainer>
    );
  }

  const paths = ancestorPaths(graph, topic.id);
  const [mainPath, ...otherPaths] = paths;
  const nameOf = (id: string) => graph.byId.get(id)?.name ?? '';
  const subtopics = childIds(graph, topic.id);
  const directCount = links.length || noteCounts[topic.id] || 0;
  const subtopicExtra = withSubtopicsCount !== null ? withSubtopicsCount - directCount : 0;

  const renderPath = (path: string[], linkLast: boolean) =>
    path.map((id, i) => (
      <Fragment key={id}>
        {i > 0 && (
          <span aria-hidden="true" className="mx-1.5 text-gray-400 dark:text-gray-500">
            ›
          </span>
        )}
        {i === path.length - 1 && !linkLast ? (
          <span aria-current="page" className="text-gray-700 dark:text-gray-300">
            {nameOf(id)}
          </span>
        ) : (
          <Link
            href={`/topics/${id}`}
            className="hover:text-primary-700 hover:underline dark:hover:text-primary-300"
          >
            {nameOf(id)}
          </Link>
        )}
      </Fragment>
    ));

  return (
    <PageContainer>
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TopicSidebar selectedId={topic.id} />

        <div className="min-w-0 space-y-6">
          {/* Header */}
          <div>
            {mainPath && mainPath.length > 1 && (
              <nav aria-label="Breadcrumb" className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                {renderPath(mainPath, false)}
              </nav>
            )}
            {otherPaths.length > 0 && (
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                Also in:{' '}
                {otherPaths.map((p, i) => (
                  <Fragment key={p.join('/')}>
                    {i > 0 && '; '}
                    {renderPath(p.slice(0, -1), true)}
                  </Fragment>
                ))}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold break-words">{topic.name}</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {directCount} {directCount === 1 ? 'note' : 'notes'}
                  {subtopicExtra > 0 && (
                    <>
                      {' · '}
                      <Link
                        href={`/notes?topic=${topic.id}`}
                        className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        {withSubtopicsCount} including subtopics
                      </Link>
                    </>
                  )}
                  {topic.aliases.length > 0 && <> · Also known as {topic.aliases.join(', ')}</>}
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <Button variant="outline" onClick={() => setShowEdit(true)} className="inline-flex items-center">
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Link href={`/notes/new?topic=${topic.id}`} passHref>
                  <Button className="inline-flex items-center">
                    <PlusIcon className="w-4 h-4 mr-2" />
                    New note
                  </Button>
                </Link>
              </div>
            </div>

            {topic.description && (
              <p className="mt-3 text-gray-700 dark:text-gray-300">{topic.description}</p>
            )}

            {subtopics.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-4" aria-label="Subtopics">
                <span className="text-sm text-gray-600 dark:text-gray-400">Subtopics:</span>
                {subtopics.map((id) => (
                  <Link
                    key={id}
                    href={`/topics/${id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-sm text-gray-700 rounded-full bg-gray-50 ring-1 ring-gray-200 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
                  >
                    {nameOf(id)}
                    {(noteCounts[id] ?? 0) > 0 && (
                      <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">{noteCounts[id]}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Sections */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Notes</h2>
            <Button variant="outline" onClick={() => setShowSections(true)} className="inline-flex items-center text-sm">
              <PlusIcon className="w-4 h-4 mr-1.5" />
              Add section
            </Button>
          </div>

          {error && (
            <div className="p-4 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner size="md" color="primary" />
            </div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-lg shadow dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                No notes are filed under {topic.name} yet.
                {subtopicExtra > 0 && (
                  <>
                    {' '}
                    <Link
                      href={`/notes?topic=${topic.id}`}
                      className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      See the {subtopicExtra} {subtopicExtra === 1 ? 'note' : 'notes'} in its subtopics
                    </Link>
                  </>
                )}
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Use &ldquo;New note&rdquo; above, or add this topic to an existing note in the note editor.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <section
                key={group.section?.id ?? 'unsorted'}
                aria-labelledby={`section-${group.section?.id ?? 'unsorted'}`}
                className="p-4 bg-white rounded-lg shadow dark:bg-gray-800"
              >
                <h3
                  id={`section-${group.section?.id ?? 'unsorted'}`}
                  className="flex items-baseline gap-2 mb-2 text-base font-semibold md:text-base"
                >
                  <span className={group.section ? '' : 'text-gray-600 dark:text-gray-300'}>
                    {group.section?.name ?? 'Unsorted'}
                  </span>
                  <span className="text-xs font-normal text-gray-500 tabular-nums dark:text-gray-400">
                    {group.items.length}
                  </span>
                </h3>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {group.items.map((l) => {
                    const primaryId = primaryOf[l.note.id];
                    return (
                      <TopicNoteRow
                        key={l.note.id}
                        note={l.note}
                        sections={sections}
                        sectionId={l.section_id}
                        isPrimary={l.is_primary}
                        primaryElsewhere={
                          !l.is_primary && primaryId && graph.byId.has(primaryId)
                            ? { id: primaryId, name: nameOf(primaryId) }
                            : null
                        }
                        onMove={(sectionId) => handleMove(l.note.id, sectionId)}
                        moving={movingNoteId === l.note.id}
                      />
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      <TopicFormModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        topic={topic}
        onDeleted={() => {
          refreshCounts();
          router.push('/notes');
        }}
      />
      <SectionManagerModal
        isOpen={showSections}
        onClose={() => setShowSections(false)}
        topicId={topic.id}
        topicName={topic.name}
        sections={sections}
        itemCounts={sectionCounts}
        onChanged={() => load(true)}
      />
    </PageContainer>
  );
}
