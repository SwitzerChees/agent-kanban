// Run against an isolated built server, never production:
// KANBAN_QA_URL=http://127.0.0.1:3107 KANBAN_QA_EMAIL=... KANBAN_QA_PASSWORD=... node scripts/test-realtime-websocket.mjs
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import * as Y from 'yjs';

const base = new URL(process.env.KANBAN_QA_URL ?? 'http://127.0.0.1:3107');
assert(['localhost', '127.0.0.1'].includes(base.hostname) && base.protocol === 'http:' && base.port !== '3000', 'Use an isolated QA server');
const email = process.env.KANBAN_QA_EMAIL;
const password = process.env.KANBAN_QA_PASSWORD;
assert(email && password, 'Set KANBAN_QA_EMAIL and KANBAN_QA_PASSWORD');
let cookie = '';

async function api(path, { method, body } = {}) {
  const response = await fetch(new URL(`/api/${path}`, base), {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  cookie ||= response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return response.json();
}

async function rejectedUpgrade(headers, expectedStatus) {
  const socket = new WebSocket(wsUrl(), { headers });
  const status = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('upgrade rejection timed out')), 5_000);
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      resolve(response.statusCode);
    });
    socket.once('open', () => reject(new Error('upgrade unexpectedly succeeded')));
    socket.once('error', () => {});
  });
  assert.equal(status, expectedStatus);
}

class RealtimeTestClient {
  messages = [];
  waiters = [];

  constructor() {
    this.socket = new WebSocket(wsUrl(), { headers: { cookie, origin: base.origin } });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      this.messages.push(message);
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(message)) continue;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket open timed out')), 5_000);
      this.socket.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('error', reject);
    });
    await this.wait((message) => message.type === 'ready');
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  request(event, payload, requestId = crypto.randomUUID()) {
    this.send({ type: 'request', requestId, event, payload });
    return this.wait((message) => message.type === 'response' && message.requestId === requestId);
  }

  wait(predicate, timeout = 5_000) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error(`WebSocket message timed out; received ${JSON.stringify(this.messages)}`));
        }, timeout),
      };
      this.waiters.push(waiter);
    });
  }

  close() {
    this.socket.close();
  }
}

function wsUrl() {
  const url = new URL('/api/realtime', base);
  url.protocol = 'ws:';
  return url;
}

await rejectedUpgrade({ origin: base.origin }, 401);
await api('auth/login', { body: { email, password } });
await rejectedUpgrade({ cookie, origin: 'http://attacker.invalid' }, 403);

const stamp = Date.now().toString(36);
const { project } = await api('projects', {
  body: {
    name: `Realtime protocol ${stamp}`,
    key: `R${stamp}`.slice(0, 12),
    folderPath: `/tmp/realtime-protocol-${stamp}`,
    agentConcurrencyLimit: 0,
  },
});
const { page } = await api(`projects/${project.id}/wiki/pages`, {
  body: { title: 'Realtime page', content: 'First paragraph' },
});
const first = await api(`wiki-pages/${page.id}/collaboration/session`, {
  body: { clientId: 'realtime-protocol-first' },
});
const second = await api(`wiki-pages/${page.id}/collaboration/session`, {
  body: { clientId: 'realtime-protocol-second' },
});
const chat = await api(`projects/${project.id}/chats`, { body: {} });

const client = new RealtimeTestClient();
await client.open();
client.send({ type: 'subscribe', subscriptionId: 'wiki-a', event: 'wiki', payload: { pageId: page.id, sessionId: first.sessionId } });
client.send({ type: 'subscribe', subscriptionId: 'wiki-b', event: 'wiki', payload: { pageId: page.id, sessionId: second.sessionId } });
client.send({ type: 'subscribe', subscriptionId: 'notifications', event: 'notifications', payload: {} });
client.send({ type: 'subscribe', subscriptionId: 'chat', event: 'chat', payload: { chatId: chat.chat.id, after: 0 } });
await Promise.all(['wiki-a', 'wiki-b', 'notifications', 'chat'].map((subscriptionId) => (
  client.wait((message) => message.type === 'subscribed' && message.subscriptionId === subscriptionId)
)));

const document = new Y.Doc();
Y.applyUpdate(document, new Uint8Array(Buffer.from(first.state, 'base64')));
const firstBlock = document.getXmlFragment('default').get(0);
const blockId = String(firstBlock.getAttribute('collabId'));
const firstPresence = await client.request('wiki_presence', {
  pageId: page.id,
  sessionId: first.sessionId,
  editing: true,
  blockId,
});
assert.equal(firstPresence.ok, true);
assert.equal(firstPresence.payload.granted, true);
const secondPresence = await client.request('wiki_presence', {
  pageId: page.id,
  sessionId: second.sessionId,
  editing: true,
  blockId,
});
assert.equal(secondPresence.ok, true);
assert.equal(secondPresence.payload.granted, false);
assert.equal(secondPresence.payload.lockedBy.sessionId, first.sessionId);

const vector = Y.encodeStateVector(document);
document.getMap('wiki-meta').set('title', 'Realtime title saved');
const update = Buffer.from(Y.encodeStateAsUpdate(document, vector)).toString('base64');
const operationId = crypto.randomUUID();
const saved = await client.request('wiki_update', {
  pageId: page.id,
  sessionId: first.sessionId,
  update,
}, operationId);
assert.equal(saved.ok, true);
assert.equal(saved.payload.page.title, 'Realtime title saved');
await client.wait((message) => message.type === 'event'
  && message.subscriptionId === 'wiki-b'
  && message.event === 'update'
  && message.payload.page.title === 'Realtime title saved');

const duplicate = await client.request('wiki_update', {
  pageId: page.id,
  sessionId: first.sessionId,
  update,
}, operationId);
assert.deepEqual(duplicate, saved, 'a retried request must return the cached acknowledgement');

await api(`projects/${project.id}/wiki/todo-lists`, { body: { name: 'Realtime TODOs' } });
await client.wait((message) => message.type === 'event' && message.subscriptionId === 'wiki-a' && message.event === 'todo_changed');

client.send({ type: 'ping' });
await client.wait((message) => message.type === 'pong');
client.close();
console.log('PASS authenticated upgrade, origin protection, multiplexing, locks, confirmed Yjs updates, deduplication, TODO invalidation, and heartbeat');
