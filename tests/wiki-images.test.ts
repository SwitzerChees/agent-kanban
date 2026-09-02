import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { User } from '../server/lib/db/schema';

const testRoot = mkdtempSync(path.join(tmpdir(), 'agent-kanban-wiki-images-'));
process.env.KANBAN_DATA_DIR = path.join(testRoot, 'data');
process.env.KANBAN_ADMIN_EMAIL = 'wiki-images-admin@example.com';
process.env.KANBAN_ADMIN_PASSWORD = 'wiki-images-test-password';

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('test-png-payload'),
]);
const renderedImage = `data:image/png;base64,${validPng.toString('base64')}`;

let dbModule: typeof import('../server/lib/db');
let kanban: typeof import('../server/lib/kanban');
let wiki: typeof import('../server/lib/wiki');
let wikiImages: typeof import('../server/lib/wiki-images');
let admin: User;
let member: User;
let outsider: User;
let projectId: string;

beforeAll(async () => {
  dbModule = await import('../server/lib/db');
  kanban = await import('../server/lib/kanban');
  wiki = await import('../server/lib/wiki');
  wikiImages = await import('../server/lib/wiki-images');
  admin = dbModule.db.select().from(dbModule.schema.users).get()!;
  member = insertUser('wiki-images-member', 'Wiki Images Member');
  outsider = insertUser('wiki-images-outsider', 'Wiki Images Outsider');
  const project = await kanban.createProject({
    name: 'Wiki Images Project',
    key: 'WIMG',
    folderPath: path.join(testRoot, 'project'),
    userIds: [member.id],
  }, admin);
  projectId = project.id;
});

afterAll(() => rmSync(testRoot, { recursive: true, force: true }));

describe('Wiki images', () => {
  test('persists source images, editable drawings, and comment pins for project members', async () => {
    const page = wiki.createWikiPage(projectId, { title: 'Image handbook' }, admin);
    const image = await wikiImages.createWikiImage(page.id, {
      fileName: 'clipboard capture.png',
      mimeType: 'image/png',
      data: validPng,
    }, member);

    expect(image).toMatchObject({
      pageId: page.id,
      fileName: 'clipboard capture.png',
      mimeType: 'image/png',
      size: validPng.length,
      annotation: { version: 1, strokes: [], pins: [] },
    });
    expect(image.url).toContain(`/api/wiki-images/${image.id}`);
    expect(image.sourceUrl).toContain('variant=source');
    expect(wikiImages.listWikiImages(page.id, admin)).toHaveLength(1);

    const annotationData = {
      version: 1 as const,
      strokes: [{
        color: '#ef4444',
        width: 5,
        points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }],
      }],
      pins: [{ id: 'pin-1', x: 0.4, y: 0.6, comment: 'Check this alignment' }],
    };
    const updated = await wikiImages.updateWikiImageAnnotation(image.id, {
      annotationData,
      renderedImage,
      expectedUpdatedAt: image.updatedAt,
    }, admin);
    expect(updated.annotation).toEqual(annotationData);
    expect(updated.updatedAt).not.toBe(image.updatedAt);

    const stored = wikiImages.getWikiImage(image.id, member).image;
    expect(stored.renderedStoragePath).toEqual(expect.any(String));
    expect(readFileSync(stored.renderedStoragePath!)).toEqual(validPng);
    await expect(wikiImages.updateWikiImageAnnotation(image.id, {
      annotationData,
      renderedImage,
      expectedUpdatedAt: image.updatedAt,
    }, member)).rejects.toMatchObject({ statusMessage: 'wiki_image_stale' });

    const sourcePath = stored.storagePath;
    const renderedPath = stored.renderedStoragePath!;
    expect(wiki.deleteWikiPage(page.id, admin)).toEqual({ ok: true });
    expect(existsSync(sourcePath)).toBe(false);
    expect(existsSync(renderedPath)).toBe(false);
  });

  test('rejects project outsiders, unsupported formats, spoofed signatures, and invalid pins', async () => {
    const page = wiki.createWikiPage(projectId, { title: 'Protected image page' }, admin);
    expectStatusMessage(() => wikiImages.listWikiImages(page.id, outsider), 'project_forbidden');
    await expect(wikiImages.createWikiImage(page.id, {
      fileName: 'vector.svg',
      mimeType: 'image/svg+xml',
      data: Buffer.from('<svg/>'),
    }, admin)).rejects.toMatchObject({ statusMessage: 'invalid_wiki_image' });
    await expect(wikiImages.createWikiImage(page.id, {
      fileName: 'spoofed.png',
      mimeType: 'image/png',
      data: Buffer.from('not a png'),
    }, admin)).rejects.toMatchObject({ statusMessage: 'invalid_wiki_image' });

    const image = await wikiImages.createWikiImage(page.id, {
      fileName: 'valid.png',
      mimeType: 'image/png',
      data: validPng,
    }, admin);
    await expect(wikiImages.updateWikiImageAnnotation(image.id, {
      annotationData: {
        version: 1,
        strokes: [],
        pins: [{ id: 'pin', x: 2, y: 0.5, comment: 'Outside the image' }],
      },
      renderedImage,
    }, admin)).rejects.toMatchObject({ name: 'ZodError' });
    expectStatusMessage(() => wikiImages.getWikiImage(image.id, outsider), 'project_forbidden');
    expect(wiki.deleteWikiPage(page.id, admin)).toEqual({ ok: true });
  });
});

function insertUser(emailPrefix: string, name: string): User {
  const now = new Date().toISOString();
  const row: User = {
    id: randomUUID(),
    email: `${emailPrefix}@example.com`,
    name,
    passwordHash: admin?.passwordHash ?? 'unused',
    role: 'member',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  dbModule.db.insert(dbModule.schema.users).values(row).run();
  return row;
}

function expectStatusMessage(action: () => unknown, statusMessage: string) {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ statusMessage });
    return;
  }
  throw new Error(`Expected ${statusMessage}`);
}
