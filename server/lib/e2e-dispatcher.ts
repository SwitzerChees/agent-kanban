import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, asc, count, eq } from 'drizzle-orm';
import { appDataDir, db, schema } from './db';
import { resolveAgentHarness, resolveReasoningEffort, type AgentHarness, type ReasoningEffort } from './agent-harness';
import { runE2eBrowserHarness } from './e2e-browser-harness';
import { runtimeLogger } from './logger';
import {
  buildTaskHarnessRunner,
  closeTaskBrowserSession,
  prepareTaskHarnessRuntime,
  stopTaskHarnessUnit,
  taskHarnessBrowserSession,
} from './task-harness-sandbox';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACTS = 50;
const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
const MAX_ARTIFACT_TOTAL_BYTES = 100 * 1024 * 1024;

let dispatcher: E2eRunDispatcher | null = null;

export function startE2eRunDispatcher() {
  if (!dispatcher) {
    dispatcher = new E2eRunDispatcher();
  }
  dispatcher.start();
  return dispatcher;
}

export function abortE2eRun(runId: string) {
  return dispatcher?.abort(runId) ?? false;
}

class E2eRunDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = new Map<string, AbortController>();
  private promises = new Set<Promise<void>>();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    this.recoverInterruptedRuns();
    this.timer = setInterval(() => { void this.tick(); }, Math.max(500, Number.parseInt(process.env.KANBAN_E2E_POLL_MS ?? '2000', 10)));
    void this.tick();
  }

  async stop() {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const controller of this.running.values()) controller.abort();
    await Promise.allSettled([...this.promises]);
  }

  abort(runId: string) {
    const controller = this.running.get(runId);
    controller?.abort();
    return Boolean(controller);
  }

  private recoverInterruptedRuns() {
    const now = new Date().toISOString();
    db.update(schema.e2eTestRuns).set({
      status: 'failed',
      summary: 'Runner was interrupted by an Agent Kanban restart.',
      completedAt: now,
      updatedAt: now,
    }).where(eq(schema.e2eTestRuns.status, 'running')).run();
  }

  private async tick() {
    const queued = db.select().from(schema.e2eTestRuns)
      .where(eq(schema.e2eTestRuns.status, 'queued'))
      .orderBy(asc(schema.e2eTestRuns.createdAt)).all();
    for (const run of queued) {
      const project = db.select().from(schema.projects).where(eq(schema.projects.id, run.projectId)).get();
      if (!project || project.e2eConcurrencyLimit <= 0) continue;
      const persistedRunning = db.select({ value: count() }).from(schema.e2eTestRuns)
        .where(and(eq(schema.e2eTestRuns.projectId, run.projectId), eq(schema.e2eTestRuns.status, 'running'))).get()?.value ?? 0;
      if (persistedRunning >= project.e2eConcurrencyLimit) continue;
      const promise = this.execute(run.id);
      this.promises.add(promise);
      void promise.finally(() => this.promises.delete(promise));
    }
  }

  private async execute(runId: string) {
    if (this.running.has(runId)) return;
    const now = new Date().toISOString();
    const claimed = db.update(schema.e2eTestRuns).set({ status: 'running', startedAt: now, updatedAt: now })
      .where(and(eq(schema.e2eTestRuns.id, runId), eq(schema.e2eTestRuns.status, 'queued'))).run();
    if (!claimed.changes) return;
    const run = db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.id, runId)).get();
    const project = run ? db.select().from(schema.projects).where(eq(schema.projects.id, run.projectId)).get() : null;
    if (!run || !project) return;

    const controller = new AbortController();
    this.running.set(runId, controller);
    const runtimeRoot = appDataDir('e2e-runs', run.projectId, run.id);
    const inputDir = path.join(runtimeRoot, 'input');
    const artifactDir = path.join(runtimeRoot, 'artifacts');
    const caseFile = path.join(runtimeRoot, 'case.json');
    const browserSession = taskHarnessBrowserSession(runtimeRoot);
    let unitName: string | null = null;
    let output = '';
    try {
      await prepareTaskHarnessRuntime(runtimeRoot);
      await fs.mkdir(inputDir, { recursive: true });
      await fs.mkdir(artifactDir, { recursive: true });
      const definition = parseDefinition(run.definitionSnapshot);
      const stagedAssets = await stageAssets(definition, inputDir);
      definition.assets = stagedAssets;
      await fs.writeFile(caseFile, `${JSON.stringify({ ...definition, run: publicRunContext(run) }, null, 2)}\n`, 'utf8');
      runtimeLogger.info('e2e run started', {
        run_id: run.id, case_id: run.caseId, project: project.key, execution_mode: definition.executionMode,
      });
      let terminalStatus: 'passed' | 'warning' | 'failed';
      let summary: string;
      let exitCode: number | null = null;
      if (definition.executionMode === 'browser_harness') {
        if (!definition.targetUrl) throw new Error('e2e_browser_target_url_required');
        output = redactOutput(await runE2eBrowserHarness({
          definition: { ...definition, targetUrl: definition.targetUrl },
          runId: run.id,
          projectKey: project.key,
          workspacePath: project.folderPath,
          runtimeRoot,
          caseFile,
          inputDir,
          artifactDir,
          targetRevision: run.targetRevision,
          signal: controller.signal,
          onUnit: (activeUnit) => { unitName = activeUnit; },
        }));
        const marker = resultMarker(output);
        terminalStatus = marker?.status ?? 'failed';
        summary = marker?.summary ?? 'Browser harness did not return a structured E2E result.';
      } else {
        const command = definition.runnerCommand.trim();
        if (!command) throw new Error('e2e_runner_command_required');
        const runner = buildTaskHarnessRunner({
          unitName: e2eUnitName(run.id),
          executable: '/bin/bash',
          args: ['-lc', command],
          workspacePath: project.folderPath,
          sessionRoot: runtimeRoot,
          harness: 'codex',
          workspaceWritable: false,
          inheritProcessEnv: false,
          protectAgentCredentials: true,
          isolatedHome: true,
          extraEnv: e2eRuntimeEnvironment(run, definition, caseFile, inputDir, artifactDir),
        });
        unitName = runner.unitName;
        const result = await runCommand(runner.command, runner.args, runner.env, project.folderPath, definition.timeoutSeconds, controller.signal);
        exitCode = result.code;
        output = redactOutput(result.output);
        const marker = !result.timedOut && result.code === 0 ? resultMarker(output) : null;
        terminalStatus = result.timedOut ? 'failed' : result.code === 0 ? marker?.status ?? 'passed' : 'failed';
        summary = marker?.summary
          ?? (result.timedOut ? `Timed out after ${definition.timeoutSeconds} seconds.`
            : result.code === 0 ? 'E2E command completed successfully.' : `E2E command exited with code ${result.code ?? 'unknown'}.`);
      }
      await collectArtifacts(run.id, artifactDir);
      if (db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.id, run.id)).get()?.status === 'cancelled') return;
      finishRun(run.id, terminalStatus, summary, output);
      runtimeLogger.info('e2e run completed', { run_id: run.id, status: terminalStatus, exit_code: exitCode });
    } catch (error) {
      const current = db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.id, run.id)).get();
      if (current?.status !== 'cancelled') {
        await collectArtifacts(run.id, artifactDir).catch(() => undefined);
        finishRun(run.id, controller.signal.aborted ? 'cancelled' : 'failed',
          controller.signal.aborted ? 'Run cancelled.' : normalizeError(error), output);
      }
      runtimeLogger.error('e2e run failed', { run_id: run.id, error: normalizeError(error) });
    } finally {
      this.running.delete(runId);
      await stopTaskHarnessUnit(unitName);
      await closeTaskBrowserSession(browserSession);
      await cleanupRuntimeSecrets(runtimeRoot, inputDir, caseFile);
    }
  }
}

