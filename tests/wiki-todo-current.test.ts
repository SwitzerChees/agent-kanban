import { afterAll, describe, expect, test } from 'vitest';
import { filterWikiTodoItems, type WikiTodoItemRecord } from '../utils/wiki-todos';

const originalTimezone = process.env.TZ;
afterAll(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

function item(id: string, completed: boolean, completedAt: string | null): WikiTodoItemRecord {
  return { id, text: id, listId: 'list', completed, completedAt, position: 0, updatedAt: '' };
}

describe('current TODO filter', () => {
  test('includes open entries and only completions in the local calendar day', () => {
    process.env.TZ = 'Europe/Zurich';
    const items = [
      item('open', false, null),
      item('yesterday', true, '2026-09-10T21:59:59.999Z'),
      item('midnight', true, '2026-09-10T22:00:00.000Z'),
      item('late', true, '2026-09-11T21:59:59.999Z'),
      item('tomorrow', true, '2026-09-11T22:00:00.000Z'),
      item('unknown', true, null),
      item('invalid', true, 'invalid'),
    ];
    expect(filterWikiTodoItems(items, 'current', new Date('2026-09-11T12:00:00Z')).map((i) => i.id)).toEqual(['open', 'midnight', 'late']);
    expect(filterWikiTodoItems(items, 'current', new Date('2026-09-11T22:00:00Z')).map((i) => i.id)).toEqual(['open', 'tomorrow']);
    expect(filterWikiTodoItems(items, 'all')).toEqual(items);
  });

  test.each([
    ['2026-03-29T12:00:00Z', '2026-03-28T23:00:00Z', '2026-03-29T21:59:59.999Z', '2026-03-29T22:00:00Z'],
    ['2026-10-25T12:00:00Z', '2026-10-24T22:00:00Z', '2026-10-25T22:59:59.999Z', '2026-10-25T23:00:00Z'],
  ])('handles the daylight-saving day at %s', (now, start, end, tomorrow) => {
    process.env.TZ = 'Europe/Zurich';
    const items = [item('start', true, start), item('end', true, end), item('tomorrow', true, tomorrow)];
    expect(filterWikiTodoItems(items, 'current', new Date(now)).map((i) => i.id)).toEqual(['start', 'end']);
  });
});
