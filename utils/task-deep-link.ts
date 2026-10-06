export interface TaskDeepLink { projectId: string; taskId: string; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTaskDeepLink(search: string): TaskDeepLink | null {
  const query = new URLSearchParams(search);
  const projectId = query.get('project');
  const taskId = query.get('task');
  if (!projectId || !taskId || !uuid.test(projectId) || !uuid.test(taskId)) return null;
  if (query.getAll('project').length !== 1 || query.getAll('task').length !== 1) return null;
  return { projectId, taskId };
}

export function resolveTaskDeepLink<T extends { id: string }>(link: TaskDeepLink, projectId: string, tasks: T[]): T | null {
  return link.projectId === projectId ? tasks.find(task => task.id === link.taskId) ?? null : null;
}
