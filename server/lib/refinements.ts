import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lte, max, or } from 'drizzle-orm';
import { createError } from 'h3';
import { db, schema } from './db';
import type { TaskRefinement, User } from './db/schema';
import { getProject } from './kanban';
import { activeTaskDescription, publicTaskDescription } from './task-description';
import type { AgentHarness, ReasoningEffort } from './agent-harness';

export type RefinementStatus = 'queued' | 'running' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';
export type RefinementComplexity = 'simple' | 'moderate' | 'complex';
export type RefinementVisualMode = 'auto' | 'off' | 'force';
export type RefinementAnswer = string | string[] | boolean | null;

export interface RefinementQuestion {
  id: string;
  question: string;
  rationale?: string | null;
  type?: 'text' | 'single_choice' | 'multiple_choice' | 'boolean';
  options?: string[];
  required?: boolean;
  round: number;
  answer?: RefinementAnswer;
  answeredAt?: string | null;
  answeredBy?: string | null;
}

export interface RefinementVisual {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  prompt?: string | null;
  caption?: string | null;
  createdAt?: string | null;
}

export interface RefinementResult {
  summary: string;
  integrationPlan?: string[];
  applicationImpact?: string[];
  risks?: Array<string | {
    risk: string;
    mitigation?: string | null;
    severity?: 'low' | 'medium' | 'high' | null;
  }>;
  acceptanceCriteria?: string[];
  openQuestions?: string[];
  notes?: string[];
  [key: string]: unknown;
}

export interface PublicTaskRefinement extends Omit<TaskRefinement,
  | 'questionsJson'
  | 'visualsJson'
  | 'resultJson'
  | 'leaseOwner'
  | 'leaseToken'
  | 'leaseExpiresAt'
  | 'heartbeatAt'
> {
  questions: RefinementQuestion[];
  visuals: RefinementVisual[];
  result: RefinementResult | null;
  requestedByName: string | null;
}

export interface RefinementContext {
  id: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  taskDescription: string | null;
  agentHarness: AgentHarness;
  reasoningEffort: ReasoningEffort;
  projectId: string;
  projectKey: string;
  projectName: string;
  projectFolderPath: string;
  requestedBy: string;
  requestedByName: string | null;
  brief: string | null;
  visualMode: RefinementVisualMode;
  sourceCodeRevision: string | null;
  threadId: string | null;
  leaseOwner: string;
  leaseToken: string;
  leaseExpiresAt: string;
  round: number;
  questions: RefinementQuestion[];
  answeredQuestions: RefinementQuestion[];
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
    storagePath: string;
    annotationStoragePath: string | null;
  }>;
}

const ACTIVE_STATUSES: RefinementStatus[] = ['queued', 'running', 'awaiting_input'];
const DEFAULT_REFINEMENT_LEASE_MS = 90_000;

const normalizeDescription = (value: string | null | undefined) => (value ?? '')
  .replace(/\r\n/g, '\n')
  .trimEnd();

