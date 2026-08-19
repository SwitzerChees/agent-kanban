import { describe, expect, test } from 'vitest';
import { formDataFiles, formDataText } from '../server/lib/form-data';

describe('multipart form data helpers', () => {
  test('keeps text fields separate from uploaded files', async () => {
    const formData = new FormData();
    formData.append('message', 'test');
    formData.append('clientRequestId', '12345678');
    formData.append('files', new File(['image bytes'], 'sketch.png', { type: 'image/png' }));

    expect(formDataText(formData, 'message')).toBe('test');
    expect(formDataText(formData, 'files')).toBe('');
    expect(formDataText(formData, 'missing')).toBe('');

    const files = formDataFiles(formData, 'files');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'sketch.png', type: 'image/png' });
    expect(Buffer.from(await files[0]!.arrayBuffer()).toString('utf8')).toBe('image bytes');
  });

  test('ignores text values submitted under a file field', () => {
    const formData = new FormData();
    formData.append('files', 'not-a-file');

    expect(formDataFiles(formData, 'files')).toEqual([]);
  });
});
