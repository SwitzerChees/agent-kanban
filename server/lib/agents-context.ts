import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const AGENTS_FILE = 'AGENTS.md';
const GUIDANCE_FILES = new Set([
  'ARCHITECTURE.md',
  'CODING_STANDARDS.md',
  'CONTRIBUTING.md',
  'DESIGN.md',
  'DEVELOPMENT.md',
  'ENGINEERING.md',
  'SECURITY.md',
  'STYLEGUIDE.md',
  'TESTING.md',
]);
const MAX_INSTRUCTION_BYTES = 160_000;
const MAX_FILE_BYTES = 80_000;
const MAX_SEARCH_DEPTH = 3;
const SKIPPED_DIRS = new Set(['.git', '.data', 'node_modules', '.nuxt', '.output', 'dist', 'build', '.cache']);

export interface ProjectInstructionDocument {
  path: string;
  content: string;
  kind: 'agents' | 'guidance';
  truncated: boolean;
}

export interface AgentsContext {
  /** Most specific AGENTS.md, retained for workspace and completion-gate compatibility. */
  path: string | null;
  /** Combined root-to-leaf AGENTS.md content. */
  content: string | null;
  truncated: boolean;
  projectRoot: string;
  documents: ProjectInstructionDocument[];
}

export async function loadAgentsContext(workspacePath: string, boundaryPath = workspacePath): Promise<AgentsContext> {
  const directPath = path.join(workspacePath, AGENTS_FILE);
  const direct = await isFile(directPath);
  const nestedPath = direct ? directPath : await findNestedAgentsFile(workspacePath, 0);
  const projectRoot = nestedPath ? path.dirname(nestedPath) : workspacePath;
  const agentPaths = await findAncestorAgentsFiles(projectRoot, boundaryPath);
  if (nestedPath && !agentPaths.includes(nestedPath)) agentPaths.push(nestedPath);

  const guidancePaths = await findGuidanceFiles(projectRoot, boundaryPath);
  const documents: ProjectInstructionDocument[] = [];
  let remainingBytes = MAX_INSTRUCTION_BYTES;
  for (const filePath of [...agentPaths, ...guidancePaths]) {
    if (remainingBytes <= 0) break;
    const document = await readInstructionFile(
      filePath,
      agentPaths.includes(filePath) ? 'agents' : 'guidance',
      remainingBytes,
    );
    if (!document) continue;
    documents.push(document);
    remainingBytes -= Buffer.byteLength(document.content, 'utf8');
  }

  const agentsDocuments = documents.filter((document) => document.kind === 'agents');
  return {
    path: agentsDocuments.at(-1)?.path ?? null,
    content: agentsDocuments.length
      ? agentsDocuments.map((document) => document.content).join('\n\n---\n\n')
      : null,
    truncated: documents.some((document) => document.truncated) || (agentPaths.length + guidancePaths.length > documents.length),
    projectRoot,
    documents,
  };
}

export function buildAgentsPromptPrefix(context: AgentsContext): string {
  const lines = [
    '# Mandatory Project Instructions',
    '',
    'Agent Kanban automatically loaded the applicable repository instruction and design documents for this run.',
    'Read and obey them before making changes, keep the implementation consistent with them, and re-check them against the final diff before reporting completion.',
    'AGENTS.md files are mandatory workflow rules. More specific AGENTS.md files override broader ones. Design and engineering guidance is binding wherever it applies. If documents conflict and AGENTS.md does not resolve the conflict, stop and report it instead of guessing.',
  ];

  if (!context.documents.length) {
    return [
      ...lines,
      '',
      'No recognized project instruction document was found in the configured project folder. Inspect the repository for project-specific rules before changing anything and report missing expected guidance instead of guessing.',
    ].join('\n');
  }

  return [
    ...lines,
    '',
    ...context.documents.flatMap((document) => [
      `## ${document.kind === 'agents' ? 'Mandatory workflow rules' : 'Project design and engineering guidance'}: ${document.path}`,
      document.truncated ? `Note: This document was truncated to fit the ${MAX_INSTRUCTION_BYTES}-byte combined instruction limit.` : null,
      '',
      '```markdown',
      document.content,
      '```',
      '',
    ]),
  ].filter((line): line is string => line !== null).join('\n').trim();
}

async function readInstructionFile(
  filePath: string,
  kind: ProjectInstructionDocument['kind'],
  remainingBytes: number,
): Promise<ProjectInstructionDocument | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const fullContent = await readFile(filePath);
    const limit = Math.min(MAX_FILE_BYTES, remainingBytes);
    const truncated = fullContent.byteLength > limit;
    const content = fullContent.subarray(0, limit).toString('utf8');
    return { path: filePath, content, kind, truncated };
  } catch {
    return null;
  }
}

async function findAncestorAgentsFiles(projectRoot: string, boundaryPath: string) {
  const found: string[] = [];
  for (const directory of instructionDirectories(projectRoot, boundaryPath)) {
    const candidate = path.join(directory, AGENTS_FILE);
    if (await isFile(candidate)) found.push(candidate);
  }
  return found;
}

async function findGuidanceFiles(projectRoot: string, boundaryPath: string) {
  const candidates: string[] = [];
  for (const root of instructionDirectories(projectRoot, boundaryPath)) {
    for (const directory of [root, path.join(root, 'docs')]) {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isFile() && GUIDANCE_FILES.has(entry.name)) candidates.push(path.join(directory, entry.name));
      }
    }
  }
  return [...new Set(candidates)];
}

function instructionDirectories(projectRoot: string, boundaryPath: string) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedBoundary = path.resolve(boundaryPath);
  const relative = path.relative(resolvedBoundary, resolvedRoot);
  const insideBoundary = relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  if (!insideBoundary || !relative) return [resolvedRoot];

  const directories = [resolvedBoundary];
  let current = resolvedBoundary;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    directories.push(current);
  }
  return directories;
}

async function isFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
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