async function cleanupRuntimeSecrets(runtimeRoot: string, inputDir: string, caseFile: string) {
  await Promise.allSettled([
    fs.rm(inputDir, { recursive: true, force: true }),
    fs.rm(caseFile, { force: true }),
    ...['codex-home', 'prime-agent', 'prime-supervisor', 'prime-sessions', 'xdg-data', 'xdg-state', 'xdg-cache', 'home']
      .map((name) => fs.rm(path.join(runtimeRoot, name), { recursive: true, force: true })),
  ]);
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string, timeoutSeconds: number, signal: AbortSignal) {
  return new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    let settled = false;
    const append = (chunk: Buffer) => {
      if (Buffer.byteLength(output) >= MAX_OUTPUT_BYTES) return;
      output += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - Buffer.byteLength(output));
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const terminate = () => child.kill('SIGTERM');
    signal.addEventListener('abort', terminate, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
    }, Math.max(10, timeoutSeconds) * 1000);
    timer.unref();
    const finish = (code: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', terminate);
      if (error) reject(error);
      else resolve({ code, output, timedOut });
    };
    child.once('error', (error) => finish(null, error));
    child.once('exit', (code) => finish(code));
  });
}

async function stageAssets(definition: E2eDefinition, inputDir: string) {
  const staged: Array<{ id: string; fileName: string; inputPath: string }> = [];
  for (const assetSnapshot of definition.assets ?? []) {
    const asset = db.select().from(schema.e2eTestCaseAssets).where(eq(schema.e2eTestCaseAssets.id, assetSnapshot.id)).get();
    if (!asset) continue;
    const inputPath = path.join(inputDir, `${asset.id}-${safeFileName(asset.fileName)}`);
    await fs.copyFile(asset.storagePath, inputPath);
    staged.push({ id: asset.id, fileName: asset.fileName, inputPath });
  }
  return staged;
}

