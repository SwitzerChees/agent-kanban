import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, asc, count, desc, eq, inArray, max } from 'drizzle-orm';
import { createError } from 'h3';
import { appDataDir, db, schema } from './db';
import type { User } from './db/schema';
import { resolveAgentHarness, resolveReasoningEffort, type AgentHarness, type ReasoningEffort } from './agent-harness';

const MAX_SUITES_PER_PROJECT = 100;
const MAX_CASES_PER_PROJECT = 1_000;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 100_000;
const MAX_COMMAND_LENGTH = 4_000;
const MAX_ASSETS_PER_CASE = 30;

export interface E2eSuiteInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  position?: number;
  expectedUpdatedAt?: string;
}

export interface E2eCaseInput {
  suiteId?: string;
  title?: string;
  scenario?: string;
  preconditions?: string;
  expectedResult?: string;
  roles?: string[];
  targetUrl?: string | null;
  executionMode?: 'browser_harness' | 'project_command';
  agentHarness?: AgentHarness;
  reasoningEffort?: ReasoningEffort;
  runnerCommand?: string;
  timeoutSeconds?: number;
  triggerColumnKey?: string | null;
  triggerOberthemaId?: string | null;
  triggerUnterthemaId?: string | null;
  enabled?: boolean;
  position?: number;
  expectedUpdatedAt?: string;
}

export interface UploadedE2eAsset {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface QueueE2eRunInput {
  targetRevision?: string | null;
  triggerType?: 'manual' | 'api';
}

export function listProjectE2e(projectId: string, user: User) {
  authorizeProject(projectId, user);
  const suites = db.select().from(schema.e2eTestSuites)
    .where(eq(schema.e2eTestSuites.projectId, projectId))
    .orderBy(asc(schema.e2eTestSuites.position), asc(schema.e2eTestSuites.createdAt)).all();
  const cases = db.select().from(schema.e2eTestCases)
    .where(eq(schema.e2eTestCases.projectId, projectId))
    .orderBy(asc(schema.e2eTestCases.position), asc(schema.e2eTestCases.createdAt)).all();
  const caseIds = cases.map((testCase) => testCase.id);
  const assets = caseIds.length
    ? db.select().from(schema.e2eTestCaseAssets)
      .where(inArray(schema.e2eTestCaseAssets.caseId, caseIds))
      .orderBy(asc(schema.e2eTestCaseAssets.createdAt)).all()
    : [];
  const runs = db.select().from(schema.e2eTestRuns)
    .where(eq(schema.e2eTestRuns.projectId, projectId))
    .orderBy(desc(schema.e2eTestRuns.createdAt)).limit(200).all();
  const runIds = runs.map((run) => run.id);
  const artifacts = runIds.length
    ? db.select().from(schema.e2eTestRunArtifacts)
      .where(inArray(schema.e2eTestRunArtifacts.runId, runIds))
      .orderBy(asc(schema.e2eTestRunArtifacts.createdAt)).all()
    : [];
  const latestRunByCase = new Map<string, typeof schema.e2eTestRuns.$inferSelect>();
  for (const run of runs) {
    if (run.caseId && !latestRunByCase.has(run.caseId)) latestRunByCase.set(run.caseId, run);
  }
  return {
    suites,
    cases: cases.map((testCase) => decorateCase(
      testCase,
      assets.filter((asset) => asset.caseId === testCase.id),
      latestRunByCase.get(testCase.id) ?? null,
    )),
    runs: runs.map((run) => decorateRun(run, artifacts.filter((artifact) => artifact.runId === run.id), false)),
  };
}

export function createE2eSuite(projectId: string, input: E2eSuiteInput & { name: string }, user: User) {
  authorizeProject(projectId, user);
  const existing = db.select({ value: count() }).from(schema.e2eTestSuites)
    .where(eq(schema.e2eTestSuites.projectId, projectId)).get()?.value ?? 0;
  if (existing >= MAX_SUITES_PER_PROJECT) throw createError({ statusCode: 409, statusMessage: 'too_many_e2e_suites' });
  const now = new Date().toISOString();
  const currentMax = db.select({ value: max(schema.e2eTestSuites.position) }).from(schema.e2eTestSuites)
    .where(eq(schema.e2eTestSuites.projectId, projectId)).get()?.value ?? -1000;
  const suite: typeof schema.e2eTestSuites.$inferInsert = {
    id: randomUUID(),
    projectId,
    name: normalizeTitle(input.name, 'e2e_suite_name_required'),
    description: normalizeOptionalText(input.description),
    enabled: input.enabled ?? true,
    position: input.position ?? currentMax + 1000,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((tx) => {
    tx.insert(schema.e2eTestSuites).values(suite).run();
    insertActivity(tx, projectId, user.id, 'e2e_suite_created', { suiteId: suite.id, name: suite.name }, now);
  });
  return suite;
}

export function updateE2eSuite(suiteId: string, input: E2eSuiteInput, user: User) {
  const suite = authorizeSuite(suiteId, user);
  assertRevision(suite.updatedAt, input.expectedUpdatedAt);
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(schema.e2eTestSuites).set({
      name: input.name === undefined ? undefined : normalizeTitle(input.name, 'e2e_suite_name_required'),
      description: input.description === undefined ? undefined : normalizeOptionalText(input.description),
      enabled: input.enabled,
      position: input.position,
      updatedBy: user.id,
      updatedAt: now,
    }).where(eq(schema.e2eTestSuites.id, suiteId)).run();
    insertActivity(tx, suite.projectId, user.id, 'e2e_suite_updated', { suiteId }, now);
  });
  return db.select().from(schema.e2eTestSuites).where(eq(schema.e2eTestSuites.id, suiteId)).get()!;
}

