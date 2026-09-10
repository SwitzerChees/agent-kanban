import { reactive, watch } from 'vue';

interface AnswerQuestion {
  id: string;
  answer?: string | null;
}

export function useRefinementAnswers(
  runId: () => string | null,
  questions: () => AnswerQuestion[],
) {
  const answers = reactive<Record<string, string>>({});
  let previousAnswers = new Map<string, string>();

  watch([runId, questions], ([id, currentQuestions], [previousId]) => {
    if (id !== previousId) {
      for (const key of Object.keys(answers)) delete answers[key];
      previousAnswers.clear();
    }

    const serverAnswers = new Map(currentQuestions.map((question) => [question.id, question.answer || '']));
    for (const key of Object.keys(answers)) {
      if (!serverAnswers.has(key)) delete answers[key];
    }
    for (const [key, value] of serverAnswers) {
      // Refresh untouched fields, but never overwrite an unsent local edit.
      if (!(key in answers) || answers[key] === previousAnswers.get(key)) answers[key] = value;
    }
    previousAnswers = serverAnswers;
  }, { immediate: true });

  return answers;
}
