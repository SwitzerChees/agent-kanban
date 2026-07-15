import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  lstat,
  opendir,
  open,
  realpath,
  stat,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const REFINEMENT_TOOL_NAMESPACE = 'refinement_context';

const MAX_ARGUMENT_BYTES = 8 * 1024;
const MAX_RESULT_BYTES = 96 * 1024;
const MAX_PATH_BYTES = 512;
const MAX_LIST_DEPTH = 6;
const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_QUERY_BYTES = 256;
const MAX_SEARCH_FILES = 2_000;
const MAX_SEARCH_FILE_BYTES = 512 * 1024;
const MAX_SEARCH_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_SEARCH_MATCHES = 200;
const MAX_READ_FILE_BYTES = 1024 * 1024;
const MAX_READ_LINES = 500;
const TOOL_TIMEOUT_MS = 3_000;
const GIT_OUTPUT_BYTES = 24 * 1024;
const IMAGEGEN_INSTRUCTION_BYTES = 64 * 1024;

const IGNORED_DIRECTORY_NAMES = new Set([
  '.data',
  '.git',
  '.nuxt',
  '.output',
  'coverage',
  'dist',
  'node_modules',
]);

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^credentials(?:\.|$)/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i,
];

export type RefinementDynamicToolResponse = {
  success: boolean;
  contentItems: Array<{ type: 'inputText'; text: string }>;
};

export interface RefinementToolWorkspace {
  root: string;
  imagegenSkillPath: string | null;
}

export interface CreateRefinementToolWorkspaceOptions {
  /** Test/installation override. This is never model-controlled. */
  imagegenSkillPath?: string | null;
}

export const REFINEMENT_DYNAMIC_TOOLS = [{
  type: 'namespace',
  name: REFINEMENT_TOOL_NAMESPACE,
  description: 'Strictly read-only, host-mediated access to the current refinement project.',
  tools: [
    {
      type: 'function',
      name: 'list_files',
      description: 'List a bounded project subtree without following symlinks.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: 'Workspace-relative directory, or ".".' },
          maxDepth: { type: 'integer', minimum: 1, maximum: MAX_LIST_DEPTH },
          maxEntries: { type: 'integer', minimum: 1, maximum: MAX_LIST_ENTRIES },
        },
      },
      deferLoading: false,
    },
    {
      type: 'function',
      name: 'search_code',
      description: 'Search project text files for a literal fixed string (never a regex).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: MAX_SEARCH_QUERY_BYTES },
          path: { type: 'string', description: 'Optional workspace-relative subtree.' },
          caseSensitive: { type: 'boolean' },
          maxMatches: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_MATCHES },
        },
      },
      deferLoading: false,
    },
    {
      type: 'function',
      name: 'read_file',
      description: 'Read a bounded line range from one regular project text file.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Workspace-relative regular file.' },
          startLine: { type: 'integer', minimum: 1, maximum: 100000 },
          maxLines: { type: 'integer', minimum: 1, maximum: MAX_READ_LINES },
        },
      },
      deferLoading: false,
    },
    {
      type: 'function',
      name: 'git_summary',
      description: 'Return a bounded read-only Git branch, revision, status, and diff-stat summary.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      deferLoading: false,
    },
    {
      type: 'function',
      name: 'read_imagegen_instructions',
      description: 'Read the fixed trusted ImageGen skill instructions before optional image generation.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      deferLoading: false,
    },
  ],
}] as const;

export async function createRefinementToolWorkspace(
  workspacePath: string,
  options: CreateRefinementToolWorkspaceOptions = {},
): Promise<RefinementToolWorkspace> {
  const root = await realpath(workspacePath);
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new RefinementToolError('workspace_not_directory');

  const configuredSkillPath = options.imagegenSkillPath === undefined
    ? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills/.system/imagegen/SKILL.md')
    : options.imagegenSkillPath;

  return {
    root,
    imagegenSkillPath: configuredSkillPath ? await resolveTrustedImagegenSkill(configuredSkillPath) : null,
  };
}

/**
 * Execute exactly one app-server `item/tool/call` request. The response shape
 * intentionally matches DynamicToolCallResponse from the current app-server
 * protocol and is safe to send directly as a JSON-RPC result.
 */
