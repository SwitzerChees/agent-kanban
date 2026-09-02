import { ensureDatabase } from '../lib/db';
import { startLocalTaskDispatcher } from '../lib/local-dispatcher';
import { startRefinementWorker } from '../lib/refinement-worker';
import { startProjectChatRuntime } from '../lib/project-chat-runtime';
import { installServerStreamShutdown } from '../lib/server-streams';
import { startE2eRunDispatcher } from '../lib/e2e-dispatcher';

export default defineNitroPlugin((nitroApp) => {
  ensureDatabase();
  installServerStreamShutdown();
  const taskDispatcher = startLocalTaskDispatcher();
  const refinementWorker = startRefinementWorker();
  const projectChat = startProjectChatRuntime();
  const e2eDispatcher = startE2eRunDispatcher();
  nitroApp.hooks.hook('close', async () => {
    await Promise.all([
      taskDispatcher.stop(),
      refinementWorker.stop(),
      projectChat.stop(),
      e2eDispatcher.stop(),
    ]);
  });
});
