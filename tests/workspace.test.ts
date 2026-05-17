import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { assertInsideRoot, sanitizeWorkspaceKey } from '../server/lib/workspace';

describe('workspace safety', () => {
  it('sanitizes issue identifiers for directory names', () => {
    expect(sanitizeWorkspaceKey('MT-123 / unsafe')).toBe('MT-123___unsafe');
  });

  it('allows workspaces inside the configured root', () => {
    const root = path.resolve('/tmp/symphony');
    expect(() => assertInsideRoot(root, path.join(root, 'MT-1'))).not.toThrow();
  });

  it('rejects paths outside the configured root', () => {
    const root = path.resolve('/tmp/symphony');
    expect(() => assertInsideRoot(root, '/tmp/other/MT-1')).toThrow(/escapes root/);
  });
});