export function deleteE2eSuite(suiteId: string, user: User) {
  const suite = authorizeSuite(suiteId, user);
  const existing = db.select({ value: count() }).from(schema.e2eTestCases)
    .where(eq(schema.e2eTestCases.suiteId, suiteId)).get()?.value ?? 0;
  if (existing > 0) throw createError({ statusCode: 409, statusMessage: 'e2e_suite_not_empty' });
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(schema.e2eTestSuites).where(eq(schema.e2eTestSuites.id, suiteId)).run();
    insertActivity(tx, suite.projectId, user.id, 'e2e_suite_deleted', { suiteId, name: suite.name }, now);
  });
  return { ok: true };
}

export function createE2eCase(projectId: string, input: E2eCaseInput & { suiteId: string; title: string }, user: User) {
  authorizeProject(projectId, user);
  if (normalizeExecutionMode(input.executionMode) === 'project_command' && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'e2e_project_command_admin_required' });
  }
  const suite = db.select().from(schema.e2eTestSuites).where(eq(schema.e2eTestSuites.id, input.suiteId)).get();
  if (!suite || suite.projectId !== projectId) throw createError({ statusCode: 400, statusMessage: 'invalid_e2e_suite' });
  const existing = db.select({ value: count() }).from(schema.e2eTestCases)
    .where(eq(schema.e2eTestCases.projectId, projectId)).get()?.value ?? 0;
  if (existing >= MAX_CASES_PER_PROJECT) throw createError({ statusCode: 409, statusMessage: 'too_many_e2e_cases' });
  validateTrigger(projectId, input);
  const now = new Date().toISOString();
  const currentMax = db.select({ value: max(schema.e2eTestCases.position) }).from(schema.e2eTestCases)
    .where(eq(schema.e2eTestCases.suiteId, input.suiteId)).get()?.value ?? -1000;
  const testCase: typeof schema.e2eTestCases.$inferInsert = {
    id: randomUUID(),
    projectId,
    suiteId: input.suiteId,
    title: normalizeTitle(input.title, 'e2e_case_title_required'),
    scenario: normalizeText(input.scenario ?? ''),
    preconditions: normalizeText(input.preconditions ?? ''),
    expectedResult: normalizeText(input.expectedResult ?? ''),
    rolesJson: JSON.stringify(normalizeRoles(input.roles)),
    targetUrl: normalizeUrl(input.targetUrl),
    executionMode: normalizeExecutionMode(input.executionMode),
    agentHarness: resolveAgentHarness(input.agentHarness),
    reasoningEffort: resolveReasoningEffort(input.reasoningEffort),
    runnerCommand: normalizeCommand(input.runnerCommand ?? ''),
    timeoutSeconds: normalizeTimeout(input.timeoutSeconds),
    triggerColumnKey: normalizeNullable(input.triggerColumnKey),
    triggerOberthemaId: input.triggerOberthemaId ?? null,
    triggerUnterthemaId: input.triggerUnterthemaId ?? null,
    enabled: input.enabled ?? true,
    position: input.position ?? currentMax + 1000,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  db.transaction((tx) => {
    tx.insert(schema.e2eTestCases).values(testCase).run();
    insertActivity(tx, projectId, user.id, 'e2e_case_created', { caseId: testCase.id, suiteId: testCase.suiteId, title: testCase.title }, now);
  });
  return getDecoratedCase(testCase.id);
}

