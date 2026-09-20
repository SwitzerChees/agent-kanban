import { and, asc, eq, gt, notInArray } from 'drizzle-orm';
import type { Peer } from 'crossws';
import type { User } from '../../lib/db/schema';
import { db, schema } from '../../lib/db';
import { authorizeTaskAccess } from '../../lib/kanban';
import { authorizeProjectChat, listProjectChatEvents } from '../../lib/project-chat';
import { registerServerStream } from '../../lib/server-streams';
import { authenticateSessionToken, sessionCookieName } from '../../lib/security/auth';
import { listPendingTaskCompletionNotifications } from '../../lib/task-completion-notifications';
import {
  applyWikiCollaborationUpdate,
  closeWikiCollaborationSession,
  subscribeWikiCollaboration,
  updateWikiCollaborationPresence,
} from '../../lib/wiki-collaboration';

type Subscription = WikiSubscription | ChatSubscription | TaskSubscription | NotificationSubscription;

interface WikiSubscription {
  kind: 'wiki';
  pageId: string;
  sessionId: string;
  unsubscribe: () => void;
}

interface ChatSubscription {
  kind: 'chat';
  chatId: string;
  cursor: number;
}

interface TaskSubscription {
  kind: 'task';
  taskId: string;
  lastCreatedAt: string;
}

interface NotificationSubscription {
  kind: 'notifications';
}

interface ConnectionState {
  peer: Peer;
  user: User;
  sessionToken: string;
  subscriptions: Map<string, Subscription>;
  timer: ReturnType<typeof setInterval>;
  unregisterConnection: () => void;
  tick: number;
  nextAuthCheckAt: number;
}

interface ClientMessage {
  type?: string;
  subscriptionId?: string;
  requestId?: string;
  event?: string;
  payload?: unknown;
}

interface CachedResponse {
  expiresAt: number;
  message: Record<string, unknown>;
}

const MAX_MESSAGE_BYTES = 2_100_000;
const MAX_ID_LENGTH = 100;
const RESPONSE_CACHE_MS = 2 * 60_000;
const states = new Map<string, ConnectionState>();
const responses = new Map<string, CachedResponse>();

export default defineWebSocketHandler({
  upgrade(request) {
    validateOrigin(request);
    const token = cookieValue(request.headers.get('cookie'), sessionCookieName());
    const user = authenticateSessionToken(token);
    if (!user || !token) throw new Response('Unauthorized', { status: 401 });
    request.context.realtimeUser = user;
    request.context.realtimeSessionToken = token;
  },

  open(peer) {
    const user = peer.context.realtimeUser as User | undefined;
    const sessionToken = peer.context.realtimeSessionToken as string | undefined;
    if (!user || !sessionToken) {
      peer.close(1008, 'unauthorized');
      return;
    }
    const state = {
      peer,
      user,
      sessionToken,
      subscriptions: new Map(),
      timer: setInterval(() => tickConnection(peer.id), 250),
      unregisterConnection: () => {},
      tick: 0,
      nextAuthCheckAt: Date.now() + 30_000,
    } satisfies ConnectionState;
    state.timer.unref();
    state.unregisterConnection = registerServerStream(() => peer.close(1012, 'service restart'));
    states.set(peer.id, state);
    send(peer, { type: 'ready' });
  },

  async message(peer, incoming) {
    const state = states.get(peer.id);
    if (!state) return;
    if (incoming.uint8Array().byteLength > MAX_MESSAGE_BYTES) {
      peer.close(1009, 'message too large');
      return;
    }
    let message: ClientMessage;
    try {
      message = incoming.json<ClientMessage>();
    } catch {
      send(peer, { type: 'protocol_error', error: 'invalid_json' });
      return;
    }
    if (message.type === 'ping') {
      send(peer, { type: 'pong' });
      return;
    }
    if (message.type === 'subscribe') {
      subscribe(state, message);
      return;
    }
    if (message.type === 'unsubscribe') {
      if (validId(message.subscriptionId)) removeSubscription(state, message.subscriptionId);
      return;
    }
    if (message.type === 'request') await handleRequest(state, message);
  },

  close(peer) {
    closeConnection(peer.id);
  },

  error(peer) {
    closeConnection(peer.id);
  },
});

