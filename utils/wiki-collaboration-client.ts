import { RealtimeChannel, sendRealtimeRequest } from './realtime-channel';
import * as Y from 'yjs';
import { WIKI_COLLABORATION_META } from './wiki-collaboration-document';
import type { WikiCollaborationLease } from './wiki-collaboration-blocks';

export type WikiCollaborationStatus = 'connecting' | 'connected' | 'syncing' | 'offline';

export interface WikiCollaborationParticipant {
  sessionId: string;
  userId: string;
  userName: string;
  color: string;
  editing: boolean;
}

export interface WikiCollaborationPageUpdate {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export interface WikiCollaborationPresence {
  participants: WikiCollaborationParticipant[];
  leases: WikiCollaborationLease[];
}

export interface WikiCollaborationHandle {
  document: Y.Doc;
  sessionId: string;
  isConnected: () => boolean;
  setTitle: (title: string) => void;
  setPresence: (editing: boolean, blockId?: string | null) => void;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

interface WikiCollaborationOptions {
  onStatus: (status: WikiCollaborationStatus) => void;
  onPresence: (presence: WikiCollaborationPresence) => void;
  onPage: (page: WikiCollaborationPageUpdate) => void;
  onTitle: (title: string) => void;
  onReload: () => void;
  onTodoChange?: () => void;
}

interface SessionResponse extends WikiCollaborationPresence {
  sessionId: string;
  generation: string;
  state: string;
  page: WikiCollaborationPageUpdate;
}

const REMOTE_ORIGIN = Symbol('wiki-collaboration-remote');
const UPDATE_BATCH_MS = 120;
const PRESENCE_DEBOUNCE_MS = 80;
const HEARTBEAT_MS = 5_000;
const RETRY_INITIAL_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const OUTBOX_VERSION = 1;
const OUTBOX_PREFIX = 'agent-kanban:wiki-collaboration-outbox:';

interface StoredOutbox {
  version: typeof OUTBOX_VERSION;
  generation: string;
  update: string;
}

export async function openWikiCollaboration(pageId: string, options: WikiCollaborationOptions): Promise<WikiCollaborationHandle> {
  options.onStatus('connecting');
  const clientId = collaborationClientId();
  let session = await createSession(pageId, clientId);
  const document = new Y.Doc();
  Y.applyUpdate(document, decodeUpdate(session.state), REMOTE_ORIGIN);
  const titleMap = document.getMap<string>(WIKI_COLLABORATION_META);
  let generation = session.generation;
  let closed = false;
  let closing = false;
  let reloading = false;
  let flushing = false;
  let flushPromise: Promise<void> | null = null;
  let recoveryPromise: Promise<void> | null = null;
  let source: RealtimeChannel | null = null;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  let updateRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceTimer: ReturnType<typeof setTimeout> | null = null;
  let presencePromise: Promise<void> | null = null;
  let presenceRevision = 0;
  let queuedUpdates: Uint8Array[] = [];
  let inFlightUpdate: Uint8Array | null = null;
  let updateRetryDelayMs = RETRY_INITIAL_MS;
  let presenceRetryDelayMs = RETRY_INITIAL_MS;
  let desiredPresence = { editing: false, blockId: null as string | null };

  const storedOutbox = loadOutbox(pageId, clientId);
  if (storedOutbox?.generation === generation) {
    try {
      const pendingUpdate = decodeUpdate(storedOutbox.update);
      Y.applyUpdate(document, pendingUpdate, REMOTE_ORIGIN);
      queuedUpdates.push(pendingUpdate);
    } catch {
      clearOutbox(pageId, clientId);
    }
  }

  const requestReload = () => {
    if (closed || reloading) return;
    reloading = true;
    clearUpdateRetry();
    clearPresenceRetry();
    options.onReload();
  };

  const applyPresence = (payload: Partial<WikiCollaborationPresence>) => {
    options.onPresence({
      participants: Array.isArray(payload.participants) ? payload.participants : [],
      leases: Array.isArray(payload.leases) ? payload.leases : [],
    });
  };

  const onTitleChange = () => {
    options.onTitle(String(titleMap.get('title') ?? ''));
  };

  const onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (closed || origin === REMOTE_ORIGIN) return;
    queuedUpdates.push(update);
    persistOutbox();
    options.onStatus('syncing');
    scheduleFlush();
  };

