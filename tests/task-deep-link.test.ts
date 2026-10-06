import { describe, expect, test } from 'vitest';
import { parseTaskDeepLink, resolveTaskDeepLink } from '../utils/task-deep-link';
const projectId = '345d6e00-bac9-41da-ab04-8cb358dee495';
const taskId = '52ed9d68-4276-48da-b15a-a668417140fa';
describe('external task links', () => {
  test('accepts the THATEASY bridge URL after login', () => {
    expect(parseTaskDeepLink(`?project=${projectId}&task=${taskId}`)).toEqual({ projectId, taskId });
  });
  test('ignores incomplete, malformed and ambiguous links', () => {
    for (const query of ['?project=x&task=y', `?project=${projectId}`, `?project=${projectId}&task=${taskId}&task=${taskId}`]) expect(parseTaskDeepLink(query)).toBeNull();
  });
  test('resolves only a task in the authorized board returned by the server', () => {
    const link = { projectId, taskId };
    const task = { id: taskId };
    expect(resolveTaskDeepLink(link, projectId, [task])).toBe(task);
    expect(resolveTaskDeepLink(link, projectId, [])).toBeNull();
    expect(resolveTaskDeepLink(link, 'another-project', [task])).toBeNull();
  });
});
