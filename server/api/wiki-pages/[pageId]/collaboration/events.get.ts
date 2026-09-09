import { getQuery, getRouterParam } from 'h3';
import { z } from 'zod';
import { subscribeWikiCollaboration } from '../../../../lib/wiki-collaboration';
import { requireSessionUser } from '../../../../lib/security/auth';
import { registerServerStream } from '../../../../lib/server-streams';

const querySchema = z.object({ sessionId: z.string().uuid() });

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const pageId = getRouterParam(event, 'pageId')!;
  const { sessionId } = querySchema.parse(getQuery(event));
  const response = event.node.res;
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  let settled = false;
  let unregisterRoom = () => {};
  let unregisterStream = () => {};
  const send = (name: string, payload: unknown) => {
    if (settled || response.writableEnded) return;
    response.write(`event: ${name}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const close = () => {
    if (settled) return;
    settled = true;
    clearInterval(heartbeat);
    unregisterRoom();
    unregisterStream();
    if (!response.writableEnded) response.end();
    resolvePromise?.();
  };
  const heartbeat = setInterval(() => {
    if (!settled && !response.writableEnded) response.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15_000);
  heartbeat.unref();

  let resolvePromise: (() => void) | null = null;
  unregisterRoom = subscribeWikiCollaboration(pageId, sessionId, user, { send, close });
  unregisterStream = registerServerStream(close);
  event.node.req.once('close', close);
  send('ready', { pageId, sessionId });

  return new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
});
