import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagInput from './TagInput';

function Harness({
  initial = [],
  suggestions = ['Cardiology', 'CHF', 'Cardiac arrest', 'Asthma'],
  onChange,
}: {
  initial?: string[];
  suggestions?: string[];
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <TagInput
      label="Tags"
      value={tags}
      suggestions={suggestions}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

const lastCall = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0];

describe('TagInput', () => {
  test('arrow keys move through suggestions and Enter selects the highlighted one', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'car');
    const options = screen.getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Cardiology', 'Cardiac arrest']);
    expect(options.every(o => o.getAttribute('aria-selected') === 'false')).toBe(true);

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    // Wraps around
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Enter}');
    expect(lastCall(onChange)).toEqual(['Cardiac arrest']);
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('Enter without a highlight adds the typed text', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByRole('combobox'), 'car{Enter}');
    expect(lastCall(onChange)).toEqual(['car']);
  });

  test('Escape closes the suggestions without adding a tag', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByRole('combobox'), 'car');
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('typed tags use the existing spelling and are not duplicated', async () => {
    const onChange = jest.fn();
    render(<Harness initial={['Asthma']} onChange={onChange} />);
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'chf{Enter}');
    expect(lastCall(onChange)).toEqual(['Asthma', 'CHF']);

    onChange.mockClear();
    await userEvent.type(input, 'ASTHMA{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('already-added tags are not suggested', async () => {
    render(<Harness initial={['cardiology']} />);

    await userEvent.type(screen.getByRole('combobox'), 'card');
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Cardiac arrest']);
  });

  test('clicking a suggestion adds it', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByRole('combobox'), 'ast');
    await userEvent.click(screen.getByRole('option', { name: 'Asthma' }));
    expect(lastCall(onChange)).toEqual(['Asthma']);
  });
});
