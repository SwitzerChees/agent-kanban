const SECURITY_HEADERS: Record<string, string> = {
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
};

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (!event.context.showroomPreview && (event.path === '/' || event.path.startsWith('/s/'))) {
      event.node.res.setHeader('content-security-policy', "frame-src 'self'; object-src 'none'; base-uri 'self'");
    }
    if (event.path.startsWith('/s/') || event.path.startsWith('/api/showroom-shares/')) {
      event.node.res.setHeader('cache-control', 'no-store, private');
      event.node.res.setHeader('x-robots-tag', 'noindex, nofollow, noarchive');
    }
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (event.context.showroomPreview && (name === 'x-frame-options' || name === 'referrer-policy')) continue;
      if (event.path.startsWith('/s/') && name === 'referrer-policy') {
        event.node.res.setHeader(name, 'no-referrer');
        continue;
      }
      event.node.res.setHeader(name, value);
    }
  });
});
