import { createError } from 'h3';
import { z } from 'zod';

const schema = z.object({
  kind: z.enum(['text', 'visual']).optional(),
  brief: z.string().optional().nullable(),
  visualMode: z.enum(['auto', 'off', 'force']).optional(),
  parentRefinementId: z.string().uuid().optional().nullable(),
  visualSettings: z.object({
    desktop: z.boolean().optional(),
    mobile: z.boolean().optional(),
    states: z.boolean().optional(),
  }).optional(),
});

export function parseRefinementInput(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'refinement_invalid_input' });
  }
  return parsed.data;
}