export function createTaskRefinement(taskId: string, input: {
  brief?: string | null;
  visualMode?: RefinementVisualMode;
}, user: User): PublicTaskRefinement {
  const { task, project } = authorizeTask(taskId, user);
  const active = activeRefinementForTask(taskId);
  if (active) {
    throw createError({
      statusCode: 409,
      statusMessage: 'refinement_already_active',
      data: { refinementId: active.id, status: active.status },
    });
  }

  const now = new Date().toISOString();
  const refinementId = randomUUID();
  const brief = input.brief?.trim() || null;
  const sourceCodeRevision = readCodeRevision(project.folderPath);

  try {
    db.transaction((tx) => {
      const version = (tx.select({ value: max(schema.taskRefinements.version) })
        .from(schema.taskRefinements)
        .where(eq(schema.taskRefinements.taskId, taskId))
        .get()?.value ?? 0) + 1;

      tx.insert(schema.taskRefinements).values({
        id: refinementId,
        taskId,
        version,
        status: 'queued',
        requestedBy: user.id,
        brief,
        visualMode: input.visualMode ?? 'auto',
        sourceDescription: activeTaskDescription(task),
        sourceTaskUpdatedAt: task.updatedAt,
        sourceCodeRevision,
        resultCodeRevision: null,
        questionsJson: '[]',
        round: 1,
        resultMarkdown: null,
        resultJson: null,
        complexity: null,
        visualsJson: '[]',
        threadId: null,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        error: null,
        createdAt: now,
        startedAt: null,
        awaitingInputAt: null,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        appliedAt: null,
        appliedBy: null,
        updatedAt: now,
      }).run();

      insertActivity(tx, task.projectId, task.id, user.id, 'refinement_queued', {
        refinementId,
        version,
        visualMode: input.visualMode ?? 'auto',
        sourceCodeRevision,
      }, now);
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const competing = activeRefinementForTask(taskId);
      throw createError({
        statusCode: 409,
        statusMessage: 'refinement_already_active',
        data: competing ? { refinementId: competing.id, status: competing.status } : undefined,
      });
    }
    throw error;
  }

  return requirePublicRefinement(refinementId);
}

export function listTaskRefinements(taskId: string, user: User): PublicTaskRefinement[] {
  authorizeTask(taskId, user);
  return db.select().from(schema.taskRefinements)
    .where(eq(schema.taskRefinements.taskId, taskId))
    .orderBy(desc(schema.taskRefinements.version))
    .all()
    .map(toPublicRefinement);
}

export function getTaskRefinement(taskId: string, refinementId: string, user: User): PublicTaskRefinement {
  authorizeTask(taskId, user);
  const refinement = requireRefinement(refinementId);
  if (refinement.taskId !== taskId) {
    throw createError({ statusCode: 404, statusMessage: 'refinement_not_found' });
  }
  return toPublicRefinement(refinement);
}

export function answerRefinementQuestions(taskId: string, refinementId: string, answers: Record<string, RefinementAnswer>, user: User) {
  authorizeTask(taskId, user);
  const refinement = requireTaskRefinement(taskId, refinementId);
  if (refinement.status !== 'awaiting_input') {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_awaiting_input' });
  }

  const now = new Date().toISOString();
  const questions = parseQuestions(refinement.questionsJson);
  const currentQuestions = questions.filter((question) => question.round === refinement.round && question.answeredAt == null);
  const allowedIds = new Set(currentQuestions.map((question) => question.id));
  if (Object.keys(answers).some((id) => !allowedIds.has(id))) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_refinement_answer' });
  }

  const updatedQuestions = questions.map((question) => {
    if (!allowedIds.has(question.id) || !(question.id in answers)) return question;
    const answer = answers[question.id];
    validateAnswer(question, answer);
    return { ...question, answer, answeredAt: now, answeredBy: user.id };
  });
  const unansweredRequired = updatedQuestions.some((question) => (
    question.round === refinement.round
    && question.required !== false
    && question.answeredAt == null
  ));
  if (unansweredRequired) {
    throw createError({ statusCode: 400, statusMessage: 'refinement_answers_incomplete' });
  }

  const nextRound = refinement.round + 1;
  db.transaction((tx) => {
    const result = tx.update(schema.taskRefinements).set({
      status: 'queued',
      questionsJson: JSON.stringify(updatedQuestions),
      round: nextRound,
      error: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    }).where(and(
      eq(schema.taskRefinements.id, refinement.id),
      eq(schema.taskRefinements.status, 'awaiting_input'),
    )).run();
    if (result.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
    }
    const task = requireTask(taskId);
    insertActivity(tx, task.projectId, task.id, user.id, 'refinement_answers_submitted', {
      refinementId,
      answeredQuestionIds: Object.keys(answers),
      nextRound,
    }, now);
  });

  return requirePublicRefinement(refinement.id);
}

