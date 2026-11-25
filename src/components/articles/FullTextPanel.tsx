'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { findFullText, uploadArticlePdf, MAX_PDF_BYTES } from '@/lib/supabase/articleReads';
import type { ArticleRead, FullTextSource } from '@/lib/articles/types';

const SOURCE_LABELS: Record<Exclude<FullTextSource, 'none'>, string> = {
  pmc: 'Full text from PubMed Central',
  unpaywall: 'Full text from an open-access PDF',
  pdf: 'Full text from your PDF',
};

interface FullTextPanelProps {
  article: ArticleRead;
  /** Called with the refreshed article once full text was found or uploaded. */
  onChange: (article: ArticleRead) => void;
  /** Reloads the article from the database (after the server stored found full text). */
  reload: () => Promise<void>;
}

/**
 * Whether the article has full text. Without it, free full text is looked for once
 * (PubMed Central, then Unpaywall); if there's none, the user can upload the PDF.
 */
export default function FullTextPanel({ article, onChange, reload }: FullTextPanelProps) {
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const hasFullText = article.full_text_source !== 'none';

  useEffect(() => {
    if (hasFullText || searched || !article.pmid) return;
    let cancelled = false;
    setSearching(true);
    findFullText(article.id)
      .then(async (r) => {
        if (!cancelled && r.found) await reload();
      })
      .catch((err) => console.error('Full-text search failed:', err))
      .finally(() => {
        if (!cancelled) {
          setSearching(false);
          setSearched(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [article.id, article.pmid, hasFullText, searched, reload]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_PDF_BYTES) {
      setError('That PDF is larger than 25 MB.');
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadArticlePdf(article.id, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the PDF. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const picker = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Upload the article PDF"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <Button
        variant="outline"
        isLoading={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex-shrink-0"
      >
        {uploading ? 'Reading the PDF…' : hasFullText ? 'Replace with PDF' : 'Upload PDF'}
      </Button>
    </>
  );

  if (hasFullText) {
    const sections = article.sections?.length ?? 0;
    return (
      <div className="flex flex-col gap-3 p-4 bg-white rounded-lg shadow sm:flex-row sm:items-center sm:justify-between dark:bg-gray-800">
        <div className="flex items-start gap-2">
          <span className="inline-flex items-center px-2 py-0.5 mt-0.5 text-xs font-semibold rounded-full text-primary-900 bg-primary-100 dark:bg-primary-900/60 dark:text-primary-100">
            Full text
          </span>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {SOURCE_LABELS[article.full_text_source as Exclude<FullTextSource, 'none'>]}
            {sections > 0 && ` · ${sections} section${sections === 1 ? '' : 's'}`}
          </p>
        </div>
        {article.full_text_source !== 'pdf' && picker}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2 rounded-lg bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:ring-amber-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <span className="inline-flex items-center px-2 py-0.5 mt-0.5 text-xs font-semibold rounded-full text-amber-900 bg-amber-200 dark:bg-amber-800 dark:text-amber-100">
            Abstract only
          </span>
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {searching ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" color="primary" /> Looking for free full text…
              </span>
            ) : (
              'The primer is based on the abstract. Upload the PDF to get a reading guide.'
            )}
          </p>
        </div>
        {!searching && picker}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