  const clearUpdateRetry = () => {
    if (updateRetryTimer) clearTimeout(updateRetryTimer);
    updateRetryTimer = null;
  };

  const clearPresenceRetry = () => {
    if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
    presenceRetryTimer = null;
  };

  const resetUpdateRetry = () => {
    clearUpdateRetry();
    updateRetryDelayMs = RETRY_INITIAL_MS;
  };

  const resetPresenceRetry = () => {
    clearPresenceRetry();
    presenceRetryDelayMs = RETRY_INITIAL_MS;
  };

  const scheduleUpdateRetry = () => {
    if (updateRetryTimer || closed || closing || reloading || !queuedUpdates.length) return;
    const delay = updateRetryDelayMs;
    updateRetryDelayMs = Math.min(RETRY_MAX_MS, updateRetryDelayMs * 2);
    updateRetryTimer = setTimeout(() => {
      updateRetryTimer = null;
      void flush();
    }, delay);
  };

  const schedulePresenceRetry = () => {
    if (presenceRetryTimer || closed || closing || reloading) return;
    const delay = presenceRetryDelayMs;
    presenceRetryDelayMs = Math.min(RETRY_MAX_MS, presenceRetryDelayMs * 2);
    presenceRetryTimer = setTimeout(() => {
      presenceRetryTimer = null;
      void sendPresence();
    }, delay);
  };

  const persistOutbox = () => {
    const updates = [...(inFlightUpdate ? [inFlightUpdate] : []), ...queuedUpdates];
    if (!updates.length) {
      clearOutbox(pageId, clientId);
      return;
    }
    saveOutbox(pageId, clientId, generation, Y.mergeUpdates(updates));
  };

  const flush = async () => {
    if (recoveryPromise) await recoveryPromise;
    if (flushPromise) return flushPromise;
    if (!queuedUpdates.length) return;
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = null;
    flushPromise = (async () => {
      flushing = true;
      const update = Y.mergeUpdates(queuedUpdates);
      queuedUpdates = [];
      inFlightUpdate = update;
      persistOutbox();
      try {
        const response = await sendRealtimeRequest<{ page: WikiCollaborationPageUpdate } & WikiCollaborationPresence>('wiki_update', {
          pageId,
          sessionId: session.sessionId,
          update: encodeUpdate(update),
        });
        inFlightUpdate = null;
        persistOutbox();
        options.onPage(response.page);
        applyPresence(response);
        resetUpdateRetry();
        options.onStatus(queuedUpdates.length ? 'syncing' : source?.isConnected() ? 'connected' : 'connecting');
      } catch (error) {
        inFlightUpdate = null;
        queuedUpdates.unshift(update);
        persistOutbox();
        options.onStatus('offline');
        if (isSessionExpired(error) && !closing) void recoverSession();
        else if (isCollaborationReset(error)) requestReload();
        else scheduleUpdateRetry();
      } finally {
        flushing = false;
      }
    })();
    try {
      await flushPromise;
    } finally {
      flushPromise = null;
      if (queuedUpdates.length && !closed && !reloading && !updateRetryTimer) scheduleFlush();
    }
  };

  const scheduleFlush = (delay = UPDATE_BATCH_MS) => {
    if (updateTimer || flushing || closed || reloading) return;
    updateTimer = setTimeout(() => {
      updateTimer = null;
      void flush();
    }, delay);
  };

  const sendPresence = async () => {
    if (recoveryPromise) await recoveryPromise;
    if (closed || closing || reloading) return;
    if (presencePromise) return presencePromise;
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = null;
    const sentRevision = presenceRevision;
    const presence = { ...desiredPresence };
    presencePromise = (async () => {
      try {
        const response = await sendRealtimeRequest<WikiCollaborationPresence>('wiki_presence', {
          pageId,
          sessionId: session.sessionId,
          ...presence,
        });
        applyPresence(response);
        resetPresenceRetry();
        if (!queuedUpdates.length && !inFlightUpdate) {
          options.onStatus(source?.isConnected() ? 'connected' : 'connecting');
        }
      } catch (error) {
        options.onStatus('offline');
        if (isSessionExpired(error)) void recoverSession();
        else if (isCollaborationReset(error)) requestReload();
        else schedulePresenceRetry();
      }
    })();
    try {
      await presencePromise;
    } finally {
      presencePromise = null;
      if (presenceRevision !== sentRevision && !closed && !closing && !reloading) {
        if (presenceTimer) clearTimeout(presenceTimer);
        presenceTimer = setTimeout(() => {
          presenceTimer = null;
          void sendPresence();
        }, 0);
      }
    }
  };

