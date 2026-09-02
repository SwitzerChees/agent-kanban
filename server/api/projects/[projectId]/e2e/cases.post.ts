import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { requireUser } from '../../../../lib/security/auth';
import { createE2eCase } from '../../../../lib/e2e-tests';

const bodySchema = z.object({
  suiteId: z.string().uuid(),
  title: z.string().min(1).max(200),
  scenario: z.string().max(100_000).optional(),
  preconditions: z.string().max(100_000).optional(),
  expectedResult: z.string().max(100_000).optional(),
  roles: z.array(z.string().max(100)).max(20).optional(),
  targetUrl: z.string().max(2_000).optional().nullable(),
  executionMode: z.enum(['browser_harness', 'project_command']).optional(),
  agentHarness: z.enum(['codex', 'opencode', 'prime-agent']).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'xhigh']).optional(),
  runnerCommand: z.string().max(4_000).optional(),
  timeoutSeconds: z.number().int().min(10).max(7_200).optional(),
  triggerColumnKey: z.string().max(100).optional().nullable(),
  triggerOberthemaId: z.string().uuid().optional().nullable(),
  triggerUnterthemaId: z.string().uuid().optional().nullable(),
  enabled: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export default defineEventHandler(async (event) => ({
  case: createE2eCase(
    getRouterParam(event, 'projectId')!,
    bodySchema.parse(await readBody(event)),
    requireUser(event),
  ),
}));
