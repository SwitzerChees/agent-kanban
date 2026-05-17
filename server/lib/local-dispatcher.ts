import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import { loadWorkflow } from './workflow';
import { resolveServiceConfig } from './config';
import { runCodexSession } from './codex';
import { runtimeLogger } from './logger';
import type { Issue } from './types';

let dispatcher: LocalTaskDispatcher | null = null;

export function startLocalTaskDispatcher() {
  if (!dispatcher) {
    dispatcher = new LocalTaskDispatcher();
    dispatcher.start();
  }
  return dispatcher;
}

class LocalTaskDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, Number.parseInt(process.env.KANBAN_AGENT_POLL_MS ?? '5000', 10));
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running) return;
    const queued = db.select()
      .from(schema.tasks)
      .where(eq(schema.tasks.agentStatus, 'queued'))
      .orderBy(asc(schema.tasks.updatedAt))
      .get();
    if (!queued) return;

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, queued.projectId)).get();
    const column = db.select().from(schema.columns).where(eq(schema.columns.id, queued.columnId)).get();
    if (!project || !column) {
      db.update(schema.tasks).set({ agentStatus: 'failed', updatedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, queued.id))
        .run();
      return;
    }

    this.running = true;
    db.update(schema.tasks).set({ agentStatus: 'running', updatedAt: new Date().toISOString() })
      .where(eq(schema.tasks.id, queued.id))
      .run();

    try {
      const workflow = await loadWorkflow();
      const config = resolveServiceConfig(workflow);
      const issue = taskToIssue(queued, column.nameEn);
      runtimeLogger.info('local codex task started', { task_id: queued.id, task_key: queued.key, project: project.key });
      await runCodexSession({
        config: config.codex,
        workspacePath: project.folderPath,
        issue,
        promptTemplate: workflow.prompt_template || defaultTaskPrompt(),
        attempt: null,
        maxTurns: Math.min(config.agent.maxTurns, Number.parseInt(process.env.KANBAN_AGENT_MAX_TURNS ?? '1', 10)),
        signal: new AbortController().signal,
        onEvent: (event) => runtimeLogger.info('local codex event', {
          task_id: queued.id,
          task_key: queued.key,
          event: event.event,
          session_id: event.session_id,
          message: event.message,
        }),
        refreshIssue: async () => taskToIssue(queued, column.nameEn),
        shouldContinue: () => false,
      });

      const reviewColumn = db.select().from(schema.columns)
        .where(and(eq(schema.columns.projectId, queued.projectId), eq(schema.columns.key, 'in_review')))
        .get();
      db.update(schema.tasks).set({
        agentStatus: 'done',
        columnId: reviewColumn?.id ?? queued.columnId,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.tasks.id, queued.id)).run();
      runtimeLogger.info('local codex task completed', { task_id: queued.id, task_key: queued.key });
    } catch (error) {
      db.update(schema.tasks).set({ agentStatus: 'failed', updatedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, queued.id))
        .run();
      runtimeLogger.warn('local codex task failed', {
        task_id: queued.id,
        task_key: queued.key,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}

function taskToIssue(task: typeof schema.tasks.$inferSelect, state: string): Issue {
  return {
    id: task.id,
    identifier: task.key,
    title: task.title,
    description: task.description,
    priority: priorityNumber(task.priority),
    state,
    branch_name: null,
    url: null,
    labels: [task.priority, `agent:${task.agentStatus}`],
    blocked_by: [],
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function priorityNumber(priority: string): number | null {
  if (priority === 'urgent') return 1;
  if (priority === 'high') return 2;
  if (priority === 'normal') return 3;
  if (priority === 'low') return 4;
  return null;
}

function defaultTaskPrompt() {
  return [
    'You are working on a local Kanban task.',
    'Task: {{ issue.identifier }} - {{ issue.title }}',
    '',
    '{{ issue.description }}',
    '',
    'Work in the current project folder. Keep changes focused and validate them before finishing.',
  ].join('\n');
}
