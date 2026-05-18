import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const AGENTS_FILE = 'AGENTS.md';
const MAX_AGENTS_BYTES = 80_000;
const MAX_SEARCH_DEPTH = 3;
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.nuxt', '.output', 'dist', 'build', '.cache']);

export interface AgentsContext {
  path: string | null;
  content: string | null;
  truncated: boolean;
}

export async function loadAgentsContext(workspacePath: string): Promise<AgentsContext> {
  const directPath = path.join(workspacePath, AGENTS_FILE);
  const direct = await readAgentsFile(directPath);
  if (direct) return direct;

  const nestedPath = await findNestedAgentsFile(workspacePath, 0);
  if (nestedPath) {
    const nested = await readAgentsFile(nestedPath);
    if (nested) return nested;
  }

  return { path: null, content: null, truncated: false };
}

export function buildAgentsPromptPrefix(context: AgentsContext): string {
  const lines = [
    '# Mandatory Project Instructions',
    '',
    'Agent Kanban automatically loaded the project AGENTS.md for this run. These instructions are mandatory and override generic workflow guidance when they are more specific.',
    'Read and obey them before making changes. Do not mark the task complete unless the AGENTS.md requirements are satisfied.',
  ];

  if (!context.content || !context.path) {
    return [
      ...lines,
      '',
      'No AGENTS.md file was found in the configured project folder. If the repository requires project-specific rules, stop and report the missing file instead of guessing.',
    ].join('\n');
  }

  return [
    ...lines,
    '',
    `Loaded from: ${context.path}`,
    context.truncated ? `Note: AGENTS.md was truncated to ${MAX_AGENTS_BYTES} bytes for prompt size.` : null,
    '',
    '```markdown',
    context.content,
    '```',
  ].filter((line): line is string => line !== null).join('\n');
}

async function readAgentsFile(filePath: string): Promise<AgentsContext | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const fullContent = await readFile(filePath, 'utf8');
    const truncated = Buffer.byteLength(fullContent, 'utf8') > MAX_AGENTS_BYTES;
    const content = truncated ? fullContent.slice(0, MAX_AGENTS_BYTES) : fullContent;
    return { path: filePath, content, truncated };
  } catch {
    return null;
  }
}

async function findNestedAgentsFile(dir: string, depth: number): Promise<string | null> {
  if (depth >= MAX_SEARCH_DEPTH) return null;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name === AGENTS_FILE) return path.join(dir, entry.name);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
    const found = await findNestedAgentsFile(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }

  return null;
}
