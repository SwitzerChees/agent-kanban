/** Releases SSE sockets when a document enters the back/forward cache. */
export class PageEventSource extends EventTarget {
  private source: EventSource | null = null;
  private closed = false;
  private eventTypes = new Set(['error']);
  onerror: ((event: Event) => void) | null = null;

  constructor(private readonly url: string | (() => string)) {
    super();
    window.addEventListener('pagehide', this.suspend);
    window.addEventListener('pageshow', this.resume);
    document.addEventListener('freeze', this.suspend);
    document.addEventListener('resume', this.resume);
    this.resume();
  }

  get readyState() {
    return this.source?.readyState ?? (this.closed ? EventSource.CLOSED : EventSource.CONNECTING);
  }

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    super.addEventListener(type, listener, options);
    if (this.eventTypes.has(type)) return;
    this.eventTypes.add(type);
    this.source?.addEventListener(type, this.forward);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.suspend();
    window.removeEventListener('pagehide', this.suspend);
    window.removeEventListener('pageshow', this.resume);
    document.removeEventListener('freeze', this.suspend);
    document.removeEventListener('resume', this.resume);
  }

  private suspend = () => {
    this.source?.close();
    this.source = null;
  };

  private resume = () => {
    if (this.closed || this.source) return;
    this.source = new EventSource(typeof this.url === 'function' ? this.url() : this.url);
    for (const type of this.eventTypes) this.source.addEventListener(type, this.forward);
  };

  private forward = (event: Event) => {
    if (this.closed || event.target !== this.source) return;
    const forwarded = event instanceof MessageEvent
      ? new MessageEvent(event.type, { data: event.data, origin: event.origin, lastEventId: event.lastEventId })
      : new Event(event.type);
    this.dispatchEvent(forwarded);
    if (event.type === 'error') this.onerror?.(forwarded);
  };
}
