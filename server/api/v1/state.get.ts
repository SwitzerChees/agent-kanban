import { count } from 'drizzle-orm';
import { db, schema } from '../../lib/db';
import { requireUser } from '../../lib/security/auth';

export default defineEventHandler((event) => {
  requireUser(event);
  const projectCount = db.select({ value: count() }).from(schema.projects).get()?.value ?? 0;
  const taskCount = db.select({ value: count() }).from(schema.tasks).get()?.value ?? 0;
  const userCount = db.select({ value: count() }).from(schema.users).get()?.value ?? 0;
  return {
    generated_at: new Date().toISOString(),
    mode: 'local-kanban',
    counts: {
      projects: projectCount,
      tasks: taskCount,
      users: userCount,
    },
    codex: {
      integration: 'app-server runner available',
      dispatch: 'background dispatcher watches local tasks with agent_status=queued',
    },
  };
});
