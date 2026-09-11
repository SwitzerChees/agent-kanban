import { getRouterParam } from 'h3';
import { getProject } from '../../../../../lib/kanban';
import { requireSessionUser } from '../../../../../lib/security/auth';
import { registerServerStream } from '../../../../../lib/server-streams';
import { subscribeWikiTodoChanges } from '../../../../../lib/wiki-todo-events';

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'projectId')!;
  const authorize = () => getProject(projectId, requireSessionUser(event));
  authorize();
  const response = event.node.res;
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  return new Promise<void>((resolve) => {
    let settled = false;
    const close = () => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      unsubscribe();
      unregister();
      if (!response.writableEnded) response.end();
      resolve();
    };
    const send = (name: string) => {
      if (settled || response.writableEnded) return;
      try {
        authorize();
        response.write(`event: ${name}\ndata: {}\n\n`);
      } catch {
        close();
      }
    };
    const unsubscribe = subscribeWikiTodoChanges(projectId, () => send('changed'));
    const unregister = registerServerStream(close);
    const heartbeat = setInterval(() => send('heartbeat'), 15_000);
    heartbeat.unref();
    event.node.req.once('close', close);
    // Reload on every connection, including reconnects after missed events.
    send('ready');
  });
});
