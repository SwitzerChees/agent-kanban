const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION = 2560;
export const DEFAULT_IMAGE_UPLOAD_QUALITY = 0.82;

export function compressedImageFileName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.');
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  return `${baseName || 'image'}.webp`;
}

export function isCompressibleUploadImage(file: Pick<File, 'type'>) {
  return COMPRESSIBLE_IMAGE_TYPES.has(file.type.toLowerCase());
}

export async function compressImageForUpload(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  if (
    !isCompressibleUploadImage(file)
    || typeof document === 'undefined'
    || typeof createImageBitmap === 'undefined'
  ) return file;

  const maxDimension = Math.max(1, options.maxDimension ?? DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION);
  const quality = Math.min(1, Math.max(0.1, options.quality ?? DEFAULT_IMAGE_UPLOAD_QUALITY));
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], compressedImageFileName(file.name), {
      type: blob.type || 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
