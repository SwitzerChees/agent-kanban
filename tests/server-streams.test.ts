import { describe, expect, it, vi } from 'vitest';
import { closeServerStreams, registerServerStream } from '../server/lib/server-streams';

describe('server stream shutdown', () => {
  it('closes every registered long-lived response once', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerServerStream(first);
    registerServerStream(second);

    closeServerStreams();
    closeServerStreams();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not close a response that unregistered normally', () => {
    const close = vi.fn();
    const unregister = registerServerStream(close);
    unregister();

    closeServerStreams();

    expect(close).not.toHaveBeenCalled();
  });
});
