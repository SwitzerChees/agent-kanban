import { getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { answerRefinementQuestions } from '../../../../../lib/refinements';
import { requireUser } from '../../../../../lib/security/auth';

const answerSchema = z.union([
  z.string().max(8000),
  z.array(z.string().max(2000)).max(30),
  z.boolean(),
  z.null(),
]);

const schema = z.object({
  answers: z.record(z.string().min(1), answerSchema),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const taskId = getRouterParam(event, 'taskId')!;
  const refinementId = getRouterParam(event, 'refinementId')!;
  const body = schema.parse(await readBody(event));
  return { refinement: answerRefinementQuestions(taskId, refinementId, body.answers, user) };
});