  const setPresence = (editing: boolean, blockId: string | null = null) => {
    desiredPresence = { editing, blockId: editing ? blockId : null };
    presenceRevision += 1;
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      void sendPresence();
    }, PRESENCE_DEBOUNCE_MS);
  };

  const openRealtimeChannel = () => {
    source?.close();
    source = new RealtimeChannel('wiki', () => ({ pageId, sessionId: session.sessionId }));
    source.addEventListener('todo_changed', () => { if (!closed) options.onTodoChange?.(); });
    source.addEventListener('ready', () => {
      // Reload TODOs after every connection, including changes missed offline.
      options.onTodoChange?.();
      if (!queuedUpdates.length && !inFlightUpdate) {
        options.onStatus(source?.isConnected() ? 'connected' : 'connecting');
      }
    });
    source.addEventListener('sync', (event) => {
      const payload = eventPayload<SessionResponse>(event);
      if (!payload || payload.generation !== generation) return requestReload();
      Y.applyUpdate(document, decodeUpdate(payload.state), REMOTE_ORIGIN);
      options.onPage(payload.page);
      applyPresence(payload);
      if (!queuedUpdates.length && !inFlightUpdate) {
        options.onStatus(source?.isConnected() ? 'connected' : 'connecting');
      }
    });
    source.addEventListener('update', (event) => {
      const payload = eventPayload<{ generation: string; update: string; page: WikiCollaborationPageUpdate }>(event);
      if (!payload || payload.generation !== generation) return requestReload();
      Y.applyUpdate(document, decodeUpdate(payload.update), REMOTE_ORIGIN);
      options.onPage(payload.page);
      if (!queuedUpdates.length && !inFlightUpdate) options.onStatus('connected');
    });
    source.addEventListener('presence', (event) => {
      const payload = eventPayload<WikiCollaborationPresence>(event);
      if (payload) applyPresence(payload);
    });
    source.addEventListener('reload', () => requestReload());
    source.onerror = (event) => {
      if (closed || reloading) return;
      options.onStatus('offline');
      const payload = eventPayload<{ code?: string }>(event);
      if (payload?.code?.includes('session_expired')) void recoverSession();
    };
  };

  const recoverSession = async () => {
    if (recoveryPromise) return recoveryPromise;
    if (closed || closing || reloading) return;
    recoveryPromise = (async () => {
      options.onStatus('connecting');
      try {
        const replacement = await createSession(pageId, clientId);
        if (closed || closing || reloading) {
          await deleteSession(pageId, replacement.sessionId);
          return;
        }
        if (replacement.generation !== generation) {
          await deleteSession(pageId, replacement.sessionId);
          requestReload();
          return;
        }
        session = replacement;
        generation = replacement.generation;
        Y.applyUpdate(document, decodeUpdate(replacement.state), REMOTE_ORIGIN);
        options.onPage(replacement.page);
        applyPresence(replacement);
        resetUpdateRetry();
        resetPresenceRetry();
        openRealtimeChannel();
        setPresence(desiredPresence.editing, desiredPresence.blockId);
        if (queuedUpdates.length) {
          options.onStatus('syncing');
          scheduleFlush(0);
        } else {
          options.onStatus(source?.isConnected() ? 'connected' : 'connecting');
        }
      } catch {
        options.onStatus('offline');
        if (queuedUpdates.length) scheduleUpdateRetry();
        else schedulePresenceRetry();
      }
    })();
    try {
      await recoveryPromise;
    } finally {
      recoveryPromise = null;
    }
  };

  const handleOnline = () => {
    if (closed || closing || reloading) return;
    resetUpdateRetry();
    resetPresenceRetry();
    options.onStatus(queuedUpdates.length ? 'syncing' : 'connecting');
    if (queuedUpdates.length) void flush();
    else void sendPresence();
  };

  const heartbeat = setInterval(() => void sendPresence(), HEARTBEAT_MS);
  window.addEventListener('online', handleOnline);
  document.on('update', onDocumentUpdate);
  titleMap.observe(onTitleChange);
  openRealtimeChannel();
  options.onPage(session.page);
  applyPresence(session);
  onTitleChange();
  if (queuedUpdates.length) {
    options.onStatus('syncing');
    scheduleFlush(0);
  } else {
    options.onStatus('connecting');
  }

  return {
    document,
    get sessionId() { return session.sessionId; },
    isConnected: () => !closed && (source?.isConnected() ?? false),
    setTitle(title) {
      if (String(titleMap.get('title') ?? '') === title) return;
      titleMap.set('title', title);
    },
    setPresence,
    flush,
    async close() {
      if (closed) return;
      closing = true;
      if (updateTimer) clearTimeout(updateTimer);
      clearUpdateRetry();
      clearPresenceRetry();
      if (presenceTimer) clearTimeout(presenceTimer);
      clearInterval(heartbeat);
      window.removeEventListener('online', handleOnline);
      await flush();
      try {
        await sendRealtimeRequest('wiki_close', { pageId, sessionId: session.sessionId }, 2_000);
      } catch {
        // The short server lease releases presence after an abrupt disconnect.
      }
      source?.close();
      closed = true;
      document.off('update', onDocumentUpdate);
      titleMap.unobserve(onTitleChange);
      document.destroy();
    },
  };
}

