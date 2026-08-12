import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-task-export-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'task-export-test@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'task-export-test-password';

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let refinements: typeof import('../server/lib/refinements');
let taskExport: typeof import('../server/lib/task-export');
let admin: User;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  refinements = await import('../server/lib/refinements');
  taskExport = await import('../server/lib/task-export');
  const seededAdmin = dbModule.db.select().from(dbModule.schema.users).get();
  if (!seededAdmin) throw new Error('seeded_admin_missing');
  admin = seededAdmin;
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('task ZIP export', () => {
  test('contains descriptions, refinements, comments, activity, and every attachment variant', async () => {
    const project = await kanban.createProject({
      name: 'Export Project',
      key: 'EXPORT',
      folderPath: path.join(testRoot, 'workspace'),
    }, admin);
    const task = await kanban.createTask(project.id, {
      title: 'Package the full task',
      description: 'Original human brief',
      tags: ['release', 'evidence'],
      files: [{
        fileName: '../evidence.txt',
        mimeType: 'text/plain',
        data: Buffer.from('original attachment'),
      }, {
        fileName: 'screen.png',
        mimeType: 'image/png',
        data: Buffer.from('original image'),
        annotation: {
          data: { version: 1, strokes: [{ color: '#ff0000' }] },
          renderedImage: Buffer.from('annotated image'),
        },
      }],
    }, admin);
    if (!task) throw new Error('task_missing');

    const refinement = refinements.createTaskRefinement(task.id, {
      brief: 'Challenge the implementation plan',
    }, admin);
    const completedAt = '2026-08-12T10:00:00.000Z';
    dbModule.db.update(dbModule.schema.taskRefinements).set({
      status: 'completed',
      questionsJson: JSON.stringify([{
        id: 'scope',
        question: 'Include comments?',
        required: true,
        round: 1,
        answer: 'Yes',
        answeredAt: completedAt,
      }]),
      resultMarkdown: '## Result\n\nShip a complete archive.',
      resultJson: JSON.stringify({ summary: 'Complete archive' }),
      visualsJson: JSON.stringify([]),
      complexity: 'moderate',
      leaseToken: 'must-never-be-exported',
      completedAt,
      updatedAt: completedAt,
    }).where(eq(dbModule.schema.taskRefinements.id, refinement.id)).run();
    dbModule.db.update(dbModule.schema.tasks).set({
      refinedDescription: 'Applied refined brief',
      descriptionSource: 'refined',
    }).where(eq(dbModule.schema.tasks.id, task.id)).run();
    kanban.addTaskComment(task.id, 'Keep the source material together.', [], admin);
    kanban.logTaskActivity(project.id, task.id, admin.id, 'export_test_marker', { included: true });

    const bundle = taskExport.buildTaskExportBundle(task.id, admin, '2026-08-12T12:00:00.000Z');
    const bundleJson = JSON.stringify(bundle.manifest);
    expect(bundle.fileName).toBe('EXPORT-1-package-the-full-task.zip');
    expect(bundleJson).toContain('Original human brief');
    expect(bundleJson).toContain('Applied refined brief');
    expect(bundleJson).toContain('Complete archive');
    expect(bundleJson).toContain('Keep the source material together.');
    expect(bundleJson).not.toContain('must-never-be-exported');
    expect(bundleJson).not.toContain(path.join(testRoot, 'data', 'uploads'));

    const { stream } = taskExport.createTaskExportArchive(task.id, admin);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const files = unzipSync(Buffer.concat(chunks));
    const names = Object.keys(files);

    expect(names).toContain('README.md');
    expect(names).toContain('task.json');
    expect(names).toContain('descriptions/original.md');
    expect(names).toContain('descriptions/refined.md');
    expect(names).toContain('descriptions/active.md');
    expect(names).toContain('comments/comments.md');
    expect(names).toContain('activity/activity.json');
    expect(names).toContain('refinements/v01-completed.md');
    expect(names).toContain('refinements/v01-completed.json');
    expect(names).toContain('attachments/files/__evidence.txt');
    expect(names).toContain('attachments/files/screen.png');
    expect(names).toContain('attachments/annotations/screen-annotated.png');
    expect(names).toContain('attachments/annotations/screen-annotation.json');
    expect(names.every((name) => !name.includes('../'))).toBe(true);
    expect(strFromU8(files['attachments/files/__evidence.txt']!)).toBe('original attachment');
    expect(strFromU8(files['attachments/annotations/screen-annotated.png']!)).toBe('annotated image');
    expect(strFromU8(files['descriptions/active.md']!)).toContain('Applied refined brief');
    expect(strFromU8(files['task.json']!)).not.toContain('must-never-be-exported');
  });
});
