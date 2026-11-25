'use client';

import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { addArticle, type AddArticleResult } from '@/lib/supabase/articleReads';

interface AddArticleFormProps {
  onAdded: (result: AddArticleResult) => void;
}

/** "Add article" box: a PMID, DOI, PMC ID or link, then the primer (about 10 s). */
export default function AddArticleForm({ onAdded }: AddArticleFormProps) {
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!source.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await addArticle(source.trim());
      setSource('');
      onAdded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            aria-label="Article PMID, DOI or link"
            placeholder="Paste a PMID, DOI, or PubMed / journal link"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={busy}
            className="mb-0"
          />
        </div>
        <div>
          <Button type="submit" isLoading={busy} disabled={!source.trim()}>
            {busy ? 'Reading the abstract…' : 'Add article'}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="-mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : (
        <p className="-mt-2 text-sm text-gray-600 dark:text-gray-400">
          You&apos;ll get a quick primer: the question, the bottom line, and whether it&apos;s worth reading.
        </p>
      )}
    </form>
  );
}
