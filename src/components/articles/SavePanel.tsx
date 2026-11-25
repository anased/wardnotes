'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import NoteTopicPicker from '@/components/topics/NoteTopicPicker';
import TrialFormModal from '@/components/trials/TrialFormModal';
import { FlashcardService } from '@/services/flashcard';
import { ensurePrimary, type NoteTopicLink } from '@/lib/utils/noteTopicLinks';
import { guideToCards } from '@/lib/articles/note';
import { saveArticleFlashcards, saveSummaryNote, setArticleTrial } from '@/lib/supabase/articleReads';
import type { ArticleGuide, ArticleRead } from '@/lib/articles/types';
import type { FlashcardDeck } from '@/types/flashcard';

interface SavePanelProps {
  article: ArticleRead;
  guide: ArticleGuide | null;
  onChange: (patch: Partial<ArticleRead>) => void;
}

const linkClass = 'font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300';

/** Save what was learned: a summary note (with topics), flashcards, and a trial record. */
export default function SavePanel({ article, guide, onChange }: SavePanelProps) {
  // --- Summary note
  const [topics, setTopics] = useState<NoteTopicLink[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  const saveNote = async (): Promise<string | null> => {
    setSavingNote(true);
    setNoteError('');
    try {
      const { noteId } = await saveSummaryNote(article, guide, ensurePrimary(topics));
      onChange({ note_id: noteId });
      return noteId;
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Couldn't save the note.");
      return null;
    } finally {
      setSavingNote(false);
    }
  };

  // --- Flashcards
  const cards = useMemo(() => (guide ? guideToCards(guide.guide) : []), [guide]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [deckId, setDeckId] = useState('');
  const [savingCards, setSavingCards] = useState(false);
  const [cardsSaved, setCardsSaved] = useState<number | null>(null);
  const [cardsError, setCardsError] = useState('');

  useEffect(() => setChosen(new Set(cards.map((_, i) => i))), [cards]);
  useEffect(() => {
    if (!guide) return;
    FlashcardService.getDecks()
      .then((d) => {
        setDecks(d);
        setDeckId((current) => current || d[0]?.id || '');
      })
      .catch((err) => console.error('Error loading decks:', err));
  }, [guide]);

  const saveCards = async () => {
    setSavingCards(true);
    setCardsError('');
    try {
      const noteId = article.note_id ?? (await saveNote());
      if (!noteId) throw new Error('Save the summary note first.');
      const n = await saveArticleFlashcards(noteId, deckId, cards.filter((_, i) => chosen.has(i)));
      setCardsSaved(n);
    } catch (err) {
      setCardsError(err instanceof Error ? err.message : "Couldn't save the flashcards.");
    } finally {
      setSavingCards(false);
    }
  };

  // --- Trial record
  const isTrial = article.study_kind === 'rct' || article.study_kind === 'trial';
  const [trialOpen, setTrialOpen] = useState(false);

  return (
    <section aria-labelledby="save-heading" className="p-4 space-y-6 bg-white rounded-lg shadow dark:bg-gray-800">
      <h2 id="save-heading" className="text-lg font-medium">
        Save to WardNotes
      </h2>

      <div className="space-y-2">
        <h3 className="font-medium">Summary note</h3>
        {article.note_id ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Saved.{' '}
            <Link href={`/notes/${article.note_id}`} className={linkClass}>
              Open the note
            </Link>
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              The primer{guide ? ', key numbers and appraisal' : ''}, with a link to the article.
            </p>
            <NoteTopicPicker value={topics} onChange={setTopics} label="Topics (optional)" />
            <Button onClick={saveNote} isLoading={savingNote}>
              Save summary note
            </Button>
          </>
        )}
        {noteError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {noteError}
          </p>
        )}
      </div>

      {guide && cards.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Flashcards</h3>
          {cardsSaved !== null ? (
            <p className="text-sm text-gray-700 dark:text-gray-300" role="status">
              Saved {cardsSaved} card{cardsSaved === 1 ? '' : 's'}.{' '}
              <Link href="/flashcards" className={linkClass}>
                Go to flashcards
              </Link>
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                From the guide&apos;s questions. They&apos;re linked to the summary note{article.note_id ? '' : ', which is saved too'}.
              </p>
              <ul className="space-y-1">
                {cards.map((c, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={chosen.has(i)}
                        onChange={(e) =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            return next;
                          })
                        }
                      />
                      <span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{c.front}</span>
                        <span className="block text-gray-600 whitespace-pre-line dark:text-gray-400">{c.back}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {decks.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create a deck on the{' '}
                  <Link href="/flashcards" className={linkClass}>
                    Flashcards
                  </Link>{' '}
                  page first.
                </p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="sm:w-64">
                    <Select
                      label="Deck"
                      value={deckId}
                      onChange={(e) => setDeckId(e.target.value)}
                      options={decks.map((d) => ({ value: d.id, label: d.name }))}
                      className="mb-0"
                    />
                  </div>
                  <Button onClick={saveCards} isLoading={savingCards} disabled={chosen.size === 0 || !deckId} className="mb-4">
                    Save {chosen.size} card{chosen.size === 1 ? '' : 's'}
                  </Button>
                </div>
              )}
            </>
          )}
          {cardsError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {cardsError}
            </p>
          )}
        </div>
      )}

      {isTrial && (
        <div className="space-y-2">
          <h3 className="font-medium">Trial record</h3>
          {article.trial_id ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Saved.{' '}
              <Link href={`/trials/${article.trial_id}`} className={linkClass}>
                Open the trial
              </Link>
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add it to your trials with population, intervention, comparator and result filled in from the abstract.
              </p>
              <Button variant="outline" onClick={() => setTrialOpen(true)}>
                Create trial record
              </Button>
            </>
          )}
          <TrialFormModal
            isOpen={trialOpen}
            onClose={() => setTrialOpen(false)}
            defaultSource={article.pmid ?? article.doi ?? ''}
            onSaved={async (trial) => {
              await setArticleTrial(article.id, trial.id).catch((err) => console.error('Error linking trial:', err));
              onChange({ trial_id: trial.id });
            }}
          />
        </div>
      )}
    </section>
  );
}