export async function executeRefinementDynamicToolCall(
  workspace: RefinementToolWorkspace,
  request: unknown,
): Promise<RefinementDynamicToolResponse> {
  try {
    const params = recordValue(request);
    if (params.namespace !== REFINEMENT_TOOL_NAMESPACE) {
      throw new RefinementToolError('tool_namespace_denied');
    }
    const tool = requiredString(params.tool, 'tool_name_invalid', 128);
    const args = recordValue(params.arguments);
    if (Buffer.byteLength(JSON.stringify(params.arguments ?? {}), 'utf8') > MAX_ARGUMENT_BYTES) {
      throw new RefinementToolError('tool_arguments_too_large');
    }

    let result: unknown;
    switch (tool) {
      case 'list_files':
        result = await listFiles(workspace, args);
        break;
      case 'search_code':
        result = await searchCode(workspace, args);
        break;
      case 'read_file':
        result = await readWorkspaceFile(workspace, args);
        break;
      case 'git_summary':
        assertNoProperties(args);
        result = await gitSummary(workspace);
        break;
      case 'read_imagegen_instructions':
        assertNoProperties(args);
        result = await readImagegenInstructions(workspace);
        break;
      default:
        throw new RefinementToolError('tool_not_allowed');
    }

    return toolResponse(true, { ok: true, result });
  } catch (error) {
    const code = error instanceof RefinementToolError ? error.code : 'tool_failed';
    return toolResponse(false, { ok: false, error: code });
  }
}

async function listFiles(workspace: RefinementToolWorkspace, args: Record<string, unknown>) {
  assertAllowedProperties(args, ['path', 'maxDepth', 'maxEntries']);
  const requestedPath = optionalString(args.path, '.', MAX_PATH_BYTES);
  const maxDepth = boundedInteger(args.maxDepth, 3, 1, MAX_LIST_DEPTH);
  const maxEntries = boundedInteger(args.maxEntries, 300, 1, MAX_LIST_ENTRIES);
  const directory = await resolveWorkspaceEntry(workspace.root, requestedPath, 'directory');
  const deadline = Date.now() + TOOL_TIMEOUT_MS;
  const entries: Array<{ path: string; type: 'file' | 'directory' | 'symlink'; size?: number }> = [];
  let truncated = false;

  const visit = async (absoluteDirectory: string, depth: number): Promise<void> => {
    checkDeadline(deadline);
    const handle = await openWorkspaceDirectory(workspace.root, absoluteDirectory);
    const children: Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }> = [];
    for await (const child of handle) {
      children.push({
        name: child.name,
        isDirectory: child.isDirectory(),
        isFile: child.isFile(),
        isSymbolicLink: child.isSymbolicLink(),
      });
    }
    children.sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      checkDeadline(deadline);
      if (entries.length >= maxEntries) {
        truncated = true;
        return;
      }
      if (shouldIgnoreName(child.name, child.isDirectory)) continue;
      const absolute = path.join(absoluteDirectory, child.name);
      const relative = relativeDisplayPath(workspace.root, absolute);
      if (child.isSymbolicLink) {
        entries.push({ path: relative, type: 'symlink' });
        continue;
      }
      if (child.isDirectory) {
        entries.push({ path: `${relative}/`, type: 'directory' });
        if (depth < maxDepth) await visit(absolute, depth + 1);
        if (truncated) return;
        continue;
      }
      if (child.isFile) {
        try {
          const fileStats = await readWorkspaceFileMetadata(workspace.root, absolute);
          entries.push({ path: relative, type: 'file', size: fileStats.size });
        } catch {
          // A concurrently replaced entry fails closed and is omitted.
        }
      }
    }
  };

  await visit(directory, 1);
  return { root: requestedPath, entries, truncated };
}

