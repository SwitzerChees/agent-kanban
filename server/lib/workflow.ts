import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { WorkflowError, type WorkflowDefinition } from './types';

export function resolveWorkflowPath(explicitPath?: string | null, cwd = process.cwd()): string {
  if (explicitPath && explicitPath.trim()) {
    return path.resolve(cwd, explicitPath);
  }
  return path.resolve(cwd, 'WORKFLOW.md');
}

export async function loadWorkflow(explicitPath?: string | null, cwd = process.cwd()): Promise<WorkflowDefinition> {
  const workflowPath = resolveWorkflowPath(explicitPath, cwd);

  try {
    const stats = await stat(workflowPath);
    if (!stats.isFile()) {
      throw new WorkflowError('missing_workflow_file', `Workflow path is not a file: ${workflowPath}`);
    }
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError('missing_workflow_file', `Cannot read workflow file: ${workflowPath}`, error);
  }

  let source: string;
  try {
    source = await readFile(workflowPath, 'utf8');
  } catch (error) {
    throw new WorkflowError('missing_workflow_file', `Cannot read workflow file: ${workflowPath}`, error);
  }

  const { config, body } = parseWorkflowSource(source, workflowPath);
  return {
    path: workflowPath,
    dir: path.dirname(workflowPath),
    config,
    prompt_template: body.trim(),
    loaded_at: new Date().toISOString(),
  };
}

export function parseWorkflowSource(source: string, filename = 'WORKFLOW.md'): Pick<WorkflowDefinition, 'config' | 'prompt_template'> & { body: string } {
  if (!source.startsWith('---')) {
    return { config: {}, prompt_template: source.trim(), body: source.trim() };
  }

  const lines = source.split(/\r?\n/);
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new WorkflowError('workflow_parse_error', `Missing closing YAML front matter delimiter in ${filename}`);
  }

  const frontMatter = lines.slice(1, closingIndex).join('\n');
  const body = lines.slice(closingIndex + 1).join('\n').trim();

  let parsed: unknown;
  try {
    parsed = frontMatter.trim() ? YAML.parse(frontMatter) : {};
  } catch (error) {
    throw new WorkflowError('workflow_parse_error', `Invalid YAML front matter in ${filename}`, error);
  }

  if (!isPlainObject(parsed)) {
    throw new WorkflowError('workflow_front_matter_not_a_map', `YAML front matter must be a map in ${filename}`);
  }

  return { config: parsed, prompt_template: body, body };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
