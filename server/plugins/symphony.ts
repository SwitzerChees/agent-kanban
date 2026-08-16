import { ensureDatabase } from '../lib/db';
import { startLocalTaskDispatcher } from '../lib/local-dispatcher';
import { startRefinementWorker } from '../lib/refinement-worker';
import { startProjectChatRuntime } from '../lib/project-chat-runtime';

export default defineNitroPlugin((nitroApp) => {
  ensureDatabase();
  const taskDispatcher = startLocalTaskDispatcher();
  const refinementWorker = startRefinementWorker();
  const projectChat = startProjectChatRuntime();
  nitroApp.hooks.hook('close', async () => {
    taskDispatcher.stop();
    await Promise.all([
      refinementWorker.stop(),
      projectChat.stop(),
    ]);
  });
});
