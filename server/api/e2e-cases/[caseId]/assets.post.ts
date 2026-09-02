import { getHeader, getRouterParam, readMultipartFormData } from 'h3';
import { requireUser } from '../../../lib/security/auth';
import { addE2eCaseAssets } from '../../../lib/e2e-tests';
import { parseTaskUploadParts } from '../../../lib/task-upload';
import { assertTaskUploadContentLength } from '../../../lib/upload-limits';

export default defineEventHandler(async (event) => {
  assertTaskUploadContentLength(Number(getHeader(event, 'content-length') ?? 0));
  const { files } = parseTaskUploadParts(await readMultipartFormData(event));
  return {
    case: await addE2eCaseAssets(getRouterParam(event, 'caseId')!, files, requireUser(event)),
  };
});
