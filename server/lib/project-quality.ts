import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const workflow = z.string().regex(/^[a-zA-Z0-9_.-]+\.ya?ml$/);
export const projectQualitySchema = z.object({
  version: z.literal(1),
  pullRequest: z.boolean().default(true),
  ciWorkflow: workflow.optional(),
  deploymentWorkflow: workflow.optional(),
  deploymentBranch: z.string().regex(/^[a-zA-Z0-9_./-]+$/).default('master'),
  browser: z.enum(['on-request', 'required']).default('on-request'),
}).strict();
export type ProjectQuality = z.infer<typeof projectQualitySchema>;

// Explicit, versioned configuration. A malformed policy must never disable a gate.
export async function loadProjectQuality(workspacePath: string): Promise<ProjectQuality | null> {
  try {
    return projectQualitySchema.parse(JSON.parse(await readFile(path.join(workspacePath, '.agent-kanban-quality.json'), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('Invalid .agent-kanban-quality.json', { cause: error });
  }
}