export function updateE2eCase(caseId: string, input: E2eCaseInput, user: User) {
  const testCase = authorizeCase(caseId, user);
  assertRevision(testCase.updatedAt, input.expectedUpdatedAt);
  const changesExecutableCommand = input.runnerCommand !== undefined
    && normalizeCommand(input.runnerCommand) !== testCase.runnerCommand;
  const selectsProjectCommand = input.executionMode === 'project_command' && testCase.executionMode !== 'project_command';
  if (user.role !== 'admin' && (changesExecutableCommand || selectsProjectCommand)) {
    throw createError({ statusCode: 403, statusMessage: 'e2e_project_command_admin_required' });
  }
  if (input.suiteId !== undefined) {
    const suite = db.select().from(schema.e2eTestSuites).where(eq(schema.e2eTestSuites.id, input.suiteId)).get();
    if (!suite || suite.projectId !== testCase.projectId) throw createError({ statusCode: 400, statusMessage: 'invalid_e2e_suite' });
  }
  validateTrigger(testCase.projectId, {
    triggerOberthemaId: input.triggerOberthemaId === undefined ? testCase.triggerOberthemaId : input.triggerOberthemaId,
    triggerUnterthemaId: input.triggerUnterthemaId === undefined ? testCase.triggerUnterthemaId : input.triggerUnterthemaId,
  });
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(schema.e2eTestCases).set({
      suiteId: input.suiteId,
      title: input.title === undefined ? undefined : normalizeTitle(input.title, 'e2e_case_title_required'),
      scenario: input.scenario === undefined ? undefined : normalizeText(input.scenario),
      preconditions: input.preconditions === undefined ? undefined : normalizeText(input.preconditions),
      expectedResult: input.expectedResult === undefined ? undefined : normalizeText(input.expectedResult),
      rolesJson: input.roles === undefined ? undefined : JSON.stringify(normalizeRoles(input.roles)),
      targetUrl: input.targetUrl === undefined ? undefined : normalizeUrl(input.targetUrl),
      executionMode: input.executionMode === undefined ? undefined : normalizeExecutionMode(input.executionMode),
      agentHarness: input.agentHarness === undefined ? undefined : resolveAgentHarness(input.agentHarness),
      reasoningEffort: input.reasoningEffort === undefined ? undefined : resolveReasoningEffort(input.reasoningEffort),
      runnerCommand: input.runnerCommand === undefined ? undefined : normalizeCommand(input.runnerCommand),
      timeoutSeconds: input.timeoutSeconds === undefined ? undefined : normalizeTimeout(input.timeoutSeconds),
      triggerColumnKey: input.triggerColumnKey === undefined ? undefined : normalizeNullable(input.triggerColumnKey),
      triggerOberthemaId: input.triggerOberthemaId === undefined ? undefined : input.triggerOberthemaId,
      triggerUnterthemaId: input.triggerUnterthemaId === undefined ? undefined : input.triggerUnterthemaId,
      enabled: input.enabled,
      position: input.position,
      updatedBy: user.id,
      updatedAt: now,
    }).where(eq(schema.e2eTestCases.id, caseId)).run();
    insertActivity(tx, testCase.projectId, user.id, 'e2e_case_updated', { caseId }, now);
  });
  return getDecoratedCase(caseId);
}