async function searchCode(workspace: RefinementToolWorkspace, args: Record<string, unknown>) {
  assertAllowedProperties(args, ['query', 'path', 'caseSensitive', 'maxMatches']);
  const query = requiredString(args.query, 'search_query_invalid', MAX_SEARCH_QUERY_BYTES);
  if (!query.trim()) throw new RefinementToolError('search_query_invalid');
  const requestedPath = optionalString(args.path, '.', MAX_PATH_BYTES);
  const caseSensitive = optionalBoolean(args.caseSensitive, false);
  const maxMatches = boundedInteger(args.maxMatches, 100, 1, MAX_SEARCH_MATCHES);
  const root = await resolveWorkspaceEntry(workspace.root, requestedPath, 'directory');
  const deadline = Date.now() + TOOL_TIMEOUT_MS;
  const candidates: string[] = [];
  await collectSearchFiles(workspace.root, root, candidates, deadline);

  const needle = caseSensitive ? query : query.toLocaleLowerCase('en-US');
  const matches: Array<{ path: string; line: number; text: string }> = [];
  let bytesScanned = 0;
  let filesScanned = 0;
  let truncated = candidates.length >= MAX_SEARCH_FILES;

  for (const candidate of candidates) {
    checkDeadline(deadline);
    if (matches.length >= maxMatches || bytesScanned >= MAX_SEARCH_TOTAL_BYTES) {
      truncated = true;
      break;
    }
    let data: Buffer;
    try {
      const opened = await readWorkspaceRegularFile(
        workspace.root,
        candidate,
        MAX_SEARCH_FILE_BYTES,
      );
      if (opened.size <= 0) continue;
      data = opened.data;
    } catch {
      // Symlink swaps, oversized files, and vanished entries are skipped.
      continue;
    }
    bytesScanned += data.length;
    filesScanned += 1;
    if (looksBinary(data)) continue;
    const lines = data.toString('utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const haystack = caseSensitive ? line : line.toLocaleLowerCase('en-US');
      if (!haystack.includes(needle)) continue;
      matches.push({
        path: relativeDisplayPath(workspace.root, candidate),
        line: index + 1,
        text: truncateText(line, 500),
      });
      if (matches.length >= maxMatches) {
        truncated = true;
        break;
      }
    }
  }

  return { query, caseSensitive, matches, filesScanned, bytesScanned, truncated };
}

async function collectSearchFiles(
  workspaceRoot: string,
  directory: string,
  files: string[],
  deadline: number,
): Promise<void> {
  if (files.length >= MAX_SEARCH_FILES) return;
  checkDeadline(deadline);
  const handle = await openWorkspaceDirectory(workspaceRoot, directory);
  const children = [];
  for await (const child of handle) children.push(child);
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    checkDeadline(deadline);
    if (files.length >= MAX_SEARCH_FILES) return;
    if (shouldIgnoreName(child.name, child.isDirectory())) continue;
    if (child.isSymbolicLink()) continue;
    const absolute = path.join(directory, child.name);
    if (child.isDirectory()) await collectSearchFiles(workspaceRoot, absolute, files, deadline);
    else if (child.isFile()) files.push(absolute);
  }
}

async function readWorkspaceFile(workspace: RefinementToolWorkspace, args: Record<string, unknown>) {
  assertAllowedProperties(args, ['path', 'startLine', 'maxLines']);
  const requestedPath = requiredString(args.path, 'path_invalid', MAX_PATH_BYTES);
  const startLine = boundedInteger(args.startLine, 1, 1, 100_000);
  const maxLines = boundedInteger(args.maxLines, 250, 1, MAX_READ_LINES);
  const filePath = await resolveWorkspaceEntry(workspace.root, requestedPath, 'file');
  const { data } = await readWorkspaceRegularFile(workspace.root, filePath, MAX_READ_FILE_BYTES);
  if (looksBinary(data)) throw new RefinementToolError('binary_file_denied');
  const lines = data.toString('utf8').split(/\r?\n/);
  const selected = lines.slice(startLine - 1, startLine - 1 + maxLines);
  const numbered = selected.map((line, index) => `${startLine + index}: ${line}`).join('\n');
  return {
    path: relativeDisplayPath(workspace.root, filePath),
    startLine,
    endLine: startLine + Math.max(selected.length - 1, 0),
    totalLines: lines.length,
    truncated: startLine - 1 + selected.length < lines.length,
    content: truncateText(numbered, 72 * 1024),
  };
}

