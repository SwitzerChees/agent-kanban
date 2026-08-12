import fs from 'node:fs';
import path from 'node:path';
import { type Archiver, ZipArchive } from 'archiver';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import type { User } from './db/schema';
import { authorizeTaskAccess, getTaskDetail } from './kanban';

interface ArchiveDiskFile {
  archivePath: string;
  storagePath: string;
}

interface ArchiveTextFile {
  archivePath: string;
  content: string;
}

export interface TaskExportBundle {
  fileName: string;
  manifest: Record<string, unknown>;
  textFiles: ArchiveTextFile[];
  diskFiles: ArchiveDiskFile[];
}

export interface TaskExportArchive {
  fileName: string;
  stream: Archiver;
}

export function buildTaskExportBundle(taskId: string, user: User, exportedAt = new Date().toISOString()): TaskExportBundle {
  const { task, project } = authorizeTaskAccess(taskId, user);
  const detail = getTaskDetail(taskId, user);
  const column = db.select().from(schema.columns).where(eq(schema.columns.id, task.columnId)).get() ?? null;
  const swimlane = task.swimlaneId
    ? db.select().from(schema.swimlanes).where(eq(schema.swimlanes.id, task.swimlaneId)).get() ?? null
    : null;
  const storedAttachments = db.select().from(schema.attachments)
    .where(eq(schema.attachments.taskId, taskId))
    .orderBy(asc(schema.attachments.createdAt))
    .all();
  const annotations = storedAttachments.length
    ? db.select().from(schema.attachmentAnnotations)
        .where(inArray(schema.attachmentAnnotations.attachmentId, storedAttachments.map((attachment) => attachment.id)))
        .all()
    : [];
  const refinements = db.select().from(schema.taskRefinements)
    .where(eq(schema.taskRefinements.taskId, taskId))
    .orderBy(asc(schema.taskRefinements.version))
    .all();
  const activity = db.select().from(schema.activity)
    .where(eq(schema.activity.taskId, taskId))
    .orderBy(asc(schema.activity.createdAt))
    .all();

  const relevantUserIds = new Set([
    task.createdBy,
    task.assigneeId,
    ...detail.comments.flatMap((comment) => [comment.userId, ...comment.mentions.map((mention) => mention.userId)]),
    ...storedAttachments.map((attachment) => attachment.createdBy),
    ...annotations.map((annotation) => annotation.updatedBy),
    ...refinements.flatMap((refinement) => [refinement.requestedBy, refinement.appliedBy]),
    ...activity.map((entry) => entry.userId),
  ].filter((id): id is string => Boolean(id)));
  const people = relevantUserIds.size
    ? db.select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
      }).from(schema.users).where(inArray(schema.users.id, [...relevantUserIds])).all()
    : [];
  const personById = new Map(people.map((person) => [person.id, person]));
  const publicPerson = (id: string | null | undefined) => id
    ? personById.get(id) ?? { id, name: null, email: null }
    : null;

  const diskFiles: ArchiveDiskFile[] = [];
  const attachmentPaths = uniqueArchivePathAllocator();
  const missingFiles: Array<{ attachmentId: string; variant: 'original' | 'annotated'; expectedArchivePath: string }> = [];
  const exportedAttachments = storedAttachments.map((attachment) => {
    const annotation = annotations.find((candidate) => candidate.attachmentId === attachment.id) ?? null;
    const originalArchivePath = attachmentPaths(`attachments/files/${safeArchiveSegment(attachment.fileName, 'attachment')}`);
    const parsedName = path.parse(attachment.fileName);
    const annotatedArchivePath = annotation
      ? attachmentPaths(`attachments/annotations/${safeArchiveSegment(parsedName.name, 'attachment')}-annotated.png`)
      : null;
    const annotationDataPath = annotation
      ? attachmentPaths(`attachments/annotations/${safeArchiveSegment(parsedName.name, 'attachment')}-annotation.json`)
      : null;

    if (fs.existsSync(attachment.storagePath)) {
      diskFiles.push({ archivePath: originalArchivePath, storagePath: attachment.storagePath });
    } else {
      missingFiles.push({ attachmentId: attachment.id, variant: 'original', expectedArchivePath: originalArchivePath });
    }
    if (annotation && annotatedArchivePath) {
      if (fs.existsSync(annotation.renderedStoragePath)) {
        diskFiles.push({ archivePath: annotatedArchivePath, storagePath: annotation.renderedStoragePath });
      } else {
        missingFiles.push({ attachmentId: attachment.id, variant: 'annotated', expectedArchivePath: annotatedArchivePath });
      }
    }

    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdBy: publicPerson(attachment.createdBy),
      createdAt: attachment.createdAt,
      archivePath: fs.existsSync(attachment.storagePath) ? originalArchivePath : null,
      annotation: annotation
        ? {
            data: parseJson(annotation.annotationData, annotation.annotationData),
            dataArchivePath: annotationDataPath,
            renderedArchivePath: annotatedArchivePath && fs.existsSync(annotation.renderedStoragePath) ? annotatedArchivePath : null,
            updatedBy: publicPerson(annotation.updatedBy),
            updatedAt: annotation.updatedAt,
          }
        : null,
    };
  });

  const exportedRefinements = refinements.map((refinement) => ({
    id: refinement.id,
    version: refinement.version,
    status: refinement.status,
    requestedBy: publicPerson(refinement.requestedBy),
    brief: refinement.brief,
    visualMode: refinement.visualMode,
    sourceDescription: refinement.sourceDescription,
    sourceTaskUpdatedAt: refinement.sourceTaskUpdatedAt,
    sourceCodeRevision: refinement.sourceCodeRevision,
    resultCodeRevision: refinement.resultCodeRevision,
    questions: parseJson(refinement.questionsJson, []),
    round: refinement.round,
    resultMarkdown: refinement.resultMarkdown,
    result: parseJson(refinement.resultJson, null),
    complexity: refinement.complexity,
    visuals: parseJson(refinement.visualsJson, []),
    threadId: refinement.threadId,
    error: refinement.error,
    createdAt: refinement.createdAt,
    startedAt: refinement.startedAt,
    awaitingInputAt: refinement.awaitingInputAt,
    completedAt: refinement.completedAt,
    failedAt: refinement.failedAt,
    appliedAt: refinement.appliedAt,
    appliedBy: publicPerson(refinement.appliedBy),
    updatedAt: refinement.updatedAt,
  }));

  const exportedComments = detail.comments.map((comment) => ({
    id: comment.id,
    kind: comment.kind,
    body: comment.body,
    author: publicPerson(comment.userId),
    mentions: comment.mentions.map((mention) => publicPerson(mention.userId)),
    createdAt: comment.createdAt,
  }));
  const exportedActivity = activity.map((entry) => ({
    id: entry.id,
    action: entry.action,
    user: publicPerson(entry.userId),
    metadata: redactInternalMetadata(parseJson(entry.metadata, entry.metadata)),
    createdAt: entry.createdAt,
  }));
  const activeDescription = task.descriptionSource === 'refined'
    ? task.refinedDescription
    : task.description;

  const manifest = {
    format: 'agent-kanban-task-export',
    formatVersion: 1,
    exportedAt,
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
    },
    task: {
      id: task.id,
      key: task.key,
      title: task.title,
      description: {
        original: task.description,
        refined: task.refinedDescription,
        active: activeDescription,
        activeSource: task.descriptionSource,
      },
      priority: task.priority,
      position: task.position,
      column,
      swimlane,
      hierarchy: detail.hierarchy,
      tags: detail.task.tags,
      createdBy: publicPerson(task.createdBy),
      assignee: publicPerson(task.assigneeId),
      agentEnabled: task.agentEnabled,
      agentStatus: task.agentStatus,
      clientRequestId: task.clientRequestId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    attachments: exportedAttachments,
    refinements: exportedRefinements,
    comments: exportedComments,
    activity: exportedActivity,
    missingFiles,
  };

  const textFiles: ArchiveTextFile[] = [
    { archivePath: 'README.md', content: taskReadme(manifest, missingFiles) },
    { archivePath: 'task.json', content: jsonFile(manifest) },
    { archivePath: 'descriptions/original.md', content: markdownFile(task.description) },
    { archivePath: 'descriptions/refined.md', content: markdownFile(task.refinedDescription) },
    { archivePath: 'descriptions/active.md', content: markdownFile(activeDescription) },
    { archivePath: 'comments/comments.md', content: commentsMarkdown(exportedComments) },
    { archivePath: 'comments/comments.json', content: jsonFile(exportedComments) },
    { archivePath: 'activity/activity.md', content: activityMarkdown(exportedActivity) },
    { archivePath: 'activity/activity.json', content: jsonFile(exportedActivity) },
    { archivePath: 'attachments/index.json', content: jsonFile(exportedAttachments) },
    { archivePath: 'refinements/index.json', content: jsonFile(exportedRefinements) },
  ];

  for (const attachment of exportedAttachments) {
    if (!attachment.annotation?.dataArchivePath) continue;
    textFiles.push({
      archivePath: attachment.annotation.dataArchivePath,
      content: jsonFile(attachment.annotation.data),
    });
  }
  for (const refinement of exportedRefinements) {
    const version = String(refinement.version).padStart(2, '0');
    const basePath = `refinements/v${version}-${safeArchiveSegment(refinement.status, 'unknown')}`;
    textFiles.push(
      { archivePath: `${basePath}.md`, content: refinementMarkdown(refinement) },
      { archivePath: `${basePath}.json`, content: jsonFile(refinement) },
    );
  }
  if (missingFiles.length) {
    textFiles.push({ archivePath: 'missing-files.json', content: jsonFile(missingFiles) });
  }

  return {
    fileName: exportFileName(task.key, task.title),
    manifest,
    textFiles,
    diskFiles,
  };
}