async function collectArtifacts(runId: string, artifactDir: string) {
  const existing = db.select().from(schema.e2eTestRunArtifacts).where(eq(schema.e2eTestRunArtifacts.runId, runId)).all();
  if (existing.length) return;
  const entries = await fs.readdir(artifactDir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries.slice(0, MAX_ARTIFACTS)) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const storagePath = path.join(artifactDir, entry.name);
    const stat = await fs.stat(storagePath);
    if (stat.size > MAX_ARTIFACT_BYTES || total + stat.size > MAX_ARTIFACT_TOTAL_BYTES) continue;
    total += stat.size;
    db.insert(schema.e2eTestRunArtifacts).values({
      id: randomUUID(),
      runId,
      fileName: entry.name,
      mimeType: mimeType(entry.name),
      size: stat.size,
      storagePath,
      createdAt: new Date().toISOString(),
    }).run();
  }
}

function finishRun(runId: string, status: 'passed' | 'warning' | 'failed' | 'cancelled', summary: string, output: string) {
  const now = new Date().toISOString();
  db.update(schema.e2eTestRuns).set({ status, summary, output, completedAt: now, updatedAt: now })
    .where(eq(schema.e2eTestRuns.id, runId)).run();
  const run = db.select().from(schema.e2eTestRuns).where(eq(schema.e2eTestRuns.id, runId)).get();
  if (!run) return;
  db.insert(schema.activity).values({
    id: randomUUID(), projectId: run.projectId, taskId: null, userId: null,
    action: 'e2e_run_completed', metadata: JSON.stringify({ runId, caseId: run.caseId, status, summary }), createdAt: now,
  }).run();
}

function resultMarker(output: string): { status: 'passed' | 'warning' | 'failed'; summary?: string } | null {
  for (const line of output.split(/\r?\n/).reverse()) {
    const marker = line.match(/^AGENT_KANBAN_RESULT=(.+)$/)?.[1];
    if (!marker) continue;
    try {
      const parsed = JSON.parse(marker) as { status?: unknown; summary?: unknown };
      if (!['passed', 'warning', 'failed'].includes(String(parsed.status))) return null;
      return {
        status: parsed.status as 'passed' | 'warning' | 'failed',
        summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1_000) : undefined,
      };
    } catch { return null; }
  }
  return null;
}

