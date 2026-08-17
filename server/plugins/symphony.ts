import { ensureDatabase } from '../lib/db';
import { startLocalTaskDispatcher } from '../lib/local-dispatcher';
import { startRefinementWorker } from '../lib/refinement-worker';
import { startProjectChatRuntime } from '../lib/project-chat-runtime';
import { installServerStreamShutdown } from '../lib/server-streams';

export default defineNitroPlugin((nitroApp) => {
  ensureDatabase();
  installServerStreamShutdown();
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