export function applyTaskRefinement(taskId: string, refinementId: string, input: {
  mode?: 'replace' | 'append';
  expectedTaskUpdatedAt?: string;
  markdown?: string;
  allowDescriptionOverwrite?: boolean;
}, user: User) {
  const { task } = authorizeTask(taskId, user);
  const refinement = requireTaskRefinement(taskId, refinementId);
  if (refinement.status !== 'completed' || !refinement.resultMarkdown?.trim()) {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_completed' });
  }
  if (refinement.appliedAt) {
    throw createError({ statusCode: 409, statusMessage: 'refinement_already_applied' });
  }
  if (task.agentStatus === 'running' || task.agentStatus === 'waiting_external' || task.agentStatus === 'done' || task.agentStatus === 'failed') {
    throw createError({ statusCode: 409, statusMessage: 'task_locked_after_agent_start' });
  }
  const currentDescription = activeTaskDescription(task);
  const descriptionChanged = normalizeDescription(currentDescription) !== normalizeDescription(refinement.sourceDescription);
  if (descriptionChanged && !input.allowDescriptionOverwrite) {
    throw createError({
      statusCode: 409,
      statusMessage: 'refinement_description_changed',
      data: {
        descriptionChanged: true,
        currentTaskUpdatedAt: task.updatedAt,
      },
    });
  }

  const now = new Date().toISOString();
  const mode = input.mode ?? 'replace';
  const appliedMarkdown = input.markdown?.trim() || refinement.resultMarkdown.trim();
  const description = mode === 'append' && currentDescription?.trim()
    ? `${currentDescription.trim()}\n\n---\n\n${appliedMarkdown}`
    : appliedMarkdown;

  db.transaction((tx) => {
    const taskUpdate = tx.update(schema.tasks).set({
      refinedDescription: description,
      descriptionSource: 'refined',
      updatedAt: now,
    })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.updatedAt, task.updatedAt)))
      .run();
    if (taskUpdate.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_source_changed' });
    }
    const refinementUpdate = tx.update(schema.taskRefinements).set({
      appliedAt: now,
      appliedBy: user.id,
      updatedAt: now,
    }).where(and(
      eq(schema.taskRefinements.id, refinementId),
      eq(schema.taskRefinements.status, 'completed'),
    )).run();
    if (refinementUpdate.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
    }
    insertActivity(tx, task.projectId, task.id, user.id, 'refinement_applied', {
      refinementId,
      version: refinement.version,
      mode,
      selectedResult: input.markdown !== undefined,
      overwroteChangedDescription: descriptionChanged,
      previousDescriptionSource: task.descriptionSource,
    }, now);
  });

  return {
    refinement: requirePublicRefinement(refinementId),
    task: publicTaskDescription(requireTask(taskId)),
  };
}

export function cancelTaskRefinement(taskId: string, refinementId: string, user: User) {
  const { task } = authorizeTask(taskId, user);
  const refinement = requireTaskRefinement(taskId, refinementId);
  if (!['awaiting_input', 'completed'].includes(refinement.status)) {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_cancellable' });
  }
  if (refinement.appliedAt) {
    throw createError({ statusCode: 409, statusMessage: 'refinement_already_applied' });
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    const updated = tx.update(schema.taskRefinements).set({
      status: 'cancelled',
      cancelledAt: now,
      error: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    }).where(and(
      eq(schema.taskRefinements.id, refinementId),
      inArray(schema.taskRefinements.status, ['awaiting_input', 'completed']),
      isNull(schema.taskRefinements.appliedAt),
    )).run();
    if (updated.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
    }
    insertActivity(tx, task.projectId, task.id, user.id, 'refinement_cancelled', {
      refinementId,
      version: refinement.version,
      previousStatus: refinement.status,
    }, now);
  });

  return requirePublicRefinement(refinementId);
}

/**
 * Claims one pending run atomically and fences every subsequent mutation with
 * a unique lease token. The status predicate makes competing processes safe:
 * only one of them can transition the selected row from queued to running.
 */
export function claimNextQueuedRefinement(options: {
  ownerId?: string;
  leaseMs?: number;
  now?: Date | string;
} = {}): RefinementContext | null {
  const queued = db.select().from(schema.taskRefinements)
    .where(eq(schema.taskRefinements.status, 'queued'))
    .orderBy(asc(schema.taskRefinements.updatedAt), asc(schema.taskRefinements.createdAt))
    .get();
  if (!queued) return null;

  const now = isoTimestamp(options.now);
  const leaseMs = positiveLeaseMs(options.leaseMs);
  const ownerId = options.ownerId?.trim() || `refinement-worker:${process.pid}`;
  const leaseToken = randomUUID();
  const claimed = db.update(schema.taskRefinements).set({
    status: 'running',
    startedAt: queued.startedAt ?? now,
    leaseOwner: ownerId,
    leaseToken,
    leaseExpiresAt: new Date(Date.parse(now) + leaseMs).toISOString(),
    heartbeatAt: now,
    error: null,
    updatedAt: now,
  }).where(and(
    eq(schema.taskRefinements.id, queued.id),
    eq(schema.taskRefinements.status, 'queued'),
  )).run();
  if (claimed.changes !== 1) return null;

  return getRefinementForWorker(queued.id);
}

