import { createError } from 'h3';

export const MIN_TASK_UPLOAD_MB = 20;
export const DEFAULT_TASK_UPLOAD_MB = 25;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export function maxTaskUploadBytes(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(env.KANBAN_MAX_UPLOAD_MB ?? String(DEFAULT_TASK_UPLOAD_MB), 10);
  const configuredMb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TASK_UPLOAD_MB;
  return Math.max(MIN_TASK_UPLOAD_MB, configuredMb) * 1024 * 1024;
}

export function assertTaskUploadContentLength(contentLength: number, env: NodeJS.ProcessEnv = process.env) {
  if (!Number.isFinite(contentLength) || contentLength <= 0) return;
  // Annotated images include a rendered preview in the multipart metadata.
  // Permit that duplicate representation plus normal multipart framing; the
  // raw attachment payload is checked separately after parsing.
  if (contentLength > maxTaskUploadBytes(env) * 2 + MULTIPART_OVERHEAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'upload_too_large' });
  }
}
