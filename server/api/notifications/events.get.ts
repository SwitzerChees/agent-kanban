import { requireSessionUser } from '../../lib/security/auth';
import { registerServerStream } from '../../lib/server-streams';
import { listPendingTaskCompletionNotifications } from '../../lib/task-completion-notifications';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const response = event.node.res;
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const writePending = () => {
    for (const notification of listPendingTaskCompletionNotifications(user.id)) {
      response.write(`id: ${notification.notificationId}\n`);
      response.write('event: task_completed\n');
      response.write(`data: ${JSON.stringify(notification)}\n\n`);
    }
  };

  response.write(`event: ready\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);
  writePending();

  let heartbeatAt = Date.now();
  return new Promise<void>((resolve) => {
    let settled = false;
    const timer = setInterval(() => {
      writePending();
      if (Date.now() - heartbeatAt > 15_000) {
        heartbeatAt = Date.now();
        response.write(`: heartbeat ${heartbeatAt}\n\n`);
      }
    }, 1000);
    timer.unref();

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