export function getRefinementForWorker(refinementId: string): RefinementContext {
  const refinement = requireRefinement(refinementId);
  const task = requireTask(refinement.taskId);
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId)).get();
  if (!project) throw new Error('refinement_project_missing');
  const requester = db.select().from(schema.users).where(eq(schema.users.id, refinement.requestedBy)).get();
  const attachments = db.select().from(schema.attachments)
    .where(eq(schema.attachments.taskId, task.id))
    .orderBy(asc(schema.attachments.createdAt))
    .all();
  const attachmentIds = attachments.map((attachment) => attachment.id);
  const annotations = attachmentIds.length
    ? db.select().from(schema.attachmentAnnotations)
      .where(inArray(schema.attachmentAnnotations.attachmentId, attachmentIds))
      .all()
    : [];
  const annotationByAttachment = new Map(annotations.map((annotation) => [annotation.attachmentId, annotation]));
  const questions = parseQuestions(refinement.questionsJson);

  return {
    id: refinement.id,
    taskId: task.id,
    taskKey: task.key,
    taskTitle: task.title,
    taskDescription: refinement.sourceDescription,
    agentHarness: task.agentHarness,
    reasoningEffort: task.reasoningEffort,
    projectId: project.id,
    projectKey: project.key,
    projectName: project.name,
    projectFolderPath: project.folderPath,
    requestedBy: refinement.requestedBy,
    requestedByName: requester?.name ?? null,
    brief: refinement.brief,
    visualMode: refinement.visualMode,
    sourceCodeRevision: refinement.sourceCodeRevision,
    threadId: refinement.threadId,
    leaseOwner: requireClaimField(refinement.leaseOwner, 'refinement_lease_owner_missing'),
    leaseToken: requireClaimField(refinement.leaseToken, 'refinement_lease_token_missing'),
    leaseExpiresAt: requireClaimField(refinement.leaseExpiresAt, 'refinement_lease_expiry_missing'),
    round: refinement.round,
    questions,
    answeredQuestions: questions.filter((question) => question.answeredAt != null),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      storagePath: attachment.storagePath,
      annotationStoragePath: annotationByAttachment.get(attachment.id)?.renderedStoragePath ?? null,
    })),
  };
}

export function setRefinementThread(refinementId: string, threadId: string, leaseToken: string) {
  const refinement = requireRefinement(refinementId);
  if (refinement.status !== 'running') {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_running' });
  }
  const now = new Date().toISOString();
  const updated = db.update(schema.taskRefinements).set({
    threadId: threadId.trim() || null,
    updatedAt: now,
  }).where(validClaimCondition(refinementId, leaseToken, now)).run();
  if (updated.changes !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
  }
}

export function recordRefinementWorkspaceSync(
  refinementId: string,
  revision: string,
  leaseToken: string,
  metadata: { branch: string; dirty: boolean },
) {
  const refinement = requireRefinement(refinementId);
  if (refinement.status !== 'running') {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_running' });
  }
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const updated = tx.update(schema.taskRefinements).set({
      sourceCodeRevision: revision,
      updatedAt: now,
    }).where(validClaimCondition(refinementId, leaseToken, now)).run();
    if (updated.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
    }
    const task = requireTask(refinement.taskId);
    insertActivity(tx, task.projectId, task.id, null, 'refinement_master_synced', {
      refinementId,
      revision,
      branch: metadata.branch,
      dirty: metadata.dirty,
      round: refinement.round,
    }, now);
  });
}