export async function deleteE2eCase(caseId: string, user: User) {
  const testCase = authorizeCase(caseId, user);
  const active = db.select({ id: schema.e2eTestRuns.id }).from(schema.e2eTestRuns)
    .where(and(eq(schema.e2eTestRuns.caseId, caseId), inArray(schema.e2eTestRuns.status, ['queued', 'running']))).get();
  if (active) throw createError({ statusCode: 409, statusMessage: 'e2e_case_running' });
  const assets = db.select().from(schema.e2eTestCaseAssets).where(eq(schema.e2eTestCaseAssets.caseId, caseId)).all();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.delete(schema.e2eTestCases).where(eq(schema.e2eTestCases.id, caseId)).run();
    insertActivity(tx, testCase.projectId, user.id, 'e2e_case_deleted', { caseId, title: testCase.title }, now);
  });
  await Promise.allSettled(assets.map((asset) => fs.rm(asset.storagePath, { force: true })));
  return { ok: true };
}

export async function addE2eCaseAssets(caseId: string, files: UploadedE2eAsset[], user: User) {
  const testCase = authorizeCase(caseId, user);
  const existing = db.select({ value: count() }).from(schema.e2eTestCaseAssets)
    .where(eq(schema.e2eTestCaseAssets.caseId, caseId)).get()?.value ?? 0;
  if (existing + files.length > MAX_ASSETS_PER_CASE) throw createError({ statusCode: 409, statusMessage: 'too_many_e2e_assets' });
  const stored: Array<typeof schema.e2eTestCaseAssets.$inferInsert> = [];
  try {
    for (const file of files) {
      const id = randomUUID();
      const safeName = safeFileName(file.fileName);
      const storagePath = appDataDir('e2e-assets', testCase.projectId, caseId, `${id}-${safeName}`);
      await fs.writeFile(storagePath, file.data);
      const asset: typeof schema.e2eTestCaseAssets.$inferInsert = {
        id,
        caseId,
        fileName: file.fileName,
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.data.byteLength,
        storagePath,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      };
      db.insert(schema.e2eTestCaseAssets).values(asset).run();
      stored.push(asset);
    }
  } catch (error) {
    if (stored.length) db.delete(schema.e2eTestCaseAssets).where(inArray(schema.e2eTestCaseAssets.id, stored.map((asset) => asset.id!))).run();
    await Promise.allSettled(stored.map((asset) => fs.rm(asset.storagePath!, { force: true })));
    throw error;
  }
  logActivity(testCase.projectId, user.id, 'e2e_assets_added', { caseId, count: stored.length });
  return getDecoratedCase(caseId);
}

export function getE2eCaseAsset(assetId: string, user: User) {
  const asset = db.select().from(schema.e2eTestCaseAssets).where(eq(schema.e2eTestCaseAssets.id, assetId)).get();
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'e2e_asset_not_found' });
  const testCase = authorizeCase(asset.caseId, user);
  return { asset, testCase };
}

export async function deleteE2eCaseAsset(assetId: string, user: User) {
  const { asset, testCase } = getE2eCaseAsset(assetId, user);
  const active = db.select({ id: schema.e2eTestRuns.id }).from(schema.e2eTestRuns)
    .where(and(eq(schema.e2eTestRuns.caseId, testCase.id), inArray(schema.e2eTestRuns.status, ['queued', 'running']))).get();
  if (active) throw createError({ statusCode: 409, statusMessage: 'e2e_case_running' });
  await fs.rm(asset.storagePath, { force: true });
  db.delete(schema.e2eTestCaseAssets).where(eq(schema.e2eTestCaseAssets.id, assetId)).run();
  logActivity(testCase.projectId, user.id, 'e2e_asset_deleted', { caseId: testCase.id, assetId, fileName: asset.fileName });
  return { ok: true };
}

