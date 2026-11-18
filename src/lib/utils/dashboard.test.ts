import {
  buildWeek,
  countThisWeek,
  previewText,
  reviewMinutes,
  startOfWeek,
} from './dashboard';

describe('reviewMinutes', () => {
  it('estimates about 25 seconds a card', () => {
    expect(reviewMinutes(0)).toBe(0);
    expect(reviewMinutes(1)).toBe(1);
    expect(reviewMinutes(14)).toBe(6);
  });
});

describe('startOfWeek / buildWeek', () => {
  // Wednesday, 18 Nov 2026, 15:00 UTC
  const now = new Date(Date.UTC(2026, 10, 18, 15));

  it('starts the week on Monday', () => {
    expect(startOfWeek(now).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    // Sunday belongs to the week that started the Monday before.
    expect(startOfWeek(new Date(Date.UTC(2026, 10, 22, 9))).toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('marks active, today and future days', () => {
    const week = buildWeek(now, ['2026-11-16', '2026-11-18', '2026-11-10']);
    expect(week.map((d) => d.label).join('')).toBe('MTWTFSS');
    expect(week.map((d) => d.active)).toEqual([true, false, true, false, false, false, false]);
    expect(week[2].isToday).toBe(true);
    expect(week.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
  });
});

describe('countThisWeek', () => {
  it('counts items since Monday', () => {
    const now = new Date(Date.UTC(2026, 10, 18, 15));
    const items = [
      { created_at: '2026-11-18T10:00:00Z' },
      { created_at: '2026-11-16T00:00:00Z' },
      { created_at: '2026-11-15T23:59:59Z' },
    ];
    expect(countThisWeek(items, now)).toBe(2);
  });
});

describe('previewText', () => {
  it('flattens whitespace and cuts on a word boundary', () => {
    expect(previewText('a\n\nb  c')).toBe('a b c');
    expect(previewText('one two three four', 12)).toBe('one two…');
  });
});
