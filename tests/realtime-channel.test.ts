import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RealtimeChannel, sendRealtimeRequest } from '../utils/realtime-channel';

class TestSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: TestSocket[] = [];
  readyState = TestSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];

  constructor(readonly url: string) {
    super();
    TestSocket.instances.push(this);
  }

  open() {
    this.readyState = TestSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }

  receive(message: Record<string, unknown>) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  close() {
    if (this.readyState === TestSocket.CLOSED) return;
    this.readyState = TestSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }
}

let channels: RealtimeChannel[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  TestSocket.instances = [];
  channels = [];
  vi.stubGlobal('WebSocket', TestSocket);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    location: { protocol: 'https:', host: 'kanban.example.test' },
  }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
});

afterEach(() => {
  for (const channel of channels) channel.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('multiplexed realtime connection', () => {
  test('shares one WebSocket and routes events to their logical channel', () => {
    const notification = track(new RealtimeChannel('notifications'));
    const chat = track(new RealtimeChannel('chat', { chatId: 'chat-1', after: 7 }));
    const received = vi.fn();
    chat.addEventListener('message_completed', received);

    expect(TestSocket.instances).toHaveLength(1);
    const socket = TestSocket.instances[0]!;
    expect(socket.url).toBe('wss://kanban.example.test/api/realtime');
    socket.open();

    const subscriptions = socket.sent.filter((message) => message.type === 'subscribe');
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions.map((message) => message.event)).toEqual(['notifications', 'chat']);
    socket.receive({ type: 'subscribed', subscriptionId: notification.subscriptionId });
    socket.receive({ type: 'subscribed', subscriptionId: chat.subscriptionId });
    socket.receive({
      type: 'event',
      subscriptionId: chat.subscriptionId,
      event: 'message_completed',
      cursor: 8,
      payload: { eventId: 8, content: 'done' },
    });

    expect(notification.isConnected()).toBe(true);
    expect(chat.isConnected()).toBe(true);
    expect(received).toHaveBeenCalledOnce();
    const event = received.mock.calls[0]![0] as MessageEvent;
    expect(event.lastEventId).toBe('8');
    expect(JSON.parse(event.data)).toMatchObject({ content: 'done' });
  });

  test('reconnects all channels with their latest cursor', async () => {
    let cursor = 3;
    const chat = track(new RealtimeChannel('chat', () => ({ chatId: 'chat-1', after: cursor })));
    const first = TestSocket.instances[0]!;
    first.open();
    first.receive({ type: 'subscribed', subscriptionId: chat.subscriptionId });
    cursor = 9;
    first.close();

    await vi.advanceTimersByTimeAsync(500);
    expect(TestSocket.instances).toHaveLength(2);
    const replacement = TestSocket.instances[1]!;
    replacement.open();
    expect(replacement.sent.find((message) => message.type === 'subscribe')?.payload).toEqual({
      chatId: 'chat-1',
      after: 9,
    });
  });

  test('reports an initial connection failure and retries it', async () => {
    const channel = track(new RealtimeChannel('notifications'));
    const onError = vi.fn();
    channel.onerror = onError;
    TestSocket.instances[0]!.close();

    expect(onError).toHaveBeenCalledOnce();
    expect(channel.isConnected()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(TestSocket.instances).toHaveLength(2);
  });

  test('resends an unacknowledged request with the same id after reconnect', async () => {
    const channel = track(new RealtimeChannel('wiki', { pageId: 'page-1', sessionId: 'session-1' }));
    const first = TestSocket.instances[0]!;
    first.open();
    first.receive({ type: 'subscribed', subscriptionId: channel.subscriptionId });
    const response = sendRealtimeRequest<{ saved: boolean }>('wiki_update', { update: 'binary' }, 5_000);
    const firstRequest = first.sent.find((message) => message.type === 'request')!;
    first.close();

    await vi.advanceTimersByTimeAsync(500);
    const replacement = TestSocket.instances[1]!;
    replacement.open();
    const retried = replacement.sent.find((message) => message.type === 'request')!;
    expect(retried.requestId).toBe(firstRequest.requestId);
    replacement.receive({
      type: 'response',
      requestId: retried.requestId,
      ok: true,
      payload: { saved: true },
    });
    await expect(response).resolves.toEqual({ saved: true });
  });
});

function track(channel: RealtimeChannel) {
  channels.push(channel);
  return channel;
}