export function requestRefinementInput(refinementId: string, input: {
  questions: Array<Omit<RefinementQuestion, 'id' | 'round' | 'answer' | 'answeredAt' | 'answeredBy'> & { id?: string }>;
  threadId?: string | null;
}, leaseToken: string) {
  const refinement = requireRefinement(refinementId);
  if (refinement.status !== 'running') {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_running' });
  }
  if (!input.questions.length) {
    throw createError({ statusCode: 400, statusMessage: 'refinement_questions_empty' });
  }
  const now = new Date().toISOString();
  const existing = parseQuestions(refinement.questionsJson);
  const usedIds = new Set(existing.map((question) => question.id));
  const questions: RefinementQuestion[] = input.questions.map((question) => {
    const id = question.id?.trim() || randomUUID();
    if (usedIds.has(id)) {
      throw createError({ statusCode: 400, statusMessage: 'duplicate_refinement_question' });
    }
    usedIds.add(id);
    return {
      ...question,
      id,
      question: question.question.trim(),
      rationale: question.rationale?.trim() || null,
      options: question.options?.map((option) => option.trim()).filter(Boolean),
      required: question.required !== false,
      round: refinement.round,
      answer: null,
      answeredAt: null,
      answeredBy: null,
    };
  });
  if (questions.some((question) => !question.question)) {
    throw createError({ statusCode: 400, statusMessage: 'refinement_question_invalid' });
  }

  db.transaction((tx) => {
    const updated = tx.update(schema.taskRefinements).set({
      status: 'awaiting_input',
      questionsJson: JSON.stringify([...existing, ...questions]),
      threadId: input.threadId === undefined ? refinement.threadId : input.threadId,
      awaitingInputAt: now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    }).where(validClaimCondition(refinementId, leaseToken, now)).run();
    if (updated.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
    }
    const task = requireTask(refinement.taskId);
    insertActivity(tx, task.projectId, task.id, null, 'refinement_awaiting_input', {
      refinementId,
      questionIds: questions.map((question) => question.id),
      round: refinement.round,
    }, now);
  });

  return requirePublicRefinement(refinementId);
}

export function completeRefinement(refinementId: string, input: {
  resultMarkdown?: string | null;
  result?: RefinementResult | null;
  complexity: RefinementComplexity;
  visuals?: RefinementVisual[];
  threadId?: string | null;
  codeRevision?: string | null;
}, leaseToken: string) {
  const refinement = requireRefinement(refinementId);
  if (refinement.status !== 'running') {
    throw createError({ statusCode: 409, statusMessage: 'refinement_not_running' });
  }
  const resultMarkdown = input.resultMarkdown?.trim() || (input.result ? renderRefinementMarkdown(input.result) : '');
  if (!resultMarkdown) {
    throw createError({ statusCode: 400, statusMessage: 'refinement_result_empty' });
  }
  const now = new Date().toISOString();
  db.transaction((tx) => {
    const updated = tx.update(schema.taskRefinements).set({
      status: 'completed',
      resultMarkdown,
      resultJson: input.result ? JSON.stringify(input.result) : null,
      complexity: input.complexity,
      visualsJson: JSON.stringify(input.visuals ?? []),
      threadId: input.threadId === undefined ? refinement.threadId : input.threadId,
      resultCodeRevision: input.codeRevision === undefined ? refinement.resultCodeRevision : input.codeRevision,
      error: null,
      completedAt: now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    }).where(validClaimCondition(refinementId, leaseToken, now)).run();
    if (updated.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'refinement_state_changed' });
    }
    const task = requireTask(refinement.taskId);
    insertActivity(tx, task.projectId, task.id, null, 'refinement_completed', {
      refinementId,
      complexity: input.complexity,
      visualCount: input.visuals?.length ?? 0,
    }, now);
  });
  return requirePublicRefinement(refinementId);
}

export function failRefinement(refinementId: string, error: unknown, leaseToken?: string) {
  const refinement = requireRefinement(refinementId);
  if (!ACTIVE_STATUSES.includes(refinement.status)) return toPublicRefinement(refinement);
  const now = new Date().toISOString();
  const publicError = refinementPublicErrorCode(error);
  if (refinement.status === 'running' && !leaseToken) {
    throw createError({ statusCode: 409, statusMessage: 'refinement_lease_required' });
  }
  db.transaction((tx) => {
    const updated = tx.update(schema.taskRefinements).set({
      status: 'failed',
      error: publicError,
      failedAt: now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    }).where(refinement.status === 'running'
      ? validClaimCondition(refinementId, leaseToken!, now)
      : and(
          eq(schema.taskRefinements.id, refinementId),
          inArray(schema.taskRefinements.status, ['queued', 'awaiting_input']),
        )).run();
    if (updated.changes !== 1) return;
    const task = requireTask(refinement.taskId);
    insertActivity(tx, task.projectId, task.id, null, 'refinement_failed', {
      refinementId,
      error: publicError,
    }, now);
  });
  return requirePublicRefinement(refinementId);
}

