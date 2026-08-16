import { getHeader, getQuery, getRouterParam } from 'h3';
import { authorizeProjectChat, listProjectChatEvents } from '../../../lib/project-chat';
import { requireSessionUser } from '../../../lib/security/auth';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const chatId = getRouterParam(event, 'chatId')!;
  authorizeProjectChat(chatId, user);

  const queryAfter = Number.parseInt(String(getQuery(event).after ?? '0'), 10);
  const headerAfter = Number.parseInt(getHeader(event, 'last-event-id') ?? '', 10);
  let cursor = Number.isFinite(headerAfter)
    ? Math.max(0, headerAfter)
    : Number.isFinite(queryAfter) ? Math.max(0, queryAfter) : 0;
  const response = event.node.res;
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ chatId, cursor })}\n\n`);

  let heartbeatAt = Date.now();
  return new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const rows = listProjectChatEvents(chatId, cursor);
      for (const row of rows) {
        cursor = row.id;
        response.write(`id: ${row.id}\n`);
        response.write(`event: ${row.type}\n`);
        response.write(`data: ${JSON.stringify({ ...row.payload, eventId: row.id })}\n\n`);
      }
      if (Date.now() - heartbeatAt > 15_000) {
        heartbeatAt = Date.now();
        response.write(`: heartbeat ${heartbeatAt}\n\n`);
      }
    }, 250);
    timer.unref();

    event.node.req.on('close', () => {
      clearInterval(timer);
      resolve();
    });
  });
});
