import { getHeader, getRouterParam, readBody, readMultipartFormData } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { createTask } from '../../../lib/kanban';
import { parseTaskUploadParts } from '../../../lib/task-upload';

const jsonTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  columnId: z.string().optional().nullable(),
  swimlaneId: z.string().optional().nullable(),
  oberthemaId: z.string().optional().nullable(),
  unterthemaId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  agentEnabled: z.boolean().optional(),
  agentHarness: z.enum(['codex', 'opencode', 'prime-agent']).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'xhigh']).optional(),
  clientRequestId: z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  tags: z.array(z.string()).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  const contentType = getHeader(event, 'content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event);
    const { fields, files } = parseTaskUploadParts(parts);
    const taskInput = jsonTaskSchema.parse({
      title: fields.get('title'),
      description: fields.get('description') || null,
      columnId: fields.get('columnId') || null,
      swimlaneId: fields.get('swimlaneId') || null,
      oberthemaId: fields.get('oberthemaId') || null,
      unterthemaId: fields.get('unterthemaId') || null,
      assigneeId: fields.has('assigneeId') ? fields.get('assigneeId') || null : undefined,
      agentEnabled: fields.get('agentEnabled') === 'true',
      agentHarness: fields.get('agentHarness') || undefined,
      reasoningEffort: fields.get('reasoningEffort') || undefined,
      clientRequestId: fields.get('clientRequestId') || undefined,
      priority: fields.get('priority') || undefined,
      tags: parseTagsField(fields.get('tags')),
    });
    return { task: await createTask(projectId, { ...taskInput, files }, user) };
  }

  const body = jsonTaskSchema.parse(await readBody(event));
  return { task: await createTask(projectId, body, user) };
});

function parseTagsField(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // Fall through to comma-separated tags for hand-written clients.
  }
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}
