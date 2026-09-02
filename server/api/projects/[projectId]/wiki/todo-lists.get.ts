import { getRouterParam } from 'h3';
import { requireUser } from '../../../../lib/security/auth';
import { listWikiTodoLists } from '../../../../lib/wiki-todos';

export default defineEventHandler((event) => ({
  lists: listWikiTodoLists(getRouterParam(event, 'projectId')!, requireUser(event)),
}));