export function createTaskExportArchive(taskId: string, user: User): TaskExportArchive {
  const bundle = buildTaskExportBundle(taskId, user);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const archiveDate = new Date(String(bundle.manifest.exportedAt));

  for (const file of bundle.textFiles) {
    archive.append(file.content, { name: file.archivePath, date: archiveDate });
  }
  for (const file of bundle.diskFiles) {
    archive.file(file.storagePath, { name: file.archivePath, date: archiveDate });
  }
  void archive.finalize();

  return { fileName: bundle.fileName, stream: archive };
}

function safeArchiveSegment(value: string, fallback: string) {
  const safe = value
    .normalize('NFC')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001F\u007F]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/^\.+/, '_')
    .slice(0, 180);
  return safe || fallback;
}

function uniqueArchivePathAllocator() {
  const reserved = new Set<string>();
  return (requestedPath: string) => {
    const parsed = path.posix.parse(requestedPath);
    let candidate = requestedPath;
    let suffix = 2;
    while (reserved.has(candidate.toLocaleLowerCase('en'))) {
      candidate = path.posix.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
      suffix += 1;
    }
    reserved.add(candidate.toLocaleLowerCase('en'));
    return candidate;
  };
}

function exportFileName(taskKey: string, title: string) {
  const titleSlug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .toLowerCase();
  return `${safeArchiveSegment(taskKey, 'task')}${titleSlug ? `-${titleSlug}` : ''}.zip`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T | string {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value;
  }
}

function redactInternalMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactInternalMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => (
    /path$/i.test(key) || /^lease/i.test(key)
      ? []
      : [[key, redactInternalMetadata(item)]]
  )));
}

function jsonFile(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownFile(value: string | null | undefined) {
  return value?.trimEnd() ? `${value.trimEnd()}\n` : '_No content._\n';
}

function taskReadme(manifest: Record<string, any>, missingFiles: unknown[]) {
  const task = manifest.task;
  const project = manifest.project;
  const hierarchy = [task.hierarchy?.oberthema?.name, task.hierarchy?.unterthema?.name].filter(Boolean).join(' / ') || '—';
  return `# ${escapeMarkdown(task.key)} — ${escapeMarkdown(task.title)}

Exported from Agent Kanban on ${manifest.exportedAt}.

| Field | Value |
| --- | --- |
| Project | ${escapeMarkdown(`${project.key} — ${project.name}`)} |
| Topic | ${escapeMarkdown(hierarchy)} |
| Status | ${escapeMarkdown(task.column?.nameEn ?? task.column?.key ?? '—')} |
| Priority | ${escapeMarkdown(task.priority)} |
| Active description | ${escapeMarkdown(task.description.activeSource)} |
| Assignee | ${escapeMarkdown(task.assignee?.name ?? 'Unassigned')} |
| Tags | ${escapeMarkdown(task.tags.join(', ') || '—')} |
| Attachments | ${manifest.attachments.length} |
| Refinements | ${manifest.refinements.length} |
| Comments | ${manifest.comments.length} |

## Contents

- \`task.json\`: complete, machine-readable task export
- \`descriptions/\`: original, refined, and active task descriptions
- \`refinements/\`: every refinement version as Markdown and JSON
- \`attachments/\`: original attachments plus rendered annotations and drawing data
- \`comments/\`: team comments and steering messages
- \`activity/\`: complete task activity history
${missingFiles.length ? `\n> Warning: ${missingFiles.length} stored file variant(s) were missing on the server. See \`missing-files.json\`.\n` : ''}`;
}

function commentsMarkdown(comments: Array<Record<string, any>>) {
  if (!comments.length) return '# Comments\n\n_No comments._\n';
  const entries = comments.map((comment) => `## ${escapeMarkdown(comment.author?.name ?? 'Unknown')} · ${comment.createdAt}

Kind: ${escapeMarkdown(comment.kind)}

${comment.body.trimEnd() || '_No content._'}
`);
  return `# Comments\n\n${entries.join('\n')}\n`;
}