export function queueE2eCase(caseId: string, input: QueueE2eRunInput, user: User) {
  const testCase = authorizeCase(caseId, user);
  const run = queueCaseRecord(testCase, {
    batchId: randomUUID(),
    requestedBy: user.id,
    triggerType: input.triggerType ?? 'manual',
    targetRevision: normalizeNullable(input.targetRevision),
    triggerTaskId: null,
  });
  if (!run) throw createError({ statusCode: 409, statusMessage: 'e2e_case_not_runnable' });
  return run;
}

export function queueE2eSuite(suiteId: string, input: QueueE2eRunInput, user: User) {
  const suite = authorizeSuite(suiteId, user);
  if (!suite.enabled) throw createError({ statusCode: 409, statusMessage: 'e2e_suite_disabled' });
  const enabledCases = db.select().from(schema.e2eTestCases)
    .where(and(eq(schema.e2eTestCases.suiteId, suiteId), eq(schema.e2eTestCases.enabled, true)))
    .orderBy(asc(schema.e2eTestCases.position), asc(schema.e2eTestCases.createdAt)).all();
  const cases = enabledCases.filter((testCase) => !caseRunnableError(testCase));
  if (!cases.length) throw createError({ statusCode: 409, statusMessage: 'e2e_suite_has_no_runnable_cases' });
  const batchId = randomUUID();
  const runs = cases.map((testCase) => queueCaseRecord(testCase, {
    batchId,
    requestedBy: user.id,
    triggerType: input.triggerType ?? 'manual',
    targetRevision: normalizeNullable(input.targetRevision),
    triggerTaskId: null,
  }, true)).filter(Boolean);
  if (!runs.length) throw createError({ statusCode: 409, statusMessage: 'e2e_suite_already_running' });
  return { batchId, runs };
}

export function queueE2eCases(projectId: string, caseIds: string[], input: QueueE2eRunInput, user: User) {
  authorizeProject(projectId, user);
  const uniqueIds = [...new Set(caseIds)];
  const cases = uniqueIds.map((caseId) => {
    const testCase = authorizeCase(caseId, user);
    if (testCase.projectId !== projectId) throw createError({ statusCode: 400, statusMessage: 'e2e_dispatch_project_mismatch' });
    return testCase;
  });
  const batchId = randomUUID();
  const runs = cases.map((testCase) => queueCaseRecord(testCase, {
    batchId,
    requestedBy: user.id,
    triggerType: input.triggerType ?? 'api',
    targetRevision: normalizeNullable(input.targetRevision),
    triggerTaskId: null,
  }, true)).filter(Boolean);
  if (!runs.length) throw createError({ statusCode: 409, statusMessage: 'e2e_cases_already_running' });
  return { batchId, runs };
}

export function queueE2eForTaskTransition(task: typeof schema.tasks.$inferSelect, columnKey: string, requestedBy: string) {
  const cases = db.select().from(schema.e2eTestCases).where(and(
    eq(schema.e2eTestCases.projectId, task.projectId),
    eq(schema.e2eTestCases.enabled, true),
    eq(schema.e2eTestCases.triggerColumnKey, columnKey),
  )).orderBy(asc(schema.e2eTestCases.position)).all().filter((testCase) => (
    (!testCase.triggerOberthemaId || testCase.triggerOberthemaId === task.oberthemaId)
    && (!testCase.triggerUnterthemaId || testCase.triggerUnterthemaId === task.unterthemaId)
  ));
  if (!cases.length) return [];
  const batchId = randomUUID();
  return cases.map((testCase) => queueCaseRecord(testCase, {
    batchId,
    requestedBy,
    triggerType: 'task_status',
    targetRevision: null,
    triggerTaskId: task.id,
  }, true)).filter(Boolean);
}

