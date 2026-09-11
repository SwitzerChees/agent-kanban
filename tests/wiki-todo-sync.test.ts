import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import { useWikiTodoLists } from '../composables/useWikiTodoLists';

const lifecycle = vi.hoisted(() => ({ mount: () => {}, unmount: () => {} }));
vi.mock('vue', async (original) => ({
  ...await original<typeof import('vue')>(),
  onMounted: (fn: () => void) => { lifecycle.mount = fn; },
  onBeforeUnmount: (fn: () => void) => { lifecycle.unmount = fn; },
}));

let requests: Array<{ url: string; signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }>;

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  vi.stubGlobal('EventSource', vi.fn(() => { throw new Error('TODOs must share the Wiki connection'); }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('$fetch', (url: string, options: { signal: AbortSignal }) => new Promise((resolve, reject) => {
    requests.push({ url, signal: options.signal, resolve, reject });
  }));
});
afterEach(() => {
  lifecycle.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('refreshes on live changes and reconnects and ignores late stale responses', async () => {
  const { lists, refresh } = useWikiTodoLists(() => 'project-a', () => true);
  lifecycle.mount();
  void refresh();
  void refresh();
  expect(requests).toHaveLength(3);
  expect(requests[0]!.signal.aborted).toBe(true);
  requests[2]!.resolve({ lists: [{ id: 'newest' }] });
  await settle();
  requests[0]!.resolve({ lists: [{ id: 'stale' }] });
  requests[1]!.resolve({ lists: [{ id: 'also-stale' }] });
  await settle();
  expect(lists.value).toEqual([{ id: 'newest' }]);
  void refresh();
  requests[3]!.resolve({ lists: [{ id: 'after-reconnect' }] });
  await settle();
  expect(lists.value).toEqual([{ id: 'after-reconnect' }]);
});

test('aborts old project requests on navigation and unmount', async () => {
  const id = ref('project-a');
  const { lists } = useWikiTodoLists(() => id.value, () => true);
  lifecycle.mount();
  id.value = 'project-b';
  expect(requests[0]!.signal.aborted).toBe(true);
  expect(requests[1]!.url).toContain('/project-b/');
  requests[0]!.resolve({ lists: [{ id: 'wrong-project' }] });
  await settle();
  expect(lists.value).toEqual([]);
  lifecycle.unmount();
  expect(requests[1]!.signal.aborted).toBe(true);
  requests[1]!.resolve({ lists: [{ id: 'after-unmount' }] });
  await settle();
  expect(lists.value).toEqual([]);
});

test('polls while disconnected and catches up when a hidden tab becomes visible', () => {
  let connected = true;
  useWikiTodoLists(() => 'project-a', () => connected);
  lifecycle.mount();
  expect(EventSource).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5_000);
  expect(requests).toHaveLength(1);
  connected = false;
  vi.advanceTimersByTime(5_000);
  expect(requests).toHaveLength(2);
  Object.assign(document, { hidden: true });
  vi.advanceTimersByTime(5_000);
  expect(requests).toHaveLength(2);
  Object.assign(document, { hidden: false });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(requests).toHaveLength(3);
});

test('retries a failed snapshot even when the event stream remains connected', async () => {
  const { lists } = useWikiTodoLists(() => 'project-a', () => true);
  lifecycle.mount();
  requests[0]!.reject(new Error('Temporary network failure'));
  await settle();
  vi.advanceTimersByTime(5_000);
  expect(requests).toHaveLength(2);
  requests[1]!.resolve({ lists: [{ id: 'recovered' }] });
  await settle();
  expect(lists.value).toEqual([{ id: 'recovered' }]);
  vi.advanceTimersByTime(5_000);
  expect(requests).toHaveLength(2);
});
