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

export async function openWikiCollaboration(pageId: string, options: WikiCollaborationOptions): Promise<WikiCollaborationHandle> {
  options.onStatus('connecting');
  const session = await $fetch<SessionResponse>(`/api/wiki-pages/${pageId}/collaboration/session`, {
    method: 'POST',
    body: { clientId: collaborationClientId() },
  });
  const document = new Y.Doc();
  Y.applyUpdate(document, decodeUpdate(session.state), REMOTE_ORIGIN);
  const titleMap = document.getMap<string>(WIKI_COLLABORATION_META);
  const generation = session.generation;
  let closed = false;
  let reloading = false;
  let flushing = false;
  let flushPromise: Promise<void> | null = null;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedUpdates: Uint8Array[] = [];
  let desiredPresence = { editing: false, blockId: null as string | null };

  const requestReload = () => {
    if (closed || reloading) return;
    reloading = true;
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
    options.onStatus('syncing');
    scheduleFlush();
  };

  const flush = async () => {
    if (flushPromise) return flushPromise;
    if (!queuedUpdates.length) return;
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = null;
    flushPromise = (async () => {
      flushing = true;
      const update = Y.mergeUpdates(queuedUpdates);
      queuedUpdates = [];
      try {
        const response = await $fetch<{ page: WikiCollaborationPageUpdate } & WikiCollaborationPresence>(`/api/wiki-pages/${pageId}/collaboration/updates`, {
          method: 'POST',
          body: { sessionId: session.sessionId, update: encodeUpdate(update) },
        });
        options.onPage(response.page);
        applyPresence(response);
        options.onStatus('connected');
      } catch (error) {
        queuedUpdates.unshift(update);
        options.onStatus('offline');
        if (isSessionReset(error)) requestReload();
        else if (!closed) {
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void flush();
          }, 1_000);
        }
      } finally {
        flushing = false;
      }
    })();
    try {
      await flushPromise;
    } finally {
      flushPromise = null;
      if (queuedUpdates.length && !closed && !reloading && !retryTimer) scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    if (updateTimer || flushing || closed || reloading) return;
    updateTimer = setTimeout(() => {
      updateTimer = null;
      void flush();
    }, UPDATE_BATCH_MS);
  };

  const sendPresence = async () => {
    if (closed || reloading) return;
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = null;
    try {
      const response = await $fetch<WikiCollaborationPresence>(`/api/wiki-pages/${pageId}/collaboration/presence`, {
        method: 'PATCH',
        body: { sessionId: session.sessionId, ...desiredPresence },
      });
      applyPresence(response);
      if (!queuedUpdates.length) options.onStatus('connected');
    } catch (error) {
      options.onStatus('offline');
      if (isSessionReset(error)) requestReload();
    }
  };

  const setPresence = (editing: boolean, blockId: string | null = null) => {
    desiredPresence = { editing, blockId: editing ? blockId : null };
    if (presenceTimer) clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      void sendPresence();
    }, PRESENCE_DEBOUNCE_MS);
  };

  const source = new EventSource(`/api/wiki-pages/${pageId}/collaboration/events?sessionId=${encodeURIComponent(session.sessionId)}`);
  source.addEventListener('ready', () => {
    if (!queuedUpdates.length) options.onStatus('connected');
  });
  source.addEventListener('sync', (event) => {
    const payload = eventPayload<SessionResponse>(event);
    if (!payload || payload.generation !== generation) return requestReload();
    Y.applyUpdate(document, decodeUpdate(payload.state), REMOTE_ORIGIN);
    options.onPage(payload.page);
    applyPresence(payload);
    if (!queuedUpdates.length) options.onStatus('connected');
  });
  source.addEventListener('update', (event) => {
    const payload = eventPayload<{ generation: string; update: string; page: WikiCollaborationPageUpdate }>(event);
    if (!payload || payload.generation !== generation) return requestReload();
    Y.applyUpdate(document, decodeUpdate(payload.update), REMOTE_ORIGIN);
    options.onPage(payload.page);
    if (!queuedUpdates.length) options.onStatus('connected');
  });
  source.addEventListener('presence', (event) => {
    const payload = eventPayload<WikiCollaborationPresence>(event);
    if (payload) applyPresence(payload);
  });
  source.addEventListener('reload', () => requestReload());
  source.onerror = () => {
    if (!closed && !reloading) options.onStatus('offline');
  };

  const heartbeat = setInterval(() => void sendPresence(), HEARTBEAT_MS);
  document.on('update', onDocumentUpdate);
  titleMap.observe(onTitleChange);
  options.onPage(session.page);
  applyPresence(session);
  onTitleChange();
  options.onStatus('connected');

  return {
    document,
    sessionId: session.sessionId,
    setTitle(title) {
      if (String(titleMap.get('title') ?? '') === title) return;
      titleMap.set('title', title);
    },
    setPresence,
    flush,
    async close() {
      if (closed) return;
      if (updateTimer) clearTimeout(updateTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (presenceTimer) clearTimeout(presenceTimer);
      clearInterval(heartbeat);
      source.close();
      await flush();
      while (queuedUpdates.length && !retryTimer && !reloading) await flush();
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.off('update', onDocumentUpdate);
      titleMap.unobserve(onTitleChange);
      try {
        await $fetch(`/api/wiki-pages/${pageId}/collaboration/session`, {
          method: 'DELETE',
          body: { sessionId: session.sessionId },
        });
      } catch {
        // The short server lease releases presence even when the tab disappears abruptly.
      }
      document.destroy();
    },
  };
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

function isSessionReset(error: unknown) {
  const code = JSON.stringify(error);
  return code.includes('wiki_collaboration_session_expired') || code.includes('wiki_collaboration_reset');
}
