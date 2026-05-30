import { getHeader, getRouterParam, readBody, readMultipartFormData } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../lib/security/auth';
import { createTask, type UploadedTaskFile } from '../../../lib/kanban';

const jsonTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  columnId: z.string().optional().nullable(),
  swimlaneId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  tags: z.array(z.string()).optional(),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const projectId = getRouterParam(event, 'projectId')!;
  const contentType = getHeader(event, 'content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const parts = await readMultipartFormData(event);
    const fields = new Map<string, string>();
    const files: UploadedTaskFile[] = [];
    for (const part of parts ?? []) {
      if (!part.name) continue;
      if (part.filename) {
        files.push({
          fileName: part.filename,
          mimeType: part.type || 'application/octet-stream',
          data: Buffer.from(part.data),
        });
      } else {
        fields.set(part.name, Buffer.from(part.data).toString('utf8'));
      }
    }
    const taskInput = jsonTaskSchema.parse({
      title: fields.get('title'),
      description: fields.get('description') || null,
      columnId: fields.get('columnId') || null,
      swimlaneId: fields.get('swimlaneId') || null,
      assigneeId: fields.get('assigneeId') || null,
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
