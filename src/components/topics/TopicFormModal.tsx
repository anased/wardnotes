import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TagInput from '../ui/TagInput';
import TopicSelect from './TopicSelect';
import useTopics from '@/lib/hooks/useTopics';
import { Topic, topicErrorMessage } from '@/lib/supabase/topics';
import {
  descendantIds,
  findTopicByName,
  matchTopics,
  normalizeTopicName,
  parentIds,
  topicKey,
} from '@/lib/utils/topicTree';

interface TopicFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Topic to edit; omit to create a new one. */
  topic?: Topic | null;
  /** Prefills for a new topic. */
  defaultName?: string;
  defaultParentIds?: string[];
  onSaved?: (topic: Topic) => void;
  /** Called after the topic was deleted (edit mode only). */
  onDeleted?: () => void;
}

/** Create or edit a topic: name, aliases, description and parents. */
export default function TopicFormModal({
  isOpen,
  onClose,
  topic,
  defaultName = '',
  defaultParentIds = [],
  onSaved,
  onDeleted,
}: TopicFormModalProps) {
  const { topics, graph, noteCounts, createTopic, updateTopic, deleteTopic } = useTopics();
  const editing = !!topic;

  const [name, setName] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [parents, setParents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form each time it opens
  useEffect(() => {
    if (!isOpen) return;
    setName(topic?.name ?? defaultName);
    setAliases(topic?.aliases ?? []);
    setDescription(topic?.description ?? '');
    setParents(topic ? parentIds(graph, topic.id) : defaultParentIds);
    setError('');
    setConfirmDelete(false);
  }, [isOpen, topic?.id]);

  const others = useMemo(() => topics.filter((t) => t.id !== topic?.id), [topics, topic?.id]);
  const trimmed = normalizeTopicName(name);
  const existing = trimmed ? findTopicByName(others, trimmed) : undefined;
  const similar = useMemo(
    () => (trimmed && !existing ? matchTopics(others, trimmed, 4).filter((m) => m.rank <= 3) : []),
    [others, trimmed, existing]
  );
  const aliasClash = aliases
    .map((a) => ({ alias: a, topic: findTopicByName(others, a) }))
    .find((x) => x.topic);

  // A topic can't go under itself or its own subtopics
  const excludeParents = useMemo(
    () => (topic ? descendantIds(graph, topic.id) : new Set<string>()),
    [graph, topic?.id]
  );

  const handleSave = async () => {
    if (!trimmed) {
      setError('Topic name is required');
      return;
    }
    if (existing) {
      setError(`"${existing.name}" already exists.`);
      return;
    }
    try {
      setSaving(true);
      setError('');
      const input = {
        name: trimmed,
        aliases,
        description: description.trim() || null,
        parentIds: parents,
      };
      const saved = editing ? await updateTopic(topic!.id, input) : await createTopic(input);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(topicErrorMessage(err, trimmed));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!topic) return;
    try {
      setSaving(true);
      await deleteTopic(topic.id);
      onClose();
      onDeleted?.();
    } catch (err) {
      setError(topicErrorMessage(err));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  if (confirmDelete && topic) {
    const count = noteCounts[topic.id] ?? 0;
    const subtopics = graph.children.get(topic.id)?.length ?? 0;
    return (
      <Modal isOpen={isOpen} onClose={() => setConfirmDelete(false)} title="Delete Topic">
        <p className="mb-4 text-gray-600 dark:text-gray-300">
          Delete &ldquo;{topic.name}&rdquo; and its sections? {count > 0 && `${count} ${count === 1 ? 'note stays' : 'notes stay'} in your library but will no longer be filed here. `}
          {subtopics > 0 &&
            `Its ${subtopics} ${subtopics === 1 ? 'subtopic is' : 'subtopics are'} kept and move up a level if this was their only parent. `}
          This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleDelete} isLoading={saving}>
            Delete
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Topic' : 'New Topic'} maxWidth="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        <div>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Small vessel disease"
            maxLength={120}
            required
          />
          {existing && (
            <p className="-mt-3 mb-4 text-xs text-amber-700 dark:text-amber-300" role="status">
              &ldquo;{existing.name}&rdquo; already exists
              {topicKey(existing.name) !== topicKey(trimmed) && ' (alias match)'}.{' '}
              <Link
                href={`/topics/${existing.id}`}
                onClick={onClose}
                className="underline text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
              >
                Open it
              </Link>
            </p>
          )}
          {similar.length > 0 && (
            <p className="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400">
              Similar: {similar.map((m) => m.topic.name + (m.matchedAlias ? ` (${m.matchedAlias})` : '')).join(', ')}
            </p>
          )}
        </div>

        <TagInput
          label="Aliases"
          value={aliases}
          onChange={setAliases}
          placeholder="Synonyms or abbreviations, e.g. RPLS"
          error={aliasClash ? `"${aliasClash.alias}" is already used by ${aliasClash.topic!.name}` : undefined}
        />

        <TopicSelect
          label="Parent topics"
          value={parents}
          onChange={setParents}
          excludeIds={excludeParents}
          placeholder="None — a top-level topic (e.g. a specialty)"
        />

        <div className="mb-4">
          <label
            htmlFor="topic-description"
            className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Description
          </label>
          <textarea
            id="topic-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional short description"
            className="input resize-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {editing ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              Delete topic
            </button>
          ) : (
            <span />
          )}
          <div className="flex space-x-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving} disabled={!!existing}>
              {editing ? 'Save' : 'Create Topic'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