function activityMarkdown(activity: Array<Record<string, any>>) {
  if (!activity.length) return '# Activity\n\n_No activity._\n';
  const entries = activity.map((entry) => {
    const metadata = entry.metadata == null ? '' : `\n\n${indentBlock(JSON.stringify(entry.metadata, null, 2))}`;
    return `## ${escapeMarkdown(entry.action)} · ${entry.createdAt}

Actor: ${escapeMarkdown(entry.user?.name ?? 'System')}${metadata}
`;
  });
  return `# Activity\n\n${entries.join('\n')}\n`;
}

function refinementMarkdown(refinement: Record<string, any>) {
  const questions = Array.isArray(refinement.questions) && refinement.questions.length
    ? refinement.questions.map((question: Record<string, unknown>, index: number) => {
        const prompt = String(question.question ?? question.prompt ?? `Question ${index + 1}`);
        const answer = question.answer == null ? 'Unanswered' : typeof question.answer === 'string'
          ? question.answer
          : JSON.stringify(question.answer);
        return `${index + 1}. **${escapeMarkdown(prompt)}**\n\n   ${String(answer).replace(/\n/g, '\n   ')}`;
      }).join('\n\n')
    : '_No questions._';
  return `# Refinement v${refinement.version}

| Field | Value |
| --- | --- |
| Status | ${escapeMarkdown(refinement.status)} |
| Requested by | ${escapeMarkdown(refinement.requestedBy?.name ?? 'Unknown')} |
| Created | ${escapeMarkdown(refinement.createdAt)} |
| Completed | ${escapeMarkdown(refinement.completedAt ?? '—')} |
| Applied | ${escapeMarkdown(refinement.appliedAt ?? '—')} |
| Complexity | ${escapeMarkdown(refinement.complexity ?? '—')} |

## Brief

${refinement.brief?.trimEnd() || '_No separate brief._'}

## Questions and answers

${questions}

## Result

${refinement.resultMarkdown?.trimEnd() || '_No result._'}
`;
}

function escapeMarkdown(value: unknown) {
  return String(value ?? '').replace(/([\\|*_`])/g, '\\$1').replace(/\r?\n/g, ' ');
}

function indentBlock(value: string) {
  return value.split('\n').map((line) => `    ${line}`).join('\n');
}
