import { setResponseStatus } from 'h3';

export default defineEventHandler(async (event) => {
  setResponseStatus(event, 202);
  return {
    queued: true,
    coalesced: false,
    requested_at: new Date().toISOString(),
    operations: ['local-state-refresh'],
  };
});
