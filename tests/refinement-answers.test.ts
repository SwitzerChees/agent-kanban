import { effectScope, nextTick, ref } from 'vue';
import { expect, test } from 'vitest';
import { useRefinementAnswers } from '../composables/useRefinementAnswers';

test('preserves unsent answers across polling and synchronizes untouched fields', async () => {
  const scope = effectScope();
  const run = ref('run-1');
  const questions = ref([{ id: 'q1', answer: '' }, { id: 'q2', answer: 'Saved' }]);
  const answers = scope.run(() => useRefinementAnswers(() => run.value, () => questions.value))!;
  try {
    answers.q1 = 'My unfinished answer';
    answers.q2 = '';
    for (let i = 0; i < 3; i++) {
      questions.value = questions.value.map((question) => ({ ...question }));
      await nextTick();
      expect({ ...answers }).toEqual({ q1: 'My unfinished answer', q2: '' });
    }
    questions.value = [...questions.value, { id: 'q3', answer: 'Initial' }];
    await nextTick();
    questions.value = questions.value.map((question) => ({ ...question, answer: 'Server update' }));
    await nextTick();
    expect({ ...answers }).toEqual({ q1: 'My unfinished answer', q2: '', q3: 'Server update' });

    questions.value = [{ id: 'new-round', answer: '' }];
    await nextTick();
    expect({ ...answers }).toEqual({ 'new-round': '' });
    answers['new-round'] = 'Draft from previous run';
    run.value = 'run-2';
    await nextTick();
    expect({ ...answers }).toEqual({ 'new-round': '' });
  } finally {
    scope.stop();
  }
});
