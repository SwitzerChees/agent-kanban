const SECURITY_HEADERS: Record<string, string> = {
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
};

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      event.node.res.setHeader(name, value);
    }
  });
});