function subscribe(state: ConnectionState, message: ClientMessage) {
  const subscriptionId = message.subscriptionId;
  const channel = message.event;
  if (!validId(subscriptionId) || typeof channel !== 'string') return;
  removeSubscription(state, subscriptionId);
  try {
    const payload = record(message.payload);
    if (channel === 'wiki') {
      const pageId = requiredId(payload.pageId);
      const sessionId = requiredId(payload.sessionId);
      const subscription: WikiSubscription = {
        kind: 'wiki',
        pageId,
        sessionId,
        unsubscribe: () => {},
      };
      state.subscriptions.set(subscriptionId, subscription);
      subscription.unsubscribe = subscribeWikiCollaboration(pageId, sessionId, state.user, {
        send: (event, eventPayload) => sendEvent(state.peer, subscriptionId, event, eventPayload),
        close: () => {
          if (state.subscriptions.get(subscriptionId) !== subscription) return;
          state.subscriptions.delete(subscriptionId);
          send(state.peer, { type: 'subscription_error', subscriptionId, error: 'wiki_collaboration_closed' });
        },
      });
      send(state.peer, { type: 'subscribed', subscriptionId });
      sendEvent(state.peer, subscriptionId, 'ready', { pageId, sessionId });
      return;
    }
    if (channel === 'chat') {
      const chatId = requiredId(payload.chatId);
      authorizeProjectChat(chatId, state.user);
      const after = safeNonNegativeInteger(payload.after);
      state.subscriptions.set(subscriptionId, { kind: 'chat', chatId, cursor: after });
      send(state.peer, { type: 'subscribed', subscriptionId });
      pollChat(state, subscriptionId);
      return;
    }
    if (channel === 'task') {
      const taskId = requiredId(payload.taskId);
      authorizeTaskAccess(taskId, state.user);
      state.subscriptions.set(subscriptionId, { kind: 'task', taskId, lastCreatedAt: new Date().toISOString() });
      send(state.peer, { type: 'subscribed', subscriptionId });
      return;
    }
    if (channel === 'notifications') {
      state.subscriptions.set(subscriptionId, { kind: 'notifications' });
      send(state.peer, { type: 'subscribed', subscriptionId });
      pollNotifications(state, subscriptionId);
      return;
    }
    throw new Error('realtime_channel_unknown');
  } catch (error) {
    removeSubscription(state, subscriptionId);
    send(state.peer, {
      type: 'subscription_error',
      subscriptionId,
      error: errorCode(error, 'realtime_subscription_failed'),
    });
  }
}

async function handleRequest(state: ConnectionState, message: ClientMessage) {
  const requestId = message.requestId;
  if (!validId(requestId) || typeof message.event !== 'string') return;
  const cacheKey = `${state.user.id}:${requestId}`;
  const cached = responses.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    send(state.peer, cached.message);
    return;
  }
  let response: Record<string, unknown>;
  try {
    const payload = record(message.payload);
    let result: unknown;
    if (message.event === 'wiki_update') {
      const pageId = requiredId(payload.pageId);
      const sessionId = requiredId(payload.sessionId);
      requireWikiSubscription(state, pageId, sessionId);
      result = applyWikiCollaborationUpdate(pageId, sessionId, requiredString(payload.update), state.user);
    } else if (message.event === 'wiki_presence') {
      const pageId = requiredId(payload.pageId);
      const sessionId = requiredId(payload.sessionId);
      requireWikiSubscription(state, pageId, sessionId);
      result = updateWikiCollaborationPresence(pageId, sessionId, {
        editing: payload.editing === true,
        blockId: typeof payload.blockId === 'string' && payload.blockId.length <= 200 ? payload.blockId : null,
      }, state.user);
    } else if (message.event === 'wiki_close') {
      const pageId = requiredId(payload.pageId);
      const sessionId = requiredId(payload.sessionId);
      result = closeWikiCollaborationSession(pageId, sessionId, state.user);
    } else {
      throw new Error('realtime_action_unknown');
    }
    response = { type: 'response', requestId, ok: true, payload: result };
  } catch (error) {
    response = { type: 'response', requestId, ok: false, error: errorCode(error, 'realtime_request_failed') };
  }
  cacheResponse(cacheKey, response);
  send(state.peer, response);
}

function tickConnection(peerId: string) {
  const state = states.get(peerId);
  if (!state) return;
  state.tick += 1;
  if (Date.now() >= state.nextAuthCheckAt) {
    state.nextAuthCheckAt = Date.now() + 30_000;
    if (!authenticateSessionToken(state.sessionToken)) {
      state.peer.close(1008, 'session expired');
      closeConnection(peerId);
      return;
    }
  }
  for (const [subscriptionId, subscription] of state.subscriptions) {
    try {
      if (subscription.kind === 'chat') pollChat(state, subscriptionId);
      else if (state.tick % 4 === 0 && subscription.kind === 'task') pollTask(state, subscriptionId);
      else if (state.tick % 4 === 0 && subscription.kind === 'notifications') pollNotifications(state, subscriptionId);
    } catch (error) {
      send(state.peer, {
        type: 'subscription_error',
        subscriptionId,
        error: errorCode(error, 'realtime_poll_failed'),
      });
      removeSubscription(state, subscriptionId);
    }
  }
}