async function gitSummary(workspace: RefinementToolWorkspace) {
  const inside = await runGit(workspace.root, ['rev-parse', '--is-inside-work-tree'], true);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return { isRepository: false };

  const [revision, statusResult, diff, stagedDiff] = await Promise.all([
    runGit(workspace.root, ['log', '-1', '--format=%H%n%h%n%s%n%cI']),
    runGit(workspace.root, ['status', '--short', '--branch', '--untracked-files=no', '--ignore-submodules=all']),
    runGit(workspace.root, ['diff', '--stat', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--', '.']),
    runGit(workspace.root, ['diff', '--cached', '--stat', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--', '.']),
  ]);
  const revisionLines = revision.stdout.trim().split('\n');
  return {
    isRepository: true,
    revision: {
      full: revisionLines[0] || null,
      short: revisionLines[1] || null,
      subject: revisionLines[2] || null,
      committedAt: revisionLines[3] || null,
    },
    status: truncateText(statusResult.stdout.trim(), GIT_OUTPUT_BYTES),
    workingTreeDiffStat: truncateText(diff.stdout.trim(), GIT_OUTPUT_BYTES),
    stagedDiffStat: truncateText(stagedDiff.stdout.trim(), GIT_OUTPUT_BYTES),
  };
}

async function readImagegenInstructions(workspace: RefinementToolWorkspace) {
  const skillPath = workspace.imagegenSkillPath;
  if (!skillPath) throw new RefinementToolError('imagegen_instructions_unavailable');
  const directStats = await lstat(skillPath);
  if (directStats.isSymbolicLink() || !directStats.isFile()) {
    throw new RefinementToolError('imagegen_instructions_invalid');
  }
  const currentRealpath = await realpath(skillPath);
  if (currentRealpath !== skillPath || directStats.size > IMAGEGEN_INSTRUCTION_BYTES) {
    throw new RefinementToolError('imagegen_instructions_invalid');
  }
  const handle = await open(skillPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let content: string;
  try {
    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    const openedStats = await handle.stat();
    if (openedPath !== skillPath || !openedStats.isFile() || openedStats.size > IMAGEGEN_INSTRUCTION_BYTES) {
      throw new RefinementToolError('imagegen_instructions_invalid');
    }
    content = (await handle.readFile()).toString('utf8');
  } finally {
    await handle.close();
  }
  return { source: 'trusted-imagegen-skill', content };
}

async function resolveTrustedImagegenSkill(skillPath: string): Promise<string | null> {
  try {
    const directStats = await lstat(skillPath);
    if (directStats.isSymbolicLink() || !directStats.isFile() || directStats.size > IMAGEGEN_INSTRUCTION_BYTES) {
      return null;
    }
    return await realpath(skillPath);
  } catch {
    return null;
  }
}

async function openWorkspaceDirectory(root: string, directoryPath: string) {
  const handle = await open(
    directoryPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const openedStats = await handle.stat();
    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!openedStats.isDirectory() || !pathInside(root, openedPath)) {
      throw new RefinementToolError('path_outside_workspace');
    }
    return await opendir(`/proc/self/fd/${handle.fd}`);
  } finally {
    await handle.close();
  }
}

async function readWorkspaceFileMetadata(root: string, filePath: string) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedStats = await handle.stat();
    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!openedStats.isFile() || !pathInside(root, openedPath)) {
      throw new RefinementToolError('path_outside_workspace');
    }
    return { size: openedStats.size };
  } finally {
    await handle.close();
  }
}

async function readWorkspaceRegularFile(root: string, filePath: string, maxBytes: number) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedStats = await handle.stat();
    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!openedStats.isFile() || !pathInside(root, openedPath)) {
      throw new RefinementToolError('path_outside_workspace');
    }
    if (openedStats.size > maxBytes) throw new RefinementToolError('file_too_large');
    return { size: openedStats.size, data: await handle.readFile() };
  } finally {
    await handle.close();
  }
}

