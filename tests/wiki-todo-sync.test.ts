import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import { useWikiTodoLists } from '../composables/useWikiTodoLists';

const lifecycle = vi.hoisted(() => ({ mount: () => {}, unmount: () => {} }));
vi.mock('vue', async (original) => ({
  ...await original<typeof import('vue')>(),
  onMounted: (fn: () => void) => { lifecycle.mount = fn; },
  onBeforeUnmount: (fn: () => void) => { lifecycle.unmount = fn; },
}));

class Source extends EventTarget {
  static OPEN = 1;
  static instances: Source[] = [];
  readyState = 1;
  close = vi.fn();
  constructor(public url: string) { super(); Source.instances.push(this); }
}
let requests: Array<{ url: string; signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: Error) => void }>;

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  Source.instances = [];
  vi.stubGlobal('EventSource', Source);
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
  const { lists } = useWikiTodoLists(() => 'project-a');
  lifecycle.mount();
  const source = Source.instances[0]!;
  source.dispatchEvent(new Event('ready'));
  source.dispatchEvent(new Event('changed'));
  expect(requests).toHaveLength(3);
  expect(requests[0]!.signal.aborted).toBe(true);
  requests[2]!.resolve({ lists: [{ id: 'newest' }] });
  await settle();
  requests[0]!.resolve({ lists: [{ id: 'stale' }] });
  requests[1]!.resolve({ lists: [{ id: 'also-stale' }] });
  await settle();
  expect(lists.value).toEqual([{ id: 'newest' }]);
  source.dispatchEvent(new Event('ready'));
  requests[3]!.resolve({ lists: [{ id: 'after-reconnect' }] });
  await settle();
  expect(lists.value).toEqual([{ id: 'after-reconnect' }]);
});

test('aborts old project requests and closes streams on navigation and unmount', async () => {
  const id = ref('project-a');
  const { lists } = useWikiTodoLists(() => id.value);
  lifecycle.mount();
  id.value = 'project-b';
  expect(Source.instances[0]!.close).toHaveBeenCalledOnce();
  expect(requests[0]!.signal.aborted).toBe(true);
  expect(requests[1]!.url).toContain('/project-b/');
  requests[0]!.resolve({ lists: [{ id: 'wrong-project' }] });
  await settle();
  expect(lists.value).toEqual([]);
  lifecycle.unmount();
  expect(requests[1]!.signal.aborted).toBe(true);
  expect(Source.instances[1]!.close).toHaveBeenCalledOnce();
  requests[1]!.resolve({ lists: [{ id: 'after-unmount' }] });
  await settle();
  expect(lists.value).toEqual([]);
});

test('polls while disconnected and catches up when a hidden tab becomes visible', () => {
  useWikiTodoLists(() => 'project-a');
  lifecycle.mount();
  vi.advanceTimersByTime(5_000);
  expect(requests).toHaveLength(1);
  Source.instances[0]!.readyState = 0;
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
  const { lists } = useWikiTodoLists(() => 'project-a');
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