export function getE2eRun(runId: string, user: User) {
  const run = db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.id, runId)).get();
  if (!run) throw createError({ statusCode: 404, statusMessage: 'e2e_run_not_found' });
  authorizeProject(run.projectId, user);
  const artifacts = db.select().from(schema.e2eTestRunArtifacts)
    .where(eq(schema.e2eTestRunArtifacts.runId, runId)).orderBy(asc(schema.e2eTestRunArtifacts.createdAt)).all();
  return decorateRun(run, artifacts, true);
}

export function getE2eRunArtifact(artifactId: string, user: User) {
  const artifact = db.select().from(schema.e2eTestRunArtifacts).where(eq(schema.e2eTestRunArtifacts.id, artifactId)).get();
  if (!artifact) throw createError({ statusCode: 404, statusMessage: 'e2e_artifact_not_found' });
  const run = db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.id, artifact.runId)).get();
  if (!run) throw createError({ statusCode: 404, statusMessage: 'e2e_run_not_found' });
  authorizeProject(run.projectId, user);
  return { artifact, run };
}

export function markQueuedE2eRunCancelled(runId: string, user: User) {
  const run = getE2eRun(runId, user);
  if (!['queued', 'running'].includes(run.status)) throw createError({ statusCode: 409, statusMessage: 'e2e_run_not_cancelable' });
  const now = new Date().toISOString();
  db.update(schema.e2eTestRuns).set({ status: 'cancelled', summary: 'Cancelled by user.', completedAt: now, updatedAt: now })
    .where(and(eq(schema.e2eTestRuns.id, runId), inArray(schema.e2eTestRuns.status, ['queued', 'running']))).run();
  logActivity(run.projectId, user.id, 'e2e_run_cancelled', { runId });
  return getE2eRun(runId, user);
}

function queueCaseRecord(testCase: typeof schema.e2eTestCases.$inferSelect, input: {
  batchId: string;
  requestedBy: string | null;
  triggerType: 'manual' | 'task_status' | 'api';
  triggerTaskId: string | null;
  targetRevision: string | null;
}, skipActive = false) {
  const runnableError = caseRunnableError(testCase);
  if (!testCase.enabled || runnableError) {
    if (skipActive) return null;
    throw createError({ statusCode: 409, statusMessage: !testCase.enabled ? 'e2e_case_disabled' : runnableError! });
  }
  const suite = db.select().from(schema.e2eTestSuites).where(eq(schema.e2eTestSuites.id, testCase.suiteId)).get();
  if (!suite?.enabled) {
    if (skipActive) return null;
    throw createError({ statusCode: 409, statusMessage: 'e2e_suite_disabled' });
  }
  const active = db.select().from(schema.e2eTestRuns).where(and(
    eq(schema.e2eTestRuns.caseId, testCase.id),
    inArray(schema.e2eTestRuns.status, ['queued', 'running']),
  )).get();
  if (active) {
    if (skipActive) return null;
    throw createError({ statusCode: 409, statusMessage: 'e2e_case_already_running' });
  }
  const assets = db.select().from(schema.e2eTestCaseAssets).where(eq(schema.e2eTestCaseAssets.caseId, testCase.id)).all();
  const now = new Date().toISOString();
  const run: typeof schema.e2eTestRuns.$inferInsert = {
    id: randomUUID(),
    batchId: input.batchId,
    projectId: testCase.projectId,
    suiteId: testCase.suiteId,
    caseId: testCase.id,
    caseTitle: testCase.title,
    triggerType: input.triggerType,
    triggerTaskId: input.triggerTaskId,
    targetRevision: input.targetRevision,
    executionMode: testCase.executionMode,
    agentHarness: testCase.agentHarness,
    status: 'queued',
    summary: null,
    output: '',
    definitionSnapshot: JSON.stringify(caseSnapshot(testCase, assets)),
    requestedBy: input.requestedBy,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  };
  db.transaction((tx) => {
    tx.insert(schema.e2eTestRuns).values(run).run();
    insertActivity(tx, testCase.projectId, input.requestedBy, 'e2e_run_queued', {
      runId: run.id,
      batchId: run.batchId,
      caseId: testCase.id,
      triggerType: run.triggerType,
      triggerTaskId: run.triggerTaskId,
    }, now);
  });
  return decorateRun(run as typeof schema.e2eTestRuns.$inferSelect, []);
}

