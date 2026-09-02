import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { canCompleteReviewedAgentTask } from '../utils/task-status-transition';

const review = { id: 'review', key: 'in_review', done: false };
const todo = { id: 'todo', key: 'todo', done: false };
const done = { id: 'done', key: 'done', done: true };

describe('task detail status transitions', () => {
  test('allows only a completed agent task to leave review for Done', () => {
    expect(canCompleteReviewedAgentTask('done', review, done)).toBe(true);
    expect(canCompleteReviewedAgentTask('running', review, done)).toBe(false);
    expect(canCompleteReviewedAgentTask('waiting_external', review, done)).toBe(false);
    expect(canCompleteReviewedAgentTask('failed', review, done)).toBe(false);
    expect(canCompleteReviewedAgentTask('done', todo, done)).toBe(false);
    expect(canCompleteReviewedAgentTask('done', review, todo)).toBe(false);
  });

  test('wires the guarded option list and the shared task update endpoint into the detail form', () => {
    const page = readFileSync(new URL('../pages/index.vue', import.meta.url), 'utf8');

    expect(page).toContain('data-testid="task-status-select"');
    expect(page).toContain(':items="taskColumnItems"');
    expect(page).toContain(':disabled="hasAgentActivity && !canChangeLockedTaskStatus"');
    expect(page).toContain('columnId: changedColumnId');
    expect(page).toContain("await $fetch(`/api/tasks/${taskId}`");
  });
});
