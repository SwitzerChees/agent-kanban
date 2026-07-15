import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  createRefinementToolWorkspace,
  executeRefinementDynamicToolCall,
  REFINEMENT_TOOL_NAMESPACE,
  type RefinementToolWorkspace,
} from '../server/lib/refinement-tools';

const root = mkdtempSync(path.join(tmpdir(), 'agent-kanban-refinement-tools-'));
const workspacePath = path.join(root, 'workspace');
const outsidePath = path.join(root, 'outside');
const imagegenSkillPath = path.join(root, 'trusted-imagegen.md');
let workspace: RefinementToolWorkspace;

beforeAll(async () => {
  mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
  mkdirSync(outsidePath, { recursive: true });
  writeFileSync(path.join(workspacePath, 'src', 'feature.ts'), [
    'export const literal = "a+b[0]";',
    'export function feature() {',
    '  return literal;',
    '}',
  ].join('\n'));
  writeFileSync(path.join(workspacePath, 'README.md'), '# Project\nLiteral a+b[0].\n');
  writeFileSync(path.join(workspacePath, '.env'), 'TOP_SECRET=do-not-read\n');
  writeFileSync(path.join(outsidePath, 'secret.txt'), 'outside secret\n');
  symlinkSync(path.join(outsidePath, 'secret.txt'), path.join(workspacePath, 'secret-link.txt'));
  symlinkSync(outsidePath, path.join(workspacePath, 'outside-link'));
  writeFileSync(imagegenSkillPath, '# Trusted image generation instructions\nUse the built-in tool.\n');

  execFileSync('git', ['init', '-q'], { cwd: workspacePath });
  execFileSync('git', ['add', 'README.md', 'src/feature.ts'], { cwd: workspacePath });
  execFileSync('git', [
    '-c', 'user.name=Test',
    '-c', 'user.email=test@example.com',
    'commit', '-qm', 'Initial fixture',
  ], { cwd: workspacePath });
  writeFileSync(path.join(workspacePath, 'README.md'), '# Project\nChanged a+b[0].\n');

  workspace = await createRefinementToolWorkspace(workspacePath, { imagegenSkillPath });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('refinement dynamic read tools', () => {
  test('lists a bounded tree without following symlinks or exposing secret files', async () => {
    const response = await call('list_files', { path: '.', maxDepth: 4, maxEntries: 100 });
    expect(response.success).toBe(true);
    const payload = parsePayload(response);
    const entries = payload.result.entries as Array<{ path: string; type: string }>;
    expect(entries).toContainEqual(expect.objectContaining({ path: 'src/feature.ts', type: 'file' }));
    expect(entries).toContainEqual({ path: 'outside-link', type: 'symlink' });
    expect(entries).toContainEqual({ path: 'secret-link.txt', type: 'symlink' });
    expect(entries.some((entry) => entry.path === '.env')).toBe(false);
    expect(entries.some((entry) => entry.path.includes('secret.txt'))).toBe(false);
  });

  test('searches for a fixed string rather than interpreting regex syntax', async () => {
    const response = await call('search_code', {
      path: '.',
      query: 'a+b[0]',
      caseSensitive: true,
      maxMatches: 20,
    });
    expect(response.success).toBe(true);
    const payload = parsePayload(response);
    expect(payload.result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'README.md', line: 2 }),
      expect.objectContaining({ path: 'src/feature.ts', line: 1 }),
    ]));
    expect(JSON.stringify(payload)).not.toContain('outside secret');
  });

  test('reads constrained line ranges and rejects traversal, sensitive files, and symlink escapes', async () => {
    const response = await call('read_file', { path: 'src/feature.ts', startLine: 2, maxLines: 2 });
    expect(response.success).toBe(true);
    expect(parsePayload(response).result).toMatchObject({
      path: 'src/feature.ts',
      startLine: 2,
      endLine: 3,
    });
    expect(parsePayload(response).result.content).toContain('2: export function feature()');

    await expectDenied('read_file', { path: '../outside/secret.txt' }, 'path_traversal_denied');
    await expectDenied('read_file', { path: path.join(outsidePath, 'secret.txt') }, 'path_must_be_relative');
    await expectDenied('read_file', { path: '.env' }, 'sensitive_file_denied');
    await expectDenied('read_file', { path: 'secret-link.txt' }, 'symlink_denied');
    await expectDenied('list_files', { path: 'outside-link' }, 'symlink_denied');
  });

  test('returns a read-only Git summary through fixed argv execution', async () => {
    const response = await call('git_summary', {});
    expect(response.success).toBe(true);
    expect(parsePayload(response).result).toMatchObject({
      isRepository: true,
      revision: { subject: 'Initial fixture' },
    });
    expect(parsePayload(response).result.status).toContain('README.md');
  });

  test('exposes only the fixed trusted image-generation instructions', async () => {
    const response = await call('read_imagegen_instructions', {});
    expect(response.success).toBe(true);
    expect(parsePayload(response).result).toEqual({
      source: 'trusted-imagegen-skill',
      content: '# Trusted image generation instructions\nUse the built-in tool.\n',
    });
    await expectDenied('read_imagegen_instructions', { path: '../outside/secret.txt' }, 'unknown_tool_argument');
  });

  test('fails closed for unknown namespaces, tools, and oversized input with JSON-RPC tool response shape', async () => {
    const wrongNamespace = await executeRefinementDynamicToolCall(workspace, {
      namespace: 'web',
      tool: 'run',
      arguments: {},
    });
    expect(wrongNamespace).toEqual({
      success: false,
      contentItems: [{
        type: 'inputText',
        text: '{"ok":false,"error":"tool_namespace_denied"}',
      }],
    });
    await expectDenied('does_not_exist', {}, 'tool_not_allowed');
    await expectDenied('search_code', { query: 'x'.repeat(9_000) }, 'tool_arguments_too_large');
  });
});

async function call(tool: string, args: Record<string, unknown>) {
  return await executeRefinementDynamicToolCall(workspace, {
    threadId: 'thread-id',
    turnId: 'turn-id',
    callId: 'call-id',
    namespace: REFINEMENT_TOOL_NAMESPACE,
    tool,
    arguments: args,
  });
}

function parsePayload(response: Awaited<ReturnType<typeof call>>) {
  return JSON.parse(response.contentItems[0]!.text) as {
    ok: boolean;
    error?: string;
    result: any;
  };
}

async function expectDenied(tool: string, args: Record<string, unknown>, code: string) {
  const response = await call(tool, args);
  expect(response.success).toBe(false);
  expect(parsePayload(response).error).toBe(code);
}