function createSession(pageId: string, clientId: string) {
  return $fetch<SessionResponse>(`/api/wiki-pages/${pageId}/collaboration/session`, {
    method: 'POST',
    body: { clientId },
    timeout: 10_000,
  });
}

async function deleteSession(pageId: string, sessionId: string) {
  try {
    await $fetch(`/api/wiki-pages/${pageId}/collaboration/session`, {
      method: 'DELETE',
      body: { sessionId },
    });
  } catch {
    // The short server lease releases presence even when the tab disappears abruptly.
  }
}

function collaborationClientId() {
  const key = 'agent-kanban:wiki-collaboration-client';
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored) return stored;
    const id = globalThis.crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return globalThis.crypto.randomUUID();
  }
}

function eventPayload<T>(event: Event) {
  if (!(event instanceof MessageEvent)) return null;
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

function encodeUpdate(update: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < update.length; offset += 0x8000) {
    binary += String.fromCharCode(...update.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}

function decodeUpdate(value: string) {
  const binary = window.atob(value);
  const update = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) update[index] = binary.charCodeAt(index);
  return update;
}

function isSessionExpired(error: unknown) {
  const code = JSON.stringify(error);
  return code.includes('wiki_collaboration_session_expired');
}

function isCollaborationReset(error: unknown) {
  return JSON.stringify(error).includes('wiki_collaboration_reset');
}

function loadOutbox(pageId: string, clientId: string): StoredOutbox | null {
  try {
    const value = window.sessionStorage.getItem(outboxKey(pageId, clientId));
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredOutbox>;
    return parsed.version === OUTBOX_VERSION
      && typeof parsed.generation === 'string'
      && typeof parsed.update === 'string'
      ? parsed as StoredOutbox
      : null;
  } catch {
    return null;
  }
}

function saveOutbox(pageId: string, clientId: string, generation: string, update: Uint8Array) {
  try {
    window.sessionStorage.setItem(outboxKey(pageId, clientId), JSON.stringify({
      version: OUTBOX_VERSION,
      generation,
      update: encodeUpdate(update),
    } satisfies StoredOutbox));
  } catch {
    // In-memory retrying still works if private mode or a storage quota blocks persistence.
  }
}

function clearOutbox(pageId: string, clientId: string) {
  try {
    window.sessionStorage.removeItem(outboxKey(pageId, clientId));
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

function outboxKey(pageId: string, clientId: string) {
  return `${OUTBOX_PREFIX}${pageId}:${clientId}`;
}
