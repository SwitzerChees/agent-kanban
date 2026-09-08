import { createError, getRouterParam } from 'h3';
import { requireSessionUser } from '../../../lib/security/auth';
import { claimTaskCompletionNotification } from '../../../lib/task-completion-notifications';

export default defineEventHandler((event) => {
  const user = requireSessionUser(event);
  const notificationId = Number.parseInt(getRouterParam(event, 'notificationId') ?? '', 10);
  if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_notification_id' });
  }
  return { claimed: claimTaskCompletionNotification(notificationId, user.id) };
});
