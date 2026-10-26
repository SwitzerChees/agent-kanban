import { describe, expect, test } from 'vitest';
import {
  agentCapacityRetryDelayMs,
  configuredAgentRetries,
  isTransientAgentCapacityFailure,
  MAX_AGENT_CAPACITY_RETRIES,
  runWithAgentRetries,
} from '../server/lib/agent-retry';

describe('agent retry policy', () => {
  test('recognizes Codex capacity and rate-limit failures as transient', () => {
    expect(isTransientAgentCapacityFailure(new Error(
      'turn_failed: {"error":{"message":"Selected model is at capacity. Please try a different model.","codexErrorInfo":"serverOverloaded"}}',
    ))).toBe(true);
    expect(isTransientAgentCapacityFailure(new Error('429 Too Many Requests: rate limit exceeded'))).toBe(true);
    expect(isTransientAgentCapacityFailure(new Error('turn_failed: {"error":{"codexErrorInfo":{"responseStreamDisconnected":{"httpStatusCode":503}}}}'))).toBe(true);
    expect(isTransientAgentCapacityFailure(new Error('503 Service Unavailable'))).toBe(true);
    expect(isTransientAgentCapacityFailure(new Error('completion_gate_failed: missing screenshots'))).toBe(false);
  });

  test('uses a bounded exponential cooldown and never defers quality or permission failures', () => {
    const error = new Error('exceeded retry limit, last status: 429 Too Many Requests');
    expect(Array.from({ length: MAX_AGENT_CAPACITY_RETRIES }, (_, attempt) =>
      agentCapacityRetryDelayMs(error, attempt, 0))).toEqual([
      60_000, 120_000, 240_000, 480_000, 900_000, 900_000, 900_000, 900_000,
    ]);
    expect(agentCapacityRetryDelayMs(error, 0, 1)).toBe(90_000);
    expect(agentCapacityRetryDelayMs(error, MAX_AGENT_CAPACITY_RETRIES)).toBeNull();
    expect(agentCapacityRetryDelayMs(new Error('completion_gate_failed: 503 Service Unavailable'), 0)).toBeNull();
    expect(agentCapacityRetryDelayMs(new Error('EACCES: rate_limit.json'), 0)).toBeNull();
    expect(agentCapacityRetryDelayMs(new Error('401 Unauthorized'), 0)).toBeNull();
  });

  test('retries a capacity failure without consuming more than the configured bound', async () => {
    const attempts: number[] = [];
    const result = await runWithAgentRetries({
      retries: configuredAgentRetries({ KANBAN_AGENT_RETRY_COUNT: '1' }),
      signal: new AbortController().signal,
      retryDelayMs: 0,
      shouldRetry: isTransientAgentCapacityFailure,
      run: async (attempt) => {
        attempts.push(attempt);
        if (attempt === 0) throw new Error('serverOverloaded');
        return 'rendered';
      },
    });

    expect(result).toBe('rendered');
    expect(attempts).toEqual([0, 1]);
  });

  test('does not retry non-capacity visual failures', async () => {
    const attempts: number[] = [];
    await expect(runWithAgentRetries({
      retries: 2,
      signal: new AbortController().signal,
      retryDelayMs: 0,
      shouldRetry: isTransientAgentCapacityFailure,
      run: async (attempt) => {
        attempts.push(attempt);
        throw new Error('completion_gate_failed: missing screenshots');
      },
    })).rejects.toThrow('completion_gate_failed');
    expect(attempts).toEqual([0]);
  });
});
