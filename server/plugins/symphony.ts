import { ensureDatabase } from '../lib/db';
import { startLocalTaskDispatcher } from '../lib/local-dispatcher';
import { startRefinementWorker } from '../lib/refinement-worker';

export default defineNitroPlugin((nitroApp) => {
  ensureDatabase();
  const taskDispatcher = startLocalTaskDispatcher();
  const refinementWorker = startRefinementWorker();
  nitroApp.hooks.hook('close', async () => {
    taskDispatcher.stop();
    await refinementWorker.stop();
  });
});
