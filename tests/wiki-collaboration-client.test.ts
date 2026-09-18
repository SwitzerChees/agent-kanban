import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';
import { openWikiCollaboration, type WikiCollaborationStatus } from '../utils/wiki-collaboration-client';
import { createWikiCollaborationDocument, serializeWikiCollaborationDocument, WIKI_COLLABORATION_FIELD } from '../utils/wiki-collaboration-document';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class NativeSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: NativeSource[] = [];
  readyState = NativeSource.OPEN;
  constructor(public url: string) {
    super();
    NativeSource.instances.push(this);
  }
  close() { this.readyState = NativeSource.CLOSED; }
}

const pageId = 'offline-page';
const generation = 'stable-generation';
let storage: MemoryStorage;

beforeEach(() => {
  NativeSource.instances = [];
  storage = new MemoryStorage();
  vi.stubGlobal('EventSource', NativeSource);
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    sessionStorage: storage,
    atob: globalThis.atob.bind(globalThis),
    btoa: globalThis.btoa.bind(globalThis),
  }));
  vi.stubGlobal('document', new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('wiki collaboration offline recovery', () => {
  test('renews an expired lease without replacing the editable document', async () => {
    const serverDocument = createWikiCollaborationDocument('Runbook', 'Initial body');
    let sessionNumber = 0;
    let updateNumber = 0;
    const statuses: WikiCollaborationStatus[] = [];
    const reload = vi.fn();

    vi.stubGlobal('$fetch', vi.fn(async (url: string, options?: { method?: string; body?: Record<string, string> }) => {
      if (url.endsWith('/collaboration/session') && options?.method === 'POST') {
        sessionNumber += 1;
        return sessionResponse(`session-${sessionNumber}`, serverDocument);
      }
      if (url.endsWith('/collaboration/updates')) {
        updateNumber += 1;
        if (updateNumber === 1) throw { statusMessage: 'wiki_collaboration_session_expired' };
        const update = decodeUpdate(options?.body?.update ?? '');
        Y.applyUpdate(serverDocument, update);
        return { page: pageUpdate(serializeWikiCollaborationDocument(serverDocument).title), participants: [], leases: [] };
      }
      if (url.endsWith('/collaboration/presence')) return { participants: [], leases: [] };
      return { ok: true };
    }));

    const handle = await openWikiCollaboration(pageId, options(statuses, reload));
    const originalDocument = handle.document;
    handle.setTitle('Recovered offline title');
    appendBody(handle.document, ' typed while offline');

    await vi.waitFor(() => {
      expect(sessionNumber).toBe(2);
      expect(updateNumber).toBeGreaterThanOrEqual(2);
      expect(handle.sessionId).toBe('session-2');
    });

    expect(handle.document).toBe(originalDocument);
    expect(serializeWikiCollaborationDocument(handle.document).title).toBe('Recovered offline title');
    expect(serializeWikiCollaborationDocument(handle.document).content).toContain('typed while offline');
    expect(serializeWikiCollaborationDocument(serverDocument).title).toBe('Recovered offline title');
    expect(serializeWikiCollaborationDocument(serverDocument).content).toContain('typed while offline');
    expect(statuses).toContain('offline');
    expect(statuses.at(-1)).toBe('connected');
    expect(reload).not.toHaveBeenCalled();
    expect(outboxKeys()).toEqual([]);
    await handle.close();
  });

  test('restores unsent changes after a refresh and keeps retrying them', async () => {
    const serverDocument = createWikiCollaborationDocument('Runbook', 'Initial body');
    let sessionNumber = 0;
    const fetchMock = vi.fn(async (url: string, options?: { method?: string }) => {
      if (url.endsWith('/collaboration/session') && options?.method === 'POST') {
        sessionNumber += 1;
        return sessionResponse(`session-${sessionNumber}`, serverDocument);
      }
      if (url.endsWith('/collaboration/updates')) throw new Error('offline');
      if (url.endsWith('/collaboration/presence')) throw new Error('offline');
      return { ok: true };
    });
    vi.stubGlobal('$fetch', fetchMock);

    const first = await openWikiCollaboration(pageId, options([], vi.fn()));
    first.setTitle('Draft survives refresh');
    appendBody(first.document, ' and keeps the body');
    await first.flush();
    expect(outboxKeys()).toHaveLength(1);
    await first.close();

    const second = await openWikiCollaboration(pageId, options([], vi.fn()));
    expect(serializeWikiCollaborationDocument(second.document).title).toBe('Draft survives refresh');
    expect(serializeWikiCollaborationDocument(second.document).content).toContain('and keeps the body');
    expect(outboxKeys()).toHaveLength(1);
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/collaboration/updates')).length).toBeGreaterThanOrEqual(3));
    await second.close();
  });

  test('retries pending changes immediately when the browser comes back online', async () => {
    const serverDocument = createWikiCollaborationDocument('Runbook', 'Initial body');
    let updateNumber = 0;
    vi.stubGlobal('$fetch', vi.fn(async (url: string, options?: { method?: string; body?: Record<string, string> }) => {
      if (url.endsWith('/collaboration/session') && options?.method === 'POST') return sessionResponse('online-session', serverDocument);
      if (url.endsWith('/collaboration/updates')) {
        updateNumber += 1;
        if (updateNumber === 1) throw new Error('offline');
        Y.applyUpdate(serverDocument, decodeUpdate(options?.body?.update ?? ''));
        return { page: pageUpdate('Back online'), participants: [], leases: [] };
      }
      if (url.endsWith('/collaboration/presence')) return { participants: [], leases: [] };
      return { ok: true };
    }));

    const handle = await openWikiCollaboration(pageId, options([], vi.fn()));
    handle.setTitle('Back online');
    await handle.flush();
    expect(updateNumber).toBe(1);

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(updateNumber).toBe(2));
    expect(serializeWikiCollaborationDocument(serverDocument).title).toBe('Back online');
    expect(outboxKeys()).toEqual([]);
    await handle.close();
  });
});

function options(statuses: WikiCollaborationStatus[], onReload: () => void) {
  return {
    onStatus: (status: WikiCollaborationStatus) => statuses.push(status),
    onPresence: () => {},
    onPage: () => {},
    onTitle: () => {},
    onReload,
  };
}

function sessionResponse(sessionId: string, document: Y.Doc) {
  return {
    sessionId,
    generation,
    state: encodeUpdate(Y.encodeStateAsUpdate(document)),
    page: pageUpdate(serializeWikiCollaborationDocument(document).title),
    participants: [],
    leases: [],
  };
}

function pageUpdate(title: string) {
  return {
    id: pageId,
    title,
    content: 'Initial body',
    updatedAt: '2026-09-18T12:00:00.000Z',
    updatedBy: 'admin',
    updatedByName: 'Admin',
  };
}

function encodeUpdate(update: Uint8Array) {
  return Buffer.from(update).toString('base64');
}

function decodeUpdate(update: string) {
  return new Uint8Array(Buffer.from(update, 'base64'));
}

function appendBody(document: Y.Doc, text: string) {
  const paragraph = document.getXmlFragment(WIKI_COLLABORATION_FIELD).get(0) as Y.XmlElement;
  const paragraphText = paragraph.get(0) as Y.XmlText;
  paragraphText.insert(paragraphText.length, text);
}

function outboxKeys() {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key?.includes('wiki-collaboration-outbox')));
}
