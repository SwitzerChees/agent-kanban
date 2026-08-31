import { File } from 'node:buffer';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { compressImageForUpload, compressedImageFileName, isCompressibleUploadImage } from '../utils/image-upload';

const originalDocument = globalThis.document;
const originalCreateImageBitmap = globalThis.createImageBitmap;

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(globalThis, {
    document: originalDocument,
    createImageBitmap: originalCreateImageBitmap,
  });
});

describe('client image upload compression', () => {
  test('recognizes browser-rasterizable still image formats', () => {
    expect(isCompressibleUploadImage({ type: 'image/jpeg' })).toBe(true);
    expect(isCompressibleUploadImage({ type: 'image/png' })).toBe(true);
    expect(isCompressibleUploadImage({ type: 'image/webp' })).toBe(true);
    expect(isCompressibleUploadImage({ type: 'image/gif' })).toBe(false);
    expect(isCompressibleUploadImage({ type: 'image/svg+xml' })).toBe(false);
  });

  test('uses a matching WebP extension for compressed images', () => {
    expect(compressedImageFileName('Screenshot 2026.08.22.png')).toBe('Screenshot 2026.08.22.webp');
    expect(compressedImageFileName('clipboard')).toBe('clipboard.webp');
  });

  test('downscales and keeps a smaller WebP result', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (resolve: (blob: Blob) => void) => resolve(new Blob([new Uint8Array(100)], { type: 'image/webp' })),
    };
    Object.assign(globalThis, {
      document: { createElement: () => canvas },
      createImageBitmap: vi.fn(async () => ({ width: 4000, height: 2000, close })),
    });
    const original = new File([new Uint8Array(1000)], 'capture.png', { type: 'image/png' }) as unknown as globalThis.File;

    const compressed = await compressImageForUpload(original);

    expect(compressed).not.toBe(original);
    expect(compressed).toMatchObject({ name: 'capture.webp', type: 'image/webp', size: 100 });
    expect(canvas).toMatchObject({ width: 2560, height: 1280 });
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
