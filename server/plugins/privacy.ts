export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    delete response.headers?.['x-powered-by'];
  });
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    delete response.headers?.['x-powered-by'];
    event.node.res.removeHeader('x-powered-by');
  });
});
