import { describe, expect, it } from 'vitest';
import { renderPrompt } from '../server/lib/template';
import type { Issue } from '../server/lib/types';

const issue: Issue = {
  id: 'abc',
  identifier: 'MT-1',
  title: 'Test issue',
  description: null,
  priority: null,
  state: 'Todo',
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: null,
  updated_at: null,
};

describe('prompt rendering', () => {
  it('renders issue and attempt in strict mode', async () => {
    await expect(renderPrompt('Work on {{ issue.identifier }} attempt {{ attempt }}', issue, 2))
      .resolves.toBe('Work on MT-1 attempt 2');
  });

  it('fails on unknown variables', async () => {
    await expect(renderPrompt('Unknown {{ missing.value }}', issue, null))
      .rejects.toThrow();
  });
});
