import { createError, getRequestURL, getRouterParam, setHeaders } from 'h3';
import { showroomAsset } from '../../../lib/showroom';
import { showroomBridge } from '../../../lib/showroom-bridge';

export default defineEventHandler((event) => {
  const token = getRouterParam(event, 'token')!;
  const file = getRouterParam(event, 'file', { decode: true })!;
  const asset = showroomAsset(token, file);
  const origin = getRequestURL(event).origin;
  if (!/^https?:\/\/[^\s;'"<>]+$/.test(origin)) throw createError({ statusCode: 400 });
  const allowed = `${origin}/showroom-preview/${token}/`;
  // No same-origin permission, even when someone opens the HTML URL directly.
  // Scoped sources allow local assets but cannot load project APIs or external trackers.
  const csp = [
    'sandbox allow-scripts', "default-src 'none'", `script-src 'unsafe-inline' ${allowed}`,
    `style-src 'unsafe-inline' ${allowed}`, `img-src data: blob: ${allowed}`,
    `font-src data: ${allowed}`, `media-src blob: ${allowed}`, `connect-src ${allowed}`,
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'self'", "frame-src 'none'", "object-src 'none'",
  ].join('; ');
  event.context.showroomPreview = true;
  setHeaders(event, {
    'content-type': asset.mime, 'content-security-policy': csp, 'cache-control': 'no-store, private',
    'referrer-policy': 'no-referrer', 'access-control-allow-origin': '*',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'x-robots-tag': 'noindex, nofollow, noarchive', 'x-content-type-options': 'nosniff',
  });
  if (asset.mime.startsWith('text/html')) {
    return '<!doctype html><meta charset="utf-8">' + showroomBridge(file, asset.snapshotId) + asset.data.toString('utf8').replace(/<!doctype[^>]*>/ig, '');
  }
  return asset.data;
});
