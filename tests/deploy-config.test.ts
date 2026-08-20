import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

describe('production service configuration', () => {
  test('gives new task harnesses a persistent 4 GiB memory budget', () => {
    const service = readFileSync(path.resolve('deploy/agent-kanban.service'), 'utf8');

    expect(service).toContain('Environment=KANBAN_TASK_MEMORY_HIGH_MB=4096');
    expect(service).toContain('Environment=KANBAN_TASK_MEMORY_MAX_MB=4096');
  });
});
