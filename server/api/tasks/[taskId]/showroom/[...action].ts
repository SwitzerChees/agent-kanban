import { createError, getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { showroomBody, showroomHandler } from '../../../../lib/showroom-http';
import { addTaskShowroomLink, createTaskShowroomSpec, removeTaskShowroomLink, startTaskShowroomRun,
  taskShowroomLinkInput, taskShowroomRunInput, taskShowroomSpecInput } from '../../../../lib/task-showroom';

export default showroomHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const action = getRouterParam(event, 'action')!;
  if (event.method === 'POST') {
    const body = await showroomBody(event);
    if (action === 'links') return addTaskShowroomLink(taskId, taskShowroomLinkInput.parse(body), user);
    if (action === 'specs') return createTaskShowroomSpec(taskId, taskShowroomSpecInput.parse(body), user);
    if (action === 'runs') return startTaskShowroomRun(taskId, taskShowroomRunInput.parse(body), user);
  }
  if (event.method === 'DELETE' && action.match(/^links\/[^/]+$/)) {
    await showroomBody(event);
    return removeTaskShowroomLink(taskId, action.split('/')[1]!, user);
  }
  throw createError({ statusCode: 404 });
});
