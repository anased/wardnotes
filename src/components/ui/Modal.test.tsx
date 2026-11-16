import { fireEvent, render, screen } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  it('does not let a form inside the dialog submit a form that renders it', () => {
    const outerSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const innerSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

    render(
      <form onSubmit={outerSubmit}>
        <Modal isOpen onClose={() => {}} title="New Topic">
          <form onSubmit={innerSubmit}>
            <button type="submit">Create Topic</button>
          </form>
        </Modal>
      </form>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Topic' }));

    expect(innerSubmit).toHaveBeenCalledTimes(1);
    expect(outerSubmit).not.toHaveBeenCalled();
  });
});
