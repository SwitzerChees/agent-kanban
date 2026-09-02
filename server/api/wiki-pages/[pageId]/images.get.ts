import { getRouterParam } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { listWikiImages } from '../../../lib/wiki-images';

export default defineEventHandler((event) => ({
  images: listWikiImages(getRouterParam(event, 'pageId')!, requireUser(event)),
}));
