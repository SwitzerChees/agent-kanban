import type { Task } from './db/schema';

export type TaskDescriptionSource = 'original' | 'refined';

type TaskDescriptionFields = Pick<Task, 'description' | 'refinedDescription' | 'descriptionSource'>;

/** Returns the description that is sent to search, cards, and AI execution. */
export function activeTaskDescription(task: TaskDescriptionFields): string | null {
  if (task.descriptionSource === 'refined' && task.refinedDescription?.trim()) {
    return task.refinedDescription;
  }
  return task.description;
}

/** Keeps the API backwards-compatible while exposing both persisted variants. */
export function publicTaskDescription<T extends TaskDescriptionFields>(task: T) {
  return {
    ...task,
    originalDescription: task.description,
    description: activeTaskDescription(task),
  };
}
