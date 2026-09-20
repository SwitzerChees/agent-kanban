type RealtimeChannelName = 'wiki' | 'notifications' | 'task' | 'chat';

interface RealtimeEnvelope {
  type: string;
  subscriptionId?: string;
  requestId?: string;
  event?: string;
  payload?: unknown;
  cursor?: string | number;
  ok?: boolean;
  error?: string;
}

interface PendingRequest {
  envelope: RealtimeEnvelope;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RealtimeRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RealtimeRequestError';
  }
}

const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const HEARTBEAT_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;

class RealtimeConnection {
  private socket: WebSocket | null = null;
  private channels = new Map<string, RealtimeChannel>();
  private pending = new Map<string, PendingRequest>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = RECONNECT_INITIAL_MS;
  private lastPongAt = 0;
  private generation = 0;
  private started = false;

  add(channel: RealtimeChannel) {
    this.channels.set(channel.subscriptionId, channel);
    this.installLifecycleListeners();
    this.connect();
    if (this.socket?.readyState === WebSocket.OPEN) this.subscribe(channel);
  }

  remove(channel: RealtimeChannel) {
    if (this.channels.get(channel.subscriptionId) !== channel) return;
    this.channels.delete(channel.subscriptionId);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', subscriptionId: channel.subscriptionId });
    }
    this.stopWhenIdle();
  }

  connected(channel: RealtimeChannel) {
    return this.socket?.readyState === WebSocket.OPEN && channel.subscribed;
  }

  request<T>(action: string, payload: unknown, timeoutMs: number): Promise<T> {
    const requestId = globalThis.crypto.randomUUID();
    const envelope = { type: 'request', requestId, event: action, payload } satisfies RealtimeEnvelope;
    this.installLifecycleListeners();
    this.connect();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RealtimeRequestError('realtime_request_timeout'));
        this.stopWhenIdle();
      }, timeoutMs);
      this.pending.set(requestId, {
        envelope,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      if (this.socket?.readyState === WebSocket.OPEN) this.send(envelope);
    });
  }

  private connect() {
    if (this.socket || this.reconnectTimer || (!this.channels.size && !this.pending.size)) return;
    const generation = ++this.generation;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (generation !== this.generation || socket !== this.socket) return;
      this.reconnectDelay = RECONNECT_INITIAL_MS;
      this.lastPongAt = Date.now();
      for (const channel of this.channels.values()) this.subscribe(channel);
      for (const request of this.pending.values()) this.send(request.envelope);
      this.startHeartbeat();
    });
    socket.addEventListener('message', (event) => {
      if (generation !== this.generation || socket !== this.socket) return;
      this.receive(String(event.data));
    });
    socket.addEventListener('close', () => this.disconnected(generation, socket));
    socket.addEventListener('error', () => {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    });
  }

  private receive(raw: string) {
    let message: RealtimeEnvelope;
    try {
      message = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      return;
    }
    if (message.type === 'pong') {
      this.lastPongAt = Date.now();
      return;
    }
    if (message.type === 'response' && message.requestId) {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message.payload);
      else pending.reject(new RealtimeRequestError(message.error || 'realtime_request_failed'));
      this.stopWhenIdle();
      return;
    }
    if (!message.subscriptionId) return;
    const channel = this.channels.get(message.subscriptionId);
    if (!channel) return;
    if (message.type === 'subscribed') {
      channel.markSubscribed();
      return;
    }
    if (message.type === 'subscription_error') {
      channel.markError(message.error || 'realtime_subscription_failed');
      return;
    }
    if (message.type === 'event' && message.event) {
      channel.emit(message.event, message.payload, message.cursor);
    }
  }

  private disconnected(generation: number, socket: WebSocket) {
    if (generation !== this.generation || socket !== this.socket) return;
    this.socket = null;
    this.stopHeartbeat();
    for (const channel of this.channels.values()) channel.markDisconnected();
    if (!this.channels.size && !this.pending.size) return;
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.round(this.reconnectDelay * jitter);
    this.reconnectDelay = Math.min(RECONNECT_MAX_MS, this.reconnectDelay * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private subscribe(channel: RealtimeChannel) {
    channel.markConnecting();
    this.send({
      type: 'subscribe',
      subscriptionId: channel.subscriptionId,
      event: channel.channel,
      payload: channel.parameters(),
    });
  }

  private send(message: RealtimeEnvelope) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastPongAt >= HEARTBEAT_TIMEOUT_MS) {
        this.socket.close();
        return;
      }
      this.send({ type: 'ping' });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private resume = () => {
    if (!navigator.onLine) return;
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connect();
  };

  private installLifecycleListeners() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', this.resume);
    window.addEventListener('pageshow', this.resume);
    document.addEventListener('visibilitychange', this.resume);
  }

  private stopWhenIdle() {
    if (this.channels.size || this.pending.size) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    this.generation += 1;
    this.socket?.close(1000, 'idle');
    this.socket = null;
  }
}

const connection = new RealtimeConnection();

export class RealtimeChannel extends EventTarget {
  readonly subscriptionId = globalThis.crypto.randomUUID();
  subscribed = false;
  onerror: ((event: Event) => void) | null = null;
  private closed = false;

  constructor(
    readonly channel: RealtimeChannelName,
    private readonly params: Record<string, unknown> | (() => Record<string, unknown>) = {},
  ) {
    super();
    connection.add(this);
  }

  get readyState() {
    return this.closed ? WebSocket.CLOSED : this.isConnected() ? WebSocket.OPEN : WebSocket.CONNECTING;
  }

  isConnected() {
    return !this.closed && connection.connected(this);
  }

  parameters() {
    return typeof this.params === 'function' ? this.params() : this.params;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.subscribed = false;
    connection.remove(this);
  }

  markConnecting() {
    if (!this.closed) this.subscribed = false;
  }

  markSubscribed() {
    if (this.closed) return;
    this.subscribed = true;
    this.dispatchEvent(new Event('open'));
  }

  markDisconnected() {
    if (this.closed) return;
    this.subscribed = false;
    const event = new Event('error');
    this.dispatchEvent(event);
    this.onerror?.(event);
  }

  markError(code: string) {
    if (this.closed) return;
    this.subscribed = false;
    const event = new MessageEvent('error', { data: JSON.stringify({ code }) });
    this.dispatchEvent(event);
    this.onerror?.(event);
  }

  emit(type: string, payload: unknown, cursor?: string | number) {
    if (this.closed) return;
    this.dispatchEvent(new MessageEvent(type, {
      data: JSON.stringify(payload ?? null),
      lastEventId: cursor === undefined ? '' : String(cursor),
    }));
  }
}

export function sendRealtimeRequest<T>(action: string, payload: unknown, timeoutMs = 10_000) {
  return connection.request<T>(action, payload, timeoutMs);
}
