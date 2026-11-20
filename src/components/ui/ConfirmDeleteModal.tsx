import { ReactNode, useState } from 'react';
import Modal from './Modal';
import Button from './Button';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Performs the delete; the dialog closes when it resolves and shows the error if it throws. */
  onConfirm: () => Promise<void>;
}

/** "Are you sure?" dialog shared by the card delete actions. */
export default function ConfirmDeleteModal({ isOpen, onClose, title, children, onConfirm }: ConfirmDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (deleting) return;
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={title}>
      <div className="mb-4 text-gray-600 dark:text-gray-300">{children}</div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={close} disabled={deleting}>
          Cancel
        </Button>
        <Button
          isLoading={deleting}
          onClick={async () => {
            try {
              setDeleting(true);
              setError(null);
              await onConfirm();
              setDeleting(false);
              onClose();
            } catch (err) {
              console.error('Delete failed:', err);
              setError('Could not delete. Please try again.');
              setDeleting(false);
            }
          }}
        >
          Delete
        </Button>
      </div>
    </Modal>
  );
}