function publicRunContext(run: typeof schema.e2eTestRuns.$inferSelect) {
  return {
    id: run.id,
    batchId: run.batchId,
    triggerType: run.triggerType,
    triggerTaskId: run.triggerTaskId,
    targetRevision: run.targetRevision,
  };
}

interface E2eDefinition {
  id: string;
  title: string;
  scenario: string;
  preconditions: string;
  expectedResult: string;
  roles: string[];
  targetUrl: string | null;
  executionMode: 'browser_harness' | 'project_command';
  agentHarness: AgentHarness;
  reasoningEffort: ReasoningEffort;
  runnerCommand: string;
  timeoutSeconds: number;
  assets: Array<{ id: string; fileName: string; inputPath?: string }>;
}

function parseDefinition(value: string): E2eDefinition {
  const parsed = JSON.parse(value) as Partial<E2eDefinition>;
  if (!parsed || typeof parsed !== 'object') throw new Error('invalid_e2e_definition_snapshot');
  return {
    id: String(parsed.id ?? ''),
    title: String(parsed.title ?? ''),
    scenario: String(parsed.scenario ?? ''),
    preconditions: String(parsed.preconditions ?? ''),
    expectedResult: String(parsed.expectedResult ?? ''),
    roles: Array.isArray(parsed.roles) ? parsed.roles.map(String) : [],
    targetUrl: typeof parsed.targetUrl === 'string' ? parsed.targetUrl : null,
    executionMode: parsed.executionMode === 'project_command' ? 'project_command' : 'browser_harness',
    agentHarness: resolveAgentHarness(parsed.agentHarness),
    reasoningEffort: resolveReasoningEffort(parsed.reasoningEffort),
    runnerCommand: typeof parsed.runnerCommand === 'string' ? parsed.runnerCommand : '',
    timeoutSeconds: Number.isInteger(parsed.timeoutSeconds) ? Math.min(7_200, Math.max(10, parsed.timeoutSeconds!)) : 900,
    assets: Array.isArray(parsed.assets) ? parsed.assets.filter((asset): asset is { id: string; fileName: string } => Boolean(asset && typeof asset.id === 'string' && typeof asset.fileName === 'string')) : [],
  };
}

function e2eRuntimeEnvironment(
  run: typeof schema.e2eTestRuns.$inferSelect,
  definition: E2eDefinition,
  caseFile: string,
  inputDir: string,
  artifactDir: string,
) {
  return {
    AGENT_KANBAN_E2E_RUN_ID: run.id,
    AGENT_KANBAN_E2E_CASE_ID: run.caseId ?? '',
    AGENT_KANBAN_E2E_CASE_FILE: caseFile,
    AGENT_KANBAN_E2E_INPUT_DIR: inputDir,
    AGENT_KANBAN_E2E_ARTIFACT_DIR: artifactDir,
    AGENT_KANBAN_E2E_TARGET_URL: definition.targetUrl ?? '',
    AGENT_KANBAN_E2E_TARGET_REVISION: run.targetRevision ?? '',
  };
}

function e2eUnitName(runId: string) {
  return `agent-kanban-e2e-${runId.replace(/[^a-z0-9]/gi, '').slice(0, 16)}-${Date.now().toString(36)}`;
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'file';
}

function mimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.json': 'application/json', '.zip': 'application/zip', '.txt': 'text/plain', '.html': 'text/html',
    '.webm': 'video/webm', '.mp4': 'video/mp4', '.xml': 'application/xml',
  } as Record<string, string>)[extension] ?? 'application/octet-stream';
}

function redactOutput(value: string) {
  return value
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s]+/gi, '$1[REDACTED]')
    .slice(0, MAX_OUTPUT_BYTES);
}

function normalizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}
