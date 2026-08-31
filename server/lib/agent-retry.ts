export function configuredAgentRetries(env: NodeJS.ProcessEnv = process.env) {
  const requested = Number.parseInt(env.KANBAN_AGENT_RETRY_COUNT ?? '1', 10);
  return Number.isFinite(requested) ? Math.min(2, Math.max(0, requested)) : 1;
}

export async function runWithAgentRetries<T>(options: {
  retries: number;
  signal: AbortSignal;
  run: (attempt: number) => Promise<T>;
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
  retryDelayMs?: number;
}) {
  const retries = Math.min(2, Math.max(0, Math.trunc(options.retries)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.signal.aborted) throw new Error('turn_cancelled');
    try {
      return await options.run(attempt);
    } catch (error) {
      lastError = error;
      if (options.signal.aborted || attempt >= retries || options.shouldRetry?.(error) === false) throw error;
      await options.onRetry?.(attempt + 1, error);
      await abortableDelay(options.retryDelayMs ?? 1_500, options.signal);
    }
  }
  throw lastError;
}

export function isRetryableAgentFailure(error: unknown) {
  const message = errorMessage(error);
  return ![
    'completion_gate_failed:',
    'Autonomous quality gate still failing',
    'autonomous limit reached:',
    'maxTokens reached',
    'maxTurns reached',
    'maxContinuations reached',
    'turn_cancelled',
    'read-only file system',
    'EROFS:',
    'EACCES:',
  ].some((marker) => message.includes(marker));
}

export function isTransientAgentCapacityFailure(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return [
    'serveroverloaded',
    'selected model is at capacity',
    'server is at capacity',
    'server overloaded',
    'server is overloaded',
    'too many requests',
    'rate limit exceeded',
    'ratelimit',
    'rate_limit',
  ].some(marker => message.includes(marker));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? '');
}

function abortableDelay(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new Error('turn_cancelled'));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    timer.unref();
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('turn_cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