/** Requeues only expired (or legacy unleased) running work. Fresh leases live across process startup. */
export function requeueStaleRefinements(nowValue?: Date | string) {
  const now = isoTimestamp(nowValue);
  const legacyLeaseCutoff = new Date(Date.parse(now) - DEFAULT_REFINEMENT_LEASE_MS).toISOString();
  return db.update(schema.taskRefinements).set({
    status: 'queued',
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    error: null,
    updatedAt: now,
  }).where(and(
    eq(schema.taskRefinements.status, 'running'),
    or(
      and(
        isNull(schema.taskRefinements.leaseExpiresAt),
        lte(schema.taskRefinements.updatedAt, legacyLeaseCutoff),
      ),
      lte(schema.taskRefinements.leaseExpiresAt, now),
    ),
  )).run().changes;
}

/** Backwards-compatible name; unlike the old implementation this is lease-aware. */
export const requeueInterruptedRefinements = requeueStaleRefinements;

export function heartbeatRefinementLease(input: {
  refinementId: string;
  leaseToken: string;
  ownerId: string;
  leaseMs?: number;
  now?: Date | string;
}) {
  const now = isoTimestamp(input.now);
  const expiresAt = new Date(Date.parse(now) + positiveLeaseMs(input.leaseMs)).toISOString();
  const updated = db.update(schema.taskRefinements).set({
    heartbeatAt: now,
    leaseExpiresAt: expiresAt,
    updatedAt: now,
  }).where(and(
    validClaimCondition(input.refinementId, input.leaseToken, now),
    eq(schema.taskRefinements.leaseOwner, input.ownerId),
  )).run();
  return updated.changes === 1;
}

/** Clean shutdown path. The token predicate prevents releasing a successor's claim. */
export function releaseRefinementLease(refinementId: string, leaseToken: string) {
  const now = new Date().toISOString();
  return db.update(schema.taskRefinements).set({
    status: 'queued',
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    updatedAt: now,
  }).where(and(
    eq(schema.taskRefinements.id, refinementId),
    eq(schema.taskRefinements.status, 'running'),
    eq(schema.taskRefinements.leaseToken, leaseToken),
  )).run().changes === 1;
}

export function renderRefinementMarkdown(result: RefinementResult): string {
  const sections: string[] = [`## Kurz gesagt\n\n${result.summary.trim()}`];
  pushListSection(sections, 'Was sich dadurch ändert', result.applicationImpact);
  pushListSection(sections, 'Woran man erkennt, dass es fertig ist', result.acceptanceCriteria, true);

  const technicalSections: string[] = [];
  pushListSection(technicalSections, 'Umsetzung im bestehenden System', result.integrationPlan, false, 3);
  if (result.risks?.length) {
    technicalSections.push(`### Risiken und Gegenmassnahmen\n\n${result.risks.map((item) => {
      if (typeof item === 'string') return `- ${item}`;
      const severity = item.severity ? ` **[${item.severity.toUpperCase()}]**` : '';
      const mitigation = item.mitigation ? ` — Gegenmassnahme: ${item.mitigation}` : '';
      return `-${severity} ${item.risk}${mitigation}`;
    }).join('\n')}`);
  }
  pushListSection(technicalSections, 'Offene technische Fragen', result.openQuestions, false, 3);
  pushListSection(technicalSections, 'Technische Hinweise', result.notes, false, 3);
  if (technicalSections.length) sections.push(`## Technische Details\n\n${technicalSections.join('\n\n')}`);
  return sections.join('\n\n').trim();
}

function pushListSection(sections: string[], title: string, values?: string[], checklist = false, headingLevel = 2) {
  if (!values?.length) return;
  const prefix = checklist ? '- [ ]' : '-';
  sections.push(`${'#'.repeat(headingLevel)} ${title}\n\n${values.map((value) => `${prefix} ${value}`).join('\n')}`);
}

function authorizeTask(taskId: string, user: User) {
  const task = requireTask(taskId);
  const project = getProject(task.projectId, user);
  return { task, project };
}

function requireTask(taskId: string) {
  const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) throw createError({ statusCode: 404, statusMessage: 'task_not_found' });
  return task;
}

function requireRefinement(refinementId: string): TaskRefinement {
  const refinement = db.select().from(schema.taskRefinements)
    .where(eq(schema.taskRefinements.id, refinementId))
    .get();
  if (!refinement) throw createError({ statusCode: 404, statusMessage: 'refinement_not_found' });
  return refinement;
}

