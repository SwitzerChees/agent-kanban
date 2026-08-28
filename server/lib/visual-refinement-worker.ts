import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { buildAgentsPromptPrefix, loadAgentsContext } from './agents-context';
import { CODEX_MODEL } from './agent-harness';
import { resolveServiceConfig } from './config';
import { runCodexSession } from './codex';
import { appDataDir, db, schema } from './db';
import { prepareTaskWorktree } from './git-workspaces';
import { runtimeLogger } from './logger';
import {
  completeRefinement,
  recordRefinementWorkspaceSync,
  setRefinementThread,
  type RefinementContext,
  type RefinementVisual,
} from './refinements';
import {
  closeTaskBrowserSession,
  taskHarnessBrowserSession,
  taskHarnessUnitName,
} from './task-harness-sandbox';
import type { Issue } from './types';
import { loadWorkflow } from './workflow';

const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;

const artifactSchema = z.object({
  title: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(1000).default(''),
  route: z.string().trim().max(500).default(''),
  viewport: z.string().trim().max(100).default(''),
  width: z.number().int().min(240).max(8000),
  height: z.number().int().min(240).max(8000),
  screenshotPath: z.string().trim().min(1).max(2000),
  baselinePath: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict();

const manifestSchema = z.object({
  summary: z.string().trim().min(1).max(5000),
  implementationNotes: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
  artifacts: z.array(artifactSchema).min(1).max(6),
}).strict();

type VisualManifest = z.infer<typeof manifestSchema>;

export async function processClaimedVisualRefinement(context: RefinementContext, signal: AbortSignal) {
  const worktree = await prepareTaskWorktree({
    projectPath: context.projectFolderPath,
    worktreePath: appDataDir('worktrees', context.projectId, context.taskId, 'tree'),
    taskId: context.taskId,
    taskKey: context.taskKey,
    signal,
  });
  recordRefinementWorkspaceSync(context.id, `${worktree.revision}${worktree.recoveryRef ? '-dirty' : ''}`, context.leaseToken, {
    branch: worktree.branchName,
    dirty: Boolean(worktree.recoveryRef),
  });

  const agentsContext = await loadAgentsContext(worktree.projectPath, worktree.worktreeRoot);
  const workspacePath = agentsContext.path ? path.dirname(agentsContext.path) : worktree.projectPath;
  const artifactDirectory = path.join(workspacePath, '.agent-kanban', 'visual-refinements', context.id);
  const manifestPath = path.join(artifactDirectory, 'manifest.json');
  await mkdir(artifactDirectory, { recursive: true });

  const workflow = await loadWorkflow();
  const config = resolveServiceConfig(workflow);
  const sessionRoot = appDataDir('refinement-sessions', context.projectId, context.taskId, context.id);
  const browserSession = taskHarnessBrowserSession(sessionRoot);
  const issue: Issue = {
    id: context.taskId,
    identifier: context.taskKey,
    title: context.taskTitle,
    description: context.taskDescription,
    priority: null,
    state: 'Visual refinement',
    branch_name: worktree.branchName,
    url: null,
    labels: ['visual-refinement'],
    blocked_by: [],
    created_at: null,
    updated_at: null,
  };
  const prompt = buildVisualRefinementPrompt(context, manifestPath, artifactDirectory);

  runtimeLogger.info('visual refinement started', {
    refinement_id: context.id,
    task_id: context.taskId,
    worktree: worktree.worktreeRoot,
    branch: worktree.branchName,
  });

  try {
    await runCodexSession({
      config: { ...config.codex, model: CODEX_MODEL, reasoningEffort: context.reasoningEffort },
      workspacePath,
      issue,
      promptTemplate: prompt,
      promptPrefix: [
        buildAgentsPromptPrefix(agentsContext),
        visualRuntimeInstructions(),
      ].join('\n\n---\n\n'),
      attempt: null,
      maxTurns: Math.min(4, Math.max(2, config.agent.maxTurns)),
      signal,
      onEvent: (event) => {
        if (event.event === 'item/agentMessage/delta') return;
        runtimeLogger.debug('visual refinement agent event', {
          refinement_id: context.id,
          event: event.event,
          message: event.message,
        });
      },
      refreshIssue: async () => issue,
      shouldContinue: () => false,
      completionCheck: async () => {
        try {
          await readVisualManifest(manifestPath, workspacePath);
          return { ok: true, message: 'visual refinement manifest and screenshots verified' };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            ok: false,
            message,
            prompt: [
              'The visual refinement is not complete yet.',
              `Fix this validation problem: ${message}`,
              `Then write the required manifest to ${manifestPath} and ensure every screenshot path exists.`,
            ].join('\n'),
          };
        }
      },
      nativeSessionId: context.threadId,
      onSession: (threadId) => {
        if (threadId === context.threadId) return;
        setRefinementThread(context.id, threadId, context.leaseToken);
        context.threadId = threadId;
      },
      runtime: {
        unitName: taskHarnessUnitName(context.taskId, context.id, 0),
        sessionRoot,
      },
    });

    const manifest = await readVisualManifest(manifestPath, workspacePath);
    const visuals = await persistVisualArtifacts(context, manifest, workspacePath);
    completeRefinement(context.id, {
      resultMarkdown: renderVisualRefinementMarkdown(manifest),
      complexity: visuals.length > 3 ? 'complex' : 'moderate',
      visuals,
      threadId: context.threadId,
      codeRevision: readCodeRevision(worktree.worktreeRoot),
    }, context.leaseToken);
    runtimeLogger.info('visual refinement completed', {
      refinement_id: context.id,
      task_id: context.taskId,
      artifacts: visuals.length,
    });
  } finally {
    await closeTaskBrowserSession(browserSession);
  }
}

function buildVisualRefinementPrompt(context: RefinementContext, manifestPath: string, artifactDirectory: string) {
  const settings = context.visualSettings;
  const requestedViews = [
    (settings?.desktop ?? true) ? '- Desktop view (recommended width 1440)' : null,
    (settings?.mobile ?? true) ? '- Mobile view (recommended width 390)' : null,
    settings?.states ? '- Relevant empty, loading, error, or edge states' : null,
  ].filter(Boolean).join('\n');
  const feedback = context.visualFeedbackComments?.length
    ? context.visualFeedbackComments.map((comment, index) => {
        const pin = comment.x == null || comment.y == null ? '' : `, pin ${comment.x / 100}% / ${comment.y / 100}%`;
        return `- ${index + 1}. ${comment.scope === 'all' ? 'all views' : `artifact ${comment.artifactId}`}${pin}: ${comment.body}`;
      }).join('\n')
    : '- No previous visual feedback; create the first proposal.';
  return [
    `Create visual refinement V${context.version ?? 1} for ${context.taskKey}: ${context.taskTitle}`,
    '',
    'Task context:',
    context.taskDescription?.trim() || '(no task description)',
    '',
    'Visual goal:',
    context.brief?.trim() || context.taskDescription?.trim() || context.taskTitle,
    '',
    'Requested captures:',
    requestedViews,
    '',
    'Feedback to incorporate:',
    feedback,
    '',
    'Work directly in this persistent task-owned worktree. Inspect the real application, implement a focused UI proposal using its existing design system, run the application, and use agent-browser to capture the resulting real UI. This is a proposal branch: never merge, deploy, or restart production.',
    'When useful, capture the unchanged baseline before editing so the review can compare before and after. Keep the UI calm and concise, preserve unrelated worktree changes, and validate the rendered result at the requested viewports.',
    '',
    `Save screenshots below ${artifactDirectory}.`,
    `Write the final manifest exactly to ${manifestPath}.`,
    'The manifest must be strict JSON with this shape:',
    '{',
    '  "summary": "Short description of the approved visual direction",',
    '  "implementationNotes": ["Concrete visible behavior or implementation note"],',
    '  "artifacts": [{',
    '    "title": "View name", "caption": "What this screen demonstrates",',
    '    "route": "/real/route", "viewport": "1440 × 900", "width": 1440, "height": 900,',
    '    "screenshotPath": "absolute or workspace-relative .png/.jpg/.webp path",',
    '    "baselinePath": "optional absolute or workspace-relative baseline path, otherwise null"',
    '  }]',
    '}',
    '',
    'Do not finish until the screenshots exist and the manifest parses as strict JSON.',
  ].join('\n');
}

function visualRuntimeInstructions() {
  return [
    'Visual refinement runtime:',
    '- You are in the task-owned isolated worktree. Never edit or operate on the main checkout.',
    '- Preserve all existing changes. Never reset, clean, force-checkout, merge, deploy, or restart production.',
    '- Start the proposal app on a free non-production port. Never bind port 3000 and never stop the production service.',
    '- Use agent-browser for browser interaction and screenshots of the real running application. If the direct agent-browser wrapper is unavailable, use `npx --yes agent-browser`; on hosts where Chromium reports no usable sandbox, launch the browser with `--args "--no-sandbox"`.',
    '- Keep generated evidence inside the requested visual-refinement artifact directory.',
    '- Stop temporary development servers before finishing when practical.',
  ].join('\n');
}

async function readVisualManifest(manifestPath: string, workspacePath: string): Promise<VisualManifest> {
  const manifestFile = await safeWorkspaceFile(manifestPath, workspacePath, false);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestFile, 'utf8'));
  } catch (error) {
    throw new Error(`visual_manifest_invalid_json:${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = manifestSchema.parse(value);
  for (const artifact of manifest.artifacts) {
    await safeWorkspaceFile(artifact.screenshotPath, workspacePath, true);
    if (artifact.baselinePath) await safeWorkspaceFile(artifact.baselinePath, workspacePath, true);
  }
  return manifest;
}

async function safeWorkspaceFile(value: string, workspacePath: string, imageOnly: boolean) {
  const workspaceRoot = await realpath(workspacePath);
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(workspacePath, value);
  if (candidate !== workspaceRoot && !candidate.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error('visual_artifact_outside_worktree');
  }
  const resolved = await realpath(candidate);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error('visual_artifact_outside_worktree');
  }
  const info = await lstat(resolved);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('visual_artifact_not_regular_file');
  if (imageOnly) {
    const extension = path.extname(resolved).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('visual_artifact_mime_invalid');
    const fileStats = await stat(resolved);
    if (fileStats.size <= 0 || fileStats.size > MAX_SCREENSHOT_BYTES) throw new Error('visual_artifact_size_invalid');
    const bytes = await readFile(resolved);
    if (!isSupportedImage(bytes, extension)) throw new Error('visual_artifact_format_invalid');
  }
  return resolved;
}

function isSupportedImage(bytes: Buffer, extension: string) {
  if (extension === '.png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

async function persistVisualArtifacts(context: RefinementContext, manifest: VisualManifest, workspacePath: string) {
  const visuals: RefinementVisual[] = [];
  for (const [index, artifact] of manifest.artifacts.entries()) {
    let baselineArtifactId: string | null = null;
    if (artifact.baselinePath) {
      const baselinePath = await safeWorkspaceFile(artifact.baselinePath, workspacePath, true);
      baselineArtifactId = await storeVisualArtifact(
        context,
        visualFileName(context.version ?? 1, index, artifact.title, 'before', baselinePath),
        imageMimeType(baselinePath),
        await readFile(baselinePath),
      );
    }
    const screenshotPath = await safeWorkspaceFile(artifact.screenshotPath, workspacePath, true);
    const artifactId = await storeVisualArtifact(
      context,
      visualFileName(context.version ?? 1, index, artifact.title, 'after', screenshotPath),
      imageMimeType(screenshotPath),
      await readFile(screenshotPath),
    );
    visuals.push({
      artifactId,
      baselineArtifactId,
      fileName: visualFileName(context.version ?? 1, index, artifact.title, 'after', screenshotPath),
      mimeType: imageMimeType(screenshotPath),
      title: artifact.title,
      caption: artifact.caption,
      route: artifact.route,
      viewport: artifact.viewport,
      width: artifact.width,
      height: artifact.height,
      createdAt: new Date().toISOString(),
    });
  }
  return visuals;
}

async function storeVisualArtifact(context: RefinementContext, fileName: string, mimeType: string, data: Buffer) {
  const id = randomUUID();
  const storagePath = appDataDir('refinement-artifacts', context.projectId, context.taskId, context.id, `${id}-${fileName}`);
  await writeFile(storagePath, data);
  db.insert(schema.taskRefinementArtifacts).values({
    id,
    taskId: context.taskId,
    refinementId: context.id,
    fileName,
    mimeType,
    size: data.byteLength,
    storagePath,
    createdAt: new Date().toISOString(),
  }).run();
  return id;
}

function renderVisualRefinementMarkdown(manifest: VisualManifest) {
  const sections = [
    '## Visuelle Umsetzung',
    '',
    manifest.summary,
    '',
    '### Ansichten',
    '',
    ...manifest.artifacts.map((artifact) => `- **${artifact.title}**${artifact.route ? ` · \`${artifact.route}\`` : ''}${artifact.viewport ? ` · ${artifact.viewport}` : ''}: ${artifact.caption || 'Gerenderte Zielansicht'}`),
  ];
  if (manifest.implementationNotes.length) {
    sections.push('', '### Umsetzungshinweise', '', ...manifest.implementationNotes.map((note) => `- ${note}`));
  }
  return sections.join('\n').trim();
}

function visualFileName(version: number, index: number, title: string, phase: 'before' | 'after', sourcePath: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `view-${index + 1}`;
  return `visual-refinement-v${version}-${index + 1}-${slug}-${phase}${path.extname(sourcePath).toLowerCase()}`;
}

function imageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function readCodeRevision(folderPath: string) {
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
