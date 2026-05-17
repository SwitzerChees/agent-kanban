import { ensureDatabase } from '../lib/db';
import { startLocalTaskDispatcher } from '../lib/local-dispatcher';

export default defineNitroPlugin(() => {
  ensureDatabase();
  startLocalTaskDispatcher();
});