function requireTaskRefinement(taskId: string, refinementId: string) {
  const refinement = requireRefinement(refinementId);
  if (refinement.taskId !== taskId) {
    throw createError({ statusCode: 404, statusMessage: 'refinement_not_found' });
  }
  return refinement;
}

function requirePublicRefinement(refinementId: string) {
  return toPublicRefinement(requireRefinement(refinementId));
}

function activeRefinementForTask(taskId: string) {
  return db.select().from(schema.taskRefinements)
    .where(and(
      eq(schema.taskRefinements.taskId, taskId),
      inArray(schema.taskRefinements.status, ACTIVE_STATUSES),
    ))
    .get();
}

function toPublicRefinement(refinement: TaskRefinement): PublicTaskRefinement {
  const {
    questionsJson,
    visualsJson,
    resultJson,
    leaseOwner: _leaseOwner,
    leaseToken: _leaseToken,
    leaseExpiresAt: _leaseExpiresAt,
    heartbeatAt: _heartbeatAt,
    ...fields
  } = refinement;
  const requester = db.select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, refinement.requestedBy))
    .get();
  return {
    ...fields,
    questions: parseQuestions(questionsJson),
    visuals: parseJsonArray<RefinementVisual>(visualsJson),
    result: parseJsonObject<RefinementResult>(resultJson),
    requestedByName: requester?.name ?? null,
  };
}

function parseQuestions(value: string): RefinementQuestion[] {
  return parseJsonArray<RefinementQuestion>(value);
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T extends Record<string, unknown>>(value: string | null): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

function validateAnswer(question: RefinementQuestion, answer: RefinementAnswer | undefined) {
  const empty = answer == null || answer === '' || (Array.isArray(answer) && answer.length === 0);
  if (empty && question.required !== false) {
    throw createError({ statusCode: 400, statusMessage: 'refinement_answer_required' });
  }
  if (empty) return;
  if (question.type === 'boolean' && typeof answer !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'invalid_refinement_answer' });
  }
  if (question.type === 'multiple_choice') {
    if (!Array.isArray(answer) || answer.some((value) => !question.options?.includes(value))) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_refinement_answer' });
    }
  } else if (question.type === 'single_choice') {
    if (typeof answer !== 'string' || !question.options?.includes(answer)) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_refinement_answer' });
    }
  } else if (typeof answer !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'invalid_refinement_answer' });
  }
}

function readCodeRevision(folderPath: string): string | null {
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: folderPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: folderPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    return revision ? `${revision}${dirty ? '-dirty' : ''}` : null;
  } catch {
    return null;
  }
}

function insertActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  taskId: string,
  userId: string | null,
  action: string,
  metadata: unknown,
  createdAt: string,
) {
  tx.insert(schema.activity).values({
    id: randomUUID(),
    projectId,
    taskId,
    userId,
    action,
    metadata: JSON.stringify(metadata),
    createdAt,
  }).run();
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

function validClaimCondition(refinementId: string, leaseToken: string, now: string) {
  return and(
    eq(schema.taskRefinements.id, refinementId),
    eq(schema.taskRefinements.status, 'running'),
    eq(schema.taskRefinements.leaseToken, leaseToken),
    gt(schema.taskRefinements.leaseExpiresAt, now),
  );
}

function requireClaimField(value: string | null, code: string) {
  if (!value) throw new Error(code);
  return value;
}

function isoTimestamp(value?: Date | string) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function positiveLeaseMs(value?: number) {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : DEFAULT_REFINEMENT_LEASE_MS;
}

/** Stable, non-sensitive codes are persisted and localized by the client. */
function refinementPublicErrorCode(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '').toLowerCase()
    : '';
  if (code === 'request_timeout' || code === 'turn_timeout') return 'refinement_timeout';
  if (code === 'invalid_output') return 'refinement_invalid_output';
  if (code === 'refinement_master_sync_failed') return 'refinement_master_sync_failed';

  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const classification = `${code} ${name} ${message}`.toLowerCase();
  if (name === 'ZodError') return 'refinement_invalid_output';
  if (/security|policy|sandbox|approval|permission|symlink|outside_allowed/.test(classification)) {
    return 'refinement_security_policy';
  }
  if (/max_question_rounds|question_limit/.test(classification)) return 'refinement_question_limit';
  return 'refinement_failed';
}
