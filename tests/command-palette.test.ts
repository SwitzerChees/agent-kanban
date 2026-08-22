import { describe, expect, test } from 'vitest';
import { commandPaletteTaskBuckets } from '../utils/command-palette';

describe('command palette task ranking', () => {
  const tasks = [
    { id: 'active-1', columnDone: false },
    { id: 'done-1', columnDone: true },
    { id: 'active-2', columnDone: false },
    { id: 'done-2', columnDone: true },
  ];

  test('separates completed matches so active work can render first', () => {
    expect(commandPaletteTaskBuckets(tasks, true)).toEqual({
      active: [tasks[0], tasks[2]],
      completed: [tasks[1], tasks[3]],
    });
  });

  test('keeps the idle palette concise while retaining completed work', () => {
    const manyTasks = [
      ...Array.from({ length: 8 }, (_, index) => ({ id: `active-${index}`, columnDone: false })),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `done-${index}`, columnDone: true })),
    ];
    const result = commandPaletteTaskBuckets(manyTasks, false);
    expect(result.active).toHaveLength(6);
    expect(result.completed).toHaveLength(3);
  });
});
