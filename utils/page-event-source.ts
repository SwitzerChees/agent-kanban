/** Releases SSE sockets whenever a document is no longer the active page. */
export class PageEventSource extends EventTarget {
  private source: EventSource | null = null;
  private closed = false;
  private eventTypes = new Set(['error']);
  onerror: ((event: Event) => void) | null = null;

  constructor(
    private readonly url: string | (() => string),
    private readonly options: { suspendWhenHidden?: boolean } = {},
  ) {
    super();
    window.addEventListener('pagehide', this.suspend);
    window.addEventListener('pageshow', this.resume);
    if (this.suspendsWhenHidden) document.addEventListener('visibilitychange', this.syncVisibility);
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
    if (this.suspendsWhenHidden) document.removeEventListener('visibilitychange', this.syncVisibility);
    document.removeEventListener('freeze', this.suspend);
    document.removeEventListener('resume', this.resume);
  }

  private get suspendsWhenHidden() {
    return this.options.suspendWhenHidden !== false;
  }

  private suspend = () => {
    this.source?.close();
    this.source = null;
  };

  private resume = () => {
    if (this.closed || this.source || (this.suspendsWhenHidden && document.hidden)) return;
    this.source = new EventSource(typeof this.url === 'function' ? this.url() : this.url);
    for (const type of this.eventTypes) this.source.addEventListener(type, this.forward);
  };

  private syncVisibility = () => {
    if (document.hidden) this.suspend();
    else this.resume();
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