function validateTrigger(projectId: string, input: Pick<E2eCaseInput, 'triggerOberthemaId' | 'triggerUnterthemaId'>) {
  const topicId = input.triggerOberthemaId;
  const subtopicId = input.triggerUnterthemaId;
  if (topicId) {
    const topic = db.select().from(schema.oberthemen).where(eq(schema.oberthemen.id, topicId)).get();
    if (!topic || topic.projectId !== projectId) throw createError({ statusCode: 400, statusMessage: 'invalid_e2e_trigger_topic' });
  }
  if (subtopicId) {
    const subtopic = db.select({ subtopic: schema.unterthemen, projectId: schema.oberthemen.projectId })
      .from(schema.unterthemen)
      .innerJoin(schema.oberthemen, eq(schema.unterthemen.oberthemaId, schema.oberthemen.id))
      .where(eq(schema.unterthemen.id, subtopicId)).get();
    if (!subtopic || subtopic.projectId !== projectId || (topicId && subtopic.subtopic.oberthemaId !== topicId)) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_e2e_trigger_subtopic' });
    }
  }
}

function authorizeProject(projectId: string, user: User) {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) throw createError({ statusCode: 404, statusMessage: 'project_not_found' });
  if (user.role !== 'admin') {
    const member = db.select().from(schema.projectUsers).where(and(
      eq(schema.projectUsers.projectId, projectId),
      eq(schema.projectUsers.userId, user.id),
    )).get();
    if (!member) throw createError({ statusCode: 403, statusMessage: 'project_forbidden' });
  }
  return project;
}

function authorizeSuite(suiteId: string, user: User) {
  const suite = db.select().from(schema.e2eTestSuites).where(eq(schema.e2eTestSuites.id, suiteId)).get();
  if (!suite) throw createError({ statusCode: 404, statusMessage: 'e2e_suite_not_found' });
  authorizeProject(suite.projectId, user);
  return suite;
}

function authorizeCase(caseId: string, user: User) {
  const testCase = db.select().from(schema.e2eTestCases).where(eq(schema.e2eTestCases.id, caseId)).get();
  if (!testCase) throw createError({ statusCode: 404, statusMessage: 'e2e_case_not_found' });
  authorizeProject(testCase.projectId, user);
  return testCase;
}

function getDecoratedCase(caseId: string) {
  const testCase = db.select().from(schema.e2eTestCases).where(eq(schema.e2eTestCases.id, caseId)).get()!;
  const assets = db.select().from(schema.e2eTestCaseAssets).where(eq(schema.e2eTestCaseAssets.caseId, caseId)).all();
  const latestRun = db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.caseId, caseId))
    .orderBy(desc(schema.e2eTestRuns.createdAt)).get() ?? null;
  return decorateCase(testCase, assets, latestRun);
}

function decorateCase(testCase: typeof schema.e2eTestCases.$inferSelect, assets: Array<typeof schema.e2eTestCaseAssets.$inferSelect>, latestRun: typeof schema.e2eTestRuns.$inferSelect | null) {
  const { rolesJson: _rolesJson, ...publicCase } = testCase;
  return {
    ...publicCase,
    roles: parseStringArray(testCase.rolesJson),
    assets: assets.map((asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
      url: `/api/e2e-assets/${asset.id}`,
    })),
    latestRun: latestRun ? decorateRun(latestRun, []) : null,
  };
}

