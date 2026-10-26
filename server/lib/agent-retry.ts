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
    'service unavailable',
    'bad gateway',
    'gateway timeout',
  ].some(marker => message.includes(marker))
    || /"httpstatuscode"\s*:\s*(429|502|503|504)\b/.test(message);
}

export const MAX_AGENT_CAPACITY_RETRIES = 8;

// These waits live in task_agent_runs, outside the short in-process retry loop.
// Jitter spreads recovery attempts; the bound prevents a permanent outage from
// keeping a task alive indefinitely. A successful turn resets the counter.
export function agentCapacityRetryDelayMs(error: unknown, previousRetries: number, jitter = Math.random()) {
  if (!isRetryableAgentFailure(error) || !isTransientAgentCapacityFailure(error)
    || previousRetries >= MAX_AGENT_CAPACITY_RETRIES) return null;
  const base = 60_000 * 2 ** Math.max(0, previousRetries);
  return Math.min(15 * 60_000, base + Math.floor(Math.max(0, Math.min(1, jitter)) * 30_000));
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