function pollChat(state: ConnectionState, subscriptionId: string) {
  const subscription = state.subscriptions.get(subscriptionId);
  if (subscription?.kind !== 'chat') return;
  const rows = listProjectChatEvents(subscription.chatId, subscription.cursor);
  for (const row of rows) {
    subscription.cursor = row.id;
    sendEvent(state.peer, subscriptionId, row.type, { ...row.payload, eventId: row.id }, row.id);
  }
}

function pollTask(state: ConnectionState, subscriptionId: string) {
  const subscription = state.subscriptions.get(subscriptionId);
  if (subscription?.kind !== 'task') return;
  const rows = db.select({ action: schema.activity.action, createdAt: schema.activity.createdAt })
    .from(schema.activity)
    .where(and(
      eq(schema.activity.taskId, subscription.taskId),
      gt(schema.activity.createdAt, subscription.lastCreatedAt),
      notInArray(schema.activity.action, ['codex_event']),
    ))
    .orderBy(asc(schema.activity.createdAt))
    .all();
  const latest = rows.at(-1);
  if (!latest) return;
  subscription.lastCreatedAt = latest.createdAt;
  sendEvent(state.peer, subscriptionId, 'activity', {
    taskId: subscription.taskId,
    count: rows.length,
    latestAction: latest.action,
    createdAt: latest.createdAt,
  });
}

function pollNotifications(state: ConnectionState, subscriptionId: string) {
  const subscription = state.subscriptions.get(subscriptionId);
  if (subscription?.kind !== 'notifications') return;
  for (const notification of listPendingTaskCompletionNotifications(state.user.id)) {
    sendEvent(state.peer, subscriptionId, 'task_completed', notification, notification.notificationId);
  }
}

function requireWikiSubscription(state: ConnectionState, pageId: string, sessionId: string) {
  const exists = [...state.subscriptions.values()].some((subscription) => (
    subscription.kind === 'wiki'
    && subscription.pageId === pageId
    && subscription.sessionId === sessionId
  ));
  if (!exists) throw new Error('realtime_wiki_subscription_required');
}

function removeSubscription(state: ConnectionState, subscriptionId: string) {
  const subscription = state.subscriptions.get(subscriptionId);
  if (!subscription) return;
  state.subscriptions.delete(subscriptionId);
  if (subscription.kind === 'wiki') subscription.unsubscribe();
}

function closeConnection(peerId: string) {
  const state = states.get(peerId);
  if (!state) return;
  states.delete(peerId);
  clearInterval(state.timer);
  state.unregisterConnection();
  for (const subscriptionId of [...state.subscriptions.keys()]) removeSubscription(state, subscriptionId);
}

function cacheResponse(key: string, message: Record<string, unknown>) {
  const now = Date.now();
  if (responses.size >= 5_000) {
    for (const [candidate, cached] of responses) {
      if (cached.expiresAt <= now) responses.delete(candidate);
    }
    if (responses.size >= 5_000) responses.delete(responses.keys().next().value!);
  }
  responses.set(key, { expiresAt: now + RESPONSE_CACHE_MS, message });
}

function sendEvent(peer: Peer, subscriptionId: string, event: string, payload: unknown, cursor?: string | number) {
  send(peer, { type: 'event', subscriptionId, event, payload, ...(cursor === undefined ? {} : { cursor }) });
}

function send(peer: Peer, message: Record<string, unknown>) {
  try {
    peer.send(JSON.stringify(message));
  } catch {
    peer.close(1011, 'send failed');
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 2_100_000) throw new Error('realtime_payload_invalid');
  return value;
}

function requiredId(value: unknown) {
  if (!validId(value)) throw new Error('realtime_payload_invalid');
  return value;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function safeNonNegativeInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function errorCode(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const candidate = error as { statusMessage?: unknown; message?: unknown };
    if (typeof candidate.statusMessage === 'string' && candidate.statusMessage) return candidate.statusMessage;
    if (typeof candidate.message === 'string' && /^[a-z0-9_]+$/i.test(candidate.message)) return candidate.message;
  }
  return fallback;
}

function cookieValue(header: string | null, name: string) {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function validateOrigin(request: Request | { url: string; headers: Headers }) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw new Response('Forbidden', { status: 403 });
  }
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const requestHost = request.headers.get('host');
  const allowed = [forwardedHost, requestHost].filter(Boolean).map((host) => host!.toLowerCase());
  if (!allowed.includes(originHost)) throw new Response('Forbidden', { status: 403 });
}
