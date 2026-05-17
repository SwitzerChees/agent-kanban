import { getRouterParam } from 'h3';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { getTaskDetail } from '../../../lib/kanban';
import { requireUser } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  getTaskDetail(taskId, user);

  const response = event.node.res;
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });

  let lastCreatedAt = new Date().toISOString();
  const write = (name: string, data: unknown) => {
    response.write(`event: ${name}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  write('ready', { taskId });

  return new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const rows = db.select().from(schema.activity)
        .where(eq(schema.activity.taskId, taskId))
        .orderBy(asc(schema.activity.createdAt))
        .all()
        .filter((row) => row.createdAt > lastCreatedAt);

      for (const row of rows) {
        lastCreatedAt = row.createdAt;
        write('activity', row);
      }
    }, 1000);

    event.node.req.on('close', () => {
      clearInterval(timer);
      resolve();
    });
  });
});
