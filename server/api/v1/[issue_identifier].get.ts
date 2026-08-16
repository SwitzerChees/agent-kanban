import { createError, getRouterParam } from 'h3';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../lib/db';
import { getTaskDetail } from '../../lib/kanban';
import { requireUser } from '../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const identifier = getRouterParam(event, 'issue_identifier');
  if (!identifier) {
    throw createError({ statusCode: 400, statusMessage: 'Missing issue identifier' });
  }

  const task = db.select().from(schema.tasks).where(eq(schema.tasks.key, identifier)).get();
  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: 'task_not_found',
      data: { error: { code: 'task_not_found', message: `Task ${identifier} is not tracked in local Kanban.` } },
    });
  }
  return getTaskDetail(task.id, user);
});