async function resolveWorkspaceEntry(
  root: string,
  requestedPath: string,
  expected: 'file' | 'directory',
): Promise<string> {
  validateRelativePath(requestedPath);
  const segments = requestedPath === '.' ? [] : requestedPath.split('/');
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const directStats = await lstat(current);
    if (directStats.isSymbolicLink()) throw new RefinementToolError('symlink_denied');
  }
  const resolved = await realpath(current);
  if (!pathInside(root, resolved)) throw new RefinementToolError('path_outside_workspace');
  const resolvedStats = await stat(resolved);
  if (expected === 'file' && !resolvedStats.isFile()) throw new RefinementToolError('not_a_file');
  if (expected === 'directory' && !resolvedStats.isDirectory()) throw new RefinementToolError('not_a_directory');
  if (expected === 'file' && shouldIgnoreName(path.basename(resolved), false)) {
    throw new RefinementToolError('sensitive_file_denied');
  }
  return resolved;
}

function validateRelativePath(value: string) {
  if (!value || Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES || value.includes('\0')) {
    throw new RefinementToolError('path_invalid');
  }
  if (path.isAbsolute(value) || value.includes('\\')) throw new RefinementToolError('path_must_be_relative');
  const segments = value.split('/');
  if (segments.some((segment) => segment === '..')) throw new RefinementToolError('path_traversal_denied');
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) throw new RefinementToolError('path_traversal_denied');
}

function pathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function relativeDisplayPath(root: string, candidate: string) {
  return path.relative(root, candidate).split(path.sep).join('/') || '.';
}

function shouldIgnoreName(name: string, directory: boolean) {
  if (directory && IGNORED_DIRECTORY_NAMES.has(name)) return true;
  return !directory && SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function looksBinary(data: Buffer) {
  return data.subarray(0, Math.min(data.length, 8192)).includes(0);
}

function checkDeadline(deadline: number) {
  if (Date.now() > deadline) throw new RefinementToolError('tool_timeout');
}

async function runGit(root: string, args: string[], tolerateFailure = false) {
  const gitArgs = [
    '-c', 'core.fsmonitor=false',
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'diff.external=',
    '-c', 'pager.status=false',
    '-c', 'pager.log=false',
    '-c', 'pager.diff=false',
    '--no-pager',
    ...args,
  ];
  return await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
    const child = spawn('git', gitArgs, {
      cwd: root,
      env: {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
        PATH: process.env.PATH || '/usr/bin:/bin',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: { code: number; stdout: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new RefinementToolError('git_timeout'));
    }, TOOL_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > GIT_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(new RefinementToolError('git_output_too_large'));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > GIT_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(new RefinementToolError('git_output_too_large'));
      }
    });
    child.on('error', () => finish(new RefinementToolError('git_unavailable')));
    child.on('exit', (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0 && !tolerateFailure) finish(new RefinementToolError('git_command_failed'));
      else finish(undefined, { code: exitCode, stdout: stdout.toString('utf8') });
    });
  });
}

function toolResponse(success: boolean, payload: unknown): RefinementDynamicToolResponse {
  let text = JSON.stringify(payload);
  if (Buffer.byteLength(text, 'utf8') > MAX_RESULT_BYTES) {
    text = JSON.stringify({ ok: false, error: 'tool_result_too_large' });
    success = false;
  }
  return { success, contentItems: [{ type: 'inputText', text }] };
}

function recordValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RefinementToolError('tool_arguments_invalid');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, code: string, maxBytes: number) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new RefinementToolError(code);
  }
  return value;
}

function optionalString(value: unknown, fallback: string, maxBytes: number) {
  if (value === undefined) return fallback;
  return requiredString(value, 'path_invalid', maxBytes);
}

function optionalBoolean(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new RefinementToolError('boolean_argument_invalid');
  return value;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RefinementToolError('integer_argument_invalid');
  }
  return value as number;
}

function assertAllowedProperties(value: Record<string, unknown>, allowed: string[]) {
  const allowlist = new Set(allowed);
  if (Object.keys(value).some((key) => !allowlist.has(key))) {
    throw new RefinementToolError('unknown_tool_argument');
  }
}

function assertNoProperties(value: Record<string, unknown>) {
  if (Object.keys(value).length) throw new RefinementToolError('unknown_tool_argument');
}

function truncateText(value: string, maxBytes: number) {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  return `${Buffer.from(value, 'utf8').subarray(0, Math.max(maxBytes - 32, 0)).toString('utf8')}\n[truncated]`;
}

class RefinementToolError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RefinementToolError';
  }
}
