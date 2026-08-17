type StreamCloser = () => void;

const streamClosers = new Set<StreamCloser>();
let signalsInstalled = false;

export function registerServerStream(closer: StreamCloser) {
  streamClosers.add(closer);
  return () => streamClosers.delete(closer);
}

export function closeServerStreams() {
  for (const close of [...streamClosers]) close();
  streamClosers.clear();
}

export function installServerStreamShutdown() {
  if (signalsInstalled) return;
  signalsInstalled = true;
  // Nitro waits for open HTTP connections before it runs application close
  // hooks. Ending long-lived SSE responses at signal time keeps deploys from
  // exhausting systemd's stop timeout while a board or chat is open.
  process.prependListener('SIGTERM', closeServerStreams);
  process.prependListener('SIGINT', closeServerStreams);
}