function decorateRun(run: typeof schema.e2eTestRuns.$inferSelect, artifacts: Array<typeof schema.e2eTestRunArtifacts.$inferSelect>, fullOutput = false) {
  const { definitionSnapshot: _definitionSnapshot, ...publicRun } = run;
  const visibleOutput = fullOutput ? run.output : run.output.slice(-50_000);
  return {
    ...publicRun,
    output: visibleOutput,
    outputTruncated: visibleOutput.length !== run.output.length,
    definition: safeJson(run.definitionSnapshot),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      fileName: artifact.fileName,
      mimeType: artifact.mimeType,
      size: artifact.size,
      createdAt: artifact.createdAt,
      url: `/api/e2e-run-artifacts/${artifact.id}`,
    })),
  };
}

function caseSnapshot(testCase: typeof schema.e2eTestCases.$inferSelect, assets: Array<typeof schema.e2eTestCaseAssets.$inferSelect>) {
  return {
    id: testCase.id,
    suiteId: testCase.suiteId,
    title: testCase.title,
    scenario: testCase.scenario,
    preconditions: testCase.preconditions,
    expectedResult: testCase.expectedResult,
    roles: parseStringArray(testCase.rolesJson),
    targetUrl: testCase.targetUrl,
    executionMode: testCase.executionMode,
    agentHarness: testCase.agentHarness,
    reasoningEffort: testCase.reasoningEffort,
    runnerCommand: testCase.runnerCommand,
    timeoutSeconds: testCase.timeoutSeconds,
    assets: assets.map((asset) => ({ id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, size: asset.size })),
    capturedAt: new Date().toISOString(),
  };
}

function normalizeTitle(value: string, message: string) {
  const normalized = value.trim();
  if (!normalized) throw createError({ statusCode: 400, statusMessage: message });
  if (normalized.length > MAX_TITLE_LENGTH) throw createError({ statusCode: 400, statusMessage: 'e2e_title_too_long' });
  return normalized;
}

function normalizeText(value: string) {
  if (value.length > MAX_DESCRIPTION_LENGTH) throw createError({ statusCode: 413, statusMessage: 'e2e_content_too_large' });
  return value.trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  return value ? normalizeText(value) || null : null;
}

function normalizeCommand(value: string) {
  const command = value.trim();
  if (command.length > MAX_COMMAND_LENGTH) throw createError({ statusCode: 400, statusMessage: 'e2e_command_too_long' });
  return command;
}

function normalizeExecutionMode(value: E2eCaseInput['executionMode']) {
  return value === 'project_command' ? 'project_command' : 'browser_harness';
}

function caseRunnableError(testCase: typeof schema.e2eTestCases.$inferSelect) {
  if (testCase.executionMode === 'project_command') {
    return testCase.runnerCommand.trim() ? null : 'e2e_runner_command_required';
  }
  if (!testCase.targetUrl || !testCase.scenario.trim() || !testCase.expectedResult.trim()) {
    return 'e2e_browser_definition_incomplete';
  }
  return null;
}

function normalizeRoles(value: string[] | undefined) {
  return [...new Set((value ?? []).map((role) => role.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeTimeout(value: number | undefined) {
  return Number.isInteger(value) ? Math.min(7_200, Math.max(10, value!)) : 900;
}

function normalizeUrl(value: string | null | undefined) {
  const normalized = normalizeNullable(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported_protocol');
    return url.toString();
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_e2e_target_url' });
  }
}

function normalizeNullable(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseStringArray(value: string) {
  const parsed = safeJson(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function assertRevision(actual: string, expected: string | undefined) {
  if (expected !== undefined && actual !== expected) throw createError({ statusCode: 409, statusMessage: 'e2e_record_stale' });
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'asset';
}

function logActivity(projectId: string, userId: string | null, action: string, metadata: unknown) {
  const now = new Date().toISOString();
  db.insert(schema.activity).values({
    id: randomUUID(), projectId, taskId: null, userId, action,
    metadata: JSON.stringify(metadata), createdAt: now,
  }).run();
}

function insertActivity(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], projectId: string, userId: string | null, action: string, metadata: unknown, now: string) {
  tx.insert(schema.activity).values({
    id: randomUUID(), projectId, taskId: null, userId, action,
    metadata: JSON.stringify(metadata), createdAt: now,
  }).run();
}
