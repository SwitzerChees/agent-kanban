import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { asc, count, eq } from 'drizzle-orm';
import { createError } from 'h3';
import { decodeRenderedAnnotationImage } from './attachment-annotation';
import { appDataDir, db, schema } from './db';
import type { User, WikiImage } from './db/schema';
import { getWikiPage } from './wiki';
import { emptyWikiImageAnnotation, parseWikiImageAnnotation, wikiImageAnnotationSchema, type WikiImageAnnotation } from './wiki-image-annotation';
import { maxTaskUploadBytes } from './upload-limits';

const MAX_IMAGES_PER_PAGE = 100;
const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
} as const;

export interface UploadedWikiImage {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface UpdateWikiImageAnnotationInput {
  annotationData: WikiImageAnnotation;
  renderedImage: string;
  expectedUpdatedAt?: string;
}

export function listWikiImages(pageId: string, user: User) {
  getWikiPage(pageId, user);
  return db.select().from(schema.wikiImages)
    .where(eq(schema.wikiImages.pageId, pageId))
    .orderBy(asc(schema.wikiImages.createdAt))
    .all()
    .map(decorateWikiImage);
}

export function getWikiImage(imageId: string, user: User) {
  const image = db.select().from(schema.wikiImages).where(eq(schema.wikiImages.id, imageId)).get();
  if (!image) throw createError({ statusCode: 404, statusMessage: 'wiki_image_not_found' });
  const page = getWikiPage(image.pageId, user);
  return { image, page };
}

export async function createWikiImage(pageId: string, upload: UploadedWikiImage, user: User) {
  const page = getWikiPage(pageId, user);
  const imageCount = db.select({ value: count() }).from(schema.wikiImages)
    .where(eq(schema.wikiImages.pageId, pageId)).get()?.value ?? 0;
  if (imageCount >= MAX_IMAGES_PER_PAGE) {
    throw createError({ statusCode: 409, statusMessage: 'too_many_wiki_images' });
  }
  const mimeType = upload.mimeType.toLocaleLowerCase();
  const extension = IMAGE_TYPES[mimeType as keyof typeof IMAGE_TYPES];
  if (!extension || !hasImageSignature(upload.data, mimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_wiki_image' });
  }
  if (!upload.data.length || upload.data.byteLength > maxTaskUploadBytes()) {
    throw createError({ statusCode: 413, statusMessage: 'upload_too_large' });
  }
  const fileName = normalizeFileName(upload.fileName, extension);
  const imageId = randomUUID();
  const now = new Date().toISOString();
  const storagePath = appDataDir('wiki-images', page.projectId, pageId, `${imageId}${extension}`);
  const annotationData = JSON.stringify(emptyWikiImageAnnotation());
  await fs.writeFile(storagePath, upload.data);
  try {
    const image: typeof schema.wikiImages.$inferInsert = {
      id: imageId,
      pageId,
      fileName,
      mimeType,
      size: upload.data.byteLength,
      storagePath,
      renderedStoragePath: null,
      annotationData,
      createdBy: user.id,
      updatedBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    db.transaction((tx) => {
      tx.insert(schema.wikiImages).values(image).run();
      tx.insert(schema.activity).values(activity(page.projectId, user.id, 'wiki_image_created', {
        pageId,
        imageId,
        fileName,
        mimeType,
        size: upload.data.byteLength,
      }, now)).run();
    });
    return decorateWikiImage(image as WikiImage);
  } catch (error) {
    await fs.rm(storagePath, { force: true });
    throw error;
  }
}

export async function updateWikiImageAnnotation(imageId: string, input: UpdateWikiImageAnnotationInput, user: User) {
  const { image, page } = getWikiImage(imageId, user);
  if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== image.updatedAt) {
    throw createError({ statusCode: 409, statusMessage: 'wiki_image_stale' });
  }
  const annotationData = wikiImageAnnotationSchema.parse(input.annotationData);
  const renderedImage = decodeRenderedAnnotationImage(input.renderedImage, annotationData, 'invalid_wiki_image_annotation');
  const updatedAt = nextRevision(image.updatedAt);
  const renderedStoragePath = appDataDir('wiki-images', page.projectId, page.id, `${image.id}-annotated.png`);
  await fs.writeFile(renderedStoragePath, renderedImage);
  db.transaction((tx) => {
    tx.update(schema.wikiImages).set({
      annotationData: JSON.stringify(annotationData),
      renderedStoragePath,
      updatedBy: user.id,
      updatedAt,
    }).where(eq(schema.wikiImages.id, image.id)).run();
    tx.insert(schema.activity).values(activity(page.projectId, user.id, 'wiki_image_annotated', {
      pageId: page.id,
      imageId: image.id,
      strokeCount: annotationData.strokes.length,
      pinCount: annotationData.pins.length,
    }, updatedAt)).run();
  });
  return decorateWikiImage(db.select().from(schema.wikiImages).where(eq(schema.wikiImages.id, image.id)).get()!);
}

export function decorateWikiImage(image: WikiImage) {
  const revision = encodeURIComponent(image.updatedAt);
  return {
    id: image.id,
    pageId: image.pageId,
    fileName: image.fileName,
    mimeType: image.mimeType,
    size: image.size,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    url: `/api/wiki-images/${image.id}?v=${revision}`,
    sourceUrl: `/api/wiki-images/${image.id}?variant=source&v=${revision}`,
    annotation: parseWikiImageAnnotation(image.annotationData),
  };
}

function normalizeFileName(value: string, extension: string) {
  const raw = path.basename(value.trim()).replace(/[\\/\u0000-\u001F\u007F]/g, '_').slice(0, 255);
  return raw || `wiki-image${extension}`;
}

function hasImageSignature(data: Buffer, mimeType: string) {
  if (mimeType === 'image/png') {
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/webp') return data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function nextRevision(previous: string) {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  return new Date(Number.isFinite(previousTime) && now <= previousTime ? previousTime + 1 : now).toISOString();
}

function activity(projectId: string, userId: string, action: string, metadata: Record<string, unknown>, createdAt: string) {
  return {
    id: randomUUID(),
    projectId,
    taskId: null,
    userId,
    action,
    metadata: JSON.stringify(metadata),
    createdAt,
  };
}
