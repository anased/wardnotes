import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagFilterCombobox, { TagFilterOption } from './TagFilterCombobox';

const OPTIONS: TagFilterOption[] = [
  { name: 'Cardiology', count: 4 },
  { name: 'Clinical pearls', count: 51 },
  { name: 'ICH', count: 10 },
  { name: 'Stroke', count: 33 },
  { name: 'Stroke prevention', count: 2 },
];

function Harness({
  initial = [],
  options = OPTIONS,
  onChange,
}: {
  initial?: string[];
  options?: TagFilterOption[];
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <TagFilterCombobox
      options={options}
      value={tags}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

describe('TagFilterCombobox', () => {
  it('opens a multi-select listbox with usage counts on focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Tags' }));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    expect(within(listbox).getAllByRole('option')).toHaveLength(5);
    expect(within(listbox).getByRole('option', { name: /Clinical pearls\s*51/ })).toBeInTheDocument();
  });

  it('filters by typed text, with names that start with it first', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox'), 'str');

    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(['Stroke33', 'Stroke prevention2']);
  });

  it('matches case-insensitively in the middle of a name', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox'), 'PEARL');

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Clinical pearls');
  });

  it('selects several tags by clicking and marks them selected', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /^ICH/ }));
    await user.click(screen.getByRole('option', { name: /^Stroke\s*33/ }));

    expect(onChange).toHaveBeenLastCalledWith(['ICH', 'Stroke']);
    expect(screen.getByRole('option', { name: /^ICH/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Remove tag filter Stroke' })).toBeInTheDocument();
  });

  it('toggles a selected tag off when chosen again', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness initial={['ICH']} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /^ICH/ }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('supports keyboard navigation and Enter to toggle', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'st');
    // First match is highlighted; move to the second and select it
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getAllByRole('option')[1].id
    );
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['Stroke prevention']);
    // The query is cleared so the next tag can be typed
    expect(input).toHaveValue('');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('removes the last selected tag with Backspace on an empty input', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness initial={['ICH', 'Stroke']} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Backspace}');

    expect(onChange).toHaveBeenLastCalledWith(['ICH']);
  });

  it('removes a tag with its chip button', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Harness initial={['ICH', 'Stroke']} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Remove tag filter ICH' }));

    expect(onChange).toHaveBeenLastCalledWith(['Stroke']);
  });

  it('hides counts when they are unavailable', async () => {
    const user = userEvent.setup();
    render(<Harness options={[{ name: 'Stroke', count: null }]} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('option')).toHaveTextContent(/^Stroke$/);
  });
});
