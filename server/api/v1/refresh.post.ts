import { setResponseStatus } from 'h3';
import { requireUser } from '../../lib/security/auth';

export default defineEventHandler(async (event) => {
  requireUser(event);
  setResponseStatus(event, 202);
  return {
    queued: true,
    coalesced: false,
    requested_at: new Date().toISOString(),
    operations: ['local-state-refresh'],
  };
});
