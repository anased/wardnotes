import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CardActionsMenu from './CardActionsMenu';
import ConfirmDeleteModal from './ConfirmDeleteModal';

describe('CardActionsMenu', () => {
  it('opens a menu with Edit and Delete that call their handlers', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    render(<CardActionsMenu itemLabel="CHANCE" onEdit={onEdit} onDelete={onDelete} />);

    const toggle = screen.getByRole('button', { name: 'Actions for CHANCE' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    render(<CardActionsMenu itemLabel="X" onEdit={jest.fn()} onDelete={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for X' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('ConfirmDeleteModal', () => {
  it('runs the delete and closes', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(
      <ConfirmDeleteModal isOpen onClose={onClose} title="Delete Note" onConfirm={onConfirm}>
        Sure?
      </ConfirmDeleteModal>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open and shows an error when the delete fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = jest.fn();
    render(
      <ConfirmDeleteModal isOpen onClose={onClose} title="Delete Note" onConfirm={() => Promise.reject(new Error('x'))}>
        Sure?
      </ConfirmDeleteModal>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete');
    expect(onClose).not.toHaveBeenCalled();
  });
});
