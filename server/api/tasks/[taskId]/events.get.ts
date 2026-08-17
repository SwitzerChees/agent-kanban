import { getRouterParam } from 'h3';
import { and, asc, eq, gt, notInArray } from 'drizzle-orm';
import { db, schema } from '../../../lib/db';
import { authorizeTaskAccess } from '../../../lib/kanban';
import { requireUser } from '../../../lib/security/auth';
import { registerServerStream } from '../../../lib/server-streams';

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  authorizeTaskAccess(taskId, user);

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
    let settled = false;
    const timer = setInterval(() => {
      const rows = db.select({
        action: schema.activity.action,
        createdAt: schema.activity.createdAt,
      }).from(schema.activity)
        .where(and(
          eq(schema.activity.taskId, taskId),
          gt(schema.activity.createdAt, lastCreatedAt),
          notInArray(schema.activity.action, ['codex_event']),
        ))
        .orderBy(asc(schema.activity.createdAt))
        .all();

      const latest = rows.at(-1);
      if (!latest) return;
      lastCreatedAt = latest.createdAt;
      // The client only needs one invalidation signal per polling interval.
      // Sending every low-level event used to trigger hundreds of concurrent
      // detail reloads during active Codex turns.
      write('activity', {
        taskId,
        count: rows.length,
        latestAction: latest.action,
        createdAt: latest.createdAt,
      });
    }, 1000);

    const close = () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      unregister();
      if (!response.writableEnded) response.end();
      resolve();
    };
    const unregister = registerServerStream(close);
    event.node.req.once('close', close);
  });
});
