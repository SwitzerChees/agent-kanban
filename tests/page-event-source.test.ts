import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PageEventSource } from '../utils/page-event-source';

class NativeSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: NativeSource[] = [];
  readyState = 1;
  close = vi.fn(() => { this.readyState = 2; });
  constructor(public url: string) { super(); NativeSource.instances.push(this); }
}
let source: PageEventSource;
beforeEach(() => {
  NativeSource.instances = [];
  vi.stubGlobal('EventSource', NativeSource);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  source = new PageEventSource('/events');
});
afterEach(() => { source.close(); vi.unstubAllGlobals(); });

test('releases cached-page connections and resumes with all named-event handlers', () => {
  const receive = vi.fn();
  source.addEventListener('todo_changed', receive);
  const first = NativeSource.instances[0]!;
  first.dispatchEvent(new MessageEvent('todo_changed', { data: '{"version":1}', lastEventId: '1' }));
  expect(receive.mock.calls[0]?.[0]).toMatchObject({ data: '{"version":1}', lastEventId: '1' });
  window.dispatchEvent(new Event('pagehide'));
  expect(first.close).toHaveBeenCalledOnce();
  expect(source.readyState).toBe(NativeSource.CONNECTING);
  first.dispatchEvent(new MessageEvent('todo_changed'));
  expect(receive).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('pageshow'));
  window.dispatchEvent(new Event('pageshow'));
  expect(NativeSource.instances).toHaveLength(2);
  NativeSource.instances[1]!.dispatchEvent(new MessageEvent('todo_changed', { data: 'reconnected' }));
  expect(receive.mock.calls[1]?.[0].data).toBe('reconnected');
});

test('supports freeze/resume and does not resume after explicit cleanup', () => {
  document.dispatchEvent(new Event('freeze'));
  expect(NativeSource.instances[0]!.close).toHaveBeenCalledOnce();
  document.dispatchEvent(new Event('resume'));
  expect(NativeSource.instances).toHaveLength(2);
  source.close();
  expect(source.readyState).toBe(NativeSource.CLOSED);
  document.dispatchEvent(new Event('resume'));
  window.dispatchEvent(new Event('pageshow'));
  expect(NativeSource.instances).toHaveLength(2);
});

test('forwards errors, preserves once listeners, and honors listener removal', () => {
  const error = vi.fn();
  const removed = vi.fn();
  const once = vi.fn();
  source.onerror = error;
  source.addEventListener('ready', once, { once: true });
  source.addEventListener('ready', removed);
  source.removeEventListener('ready', removed);
  NativeSource.instances[0]!.dispatchEvent(new Event('error'));
  NativeSource.instances[0]!.dispatchEvent(new Event('ready'));
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
  NativeSource.instances[1]!.dispatchEvent(new Event('ready'));
  expect(error).toHaveBeenCalledOnce();
  expect(once).toHaveBeenCalledOnce();
  expect(removed).not.toHaveBeenCalled();
});


test('resumes cursor-based streams from the most recently received event', () => {
  source.close();
  let cursor = 4;
  source = new PageEventSource(() => `/events?after=${cursor}`);
  expect(NativeSource.instances[1]!.url).toBe('/events?after=4');
  cursor = 9;
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
  expect(NativeSource.instances[2]!.url).toBe('/events?after=9');
});
