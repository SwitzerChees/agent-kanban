import { describe, expect, test } from 'vitest';
import { parseTaskUploadParts } from '../server/lib/task-upload';

const annotationData = {
  version: 1,
  strokes: [{
    color: '#ef4444',
    width: 5,
    points: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }],
  }],
};
const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('test-png-payload'),
]);
const validRenderedImage = `data:image/png;base64,${validPng.toString('base64')}`;

type AnnotationUploadMetadata = {
  index: number;
  annotationData: typeof annotationData;
  renderedImage: string;
};

const invalidAnnotationCases: AnnotationUploadMetadata[][] = [
  [{ index: 1, annotationData, renderedImage: validRenderedImage }],
  [{ index: 0, annotationData, renderedImage: 'data:image/png;base64,' }],
  [{ index: 0, annotationData, renderedImage: 'data:image/png;base64,!!!!' }],
  [
    { index: 0, annotationData, renderedImage: validRenderedImage },
    { index: 0, annotationData, renderedImage: validRenderedImage },
  ],
];

describe('annotated multipart uploads', () => {
  test('keeps the original image and associates editable annotation data by file index', () => {
    const result = parseTaskUploadParts([
      { name: 'title', data: Buffer.from('Annotated task') },
      { name: 'files', filename: 'original.png', type: 'image/png', data: Buffer.from('original-image') },
      { name: 'files', filename: 'notes.txt', type: 'text/plain', data: Buffer.from('notes') },
      {
        name: 'annotations',
        data: Buffer.from(JSON.stringify([{ index: 0, annotationData, renderedImage: validRenderedImage }])),
      },
    ]);

    expect(result.fields.get('title')).toBe('Annotated task');
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({
      fileName: 'original.png',
      mimeType: 'image/png',
      data: Buffer.from('original-image'),
      annotation: { data: annotationData, renderedImage: validPng },
    });
    expect(result.files[1]?.annotation).toBeUndefined();
  });

  test.each(invalidAnnotationCases)('rejects annotation metadata that cannot be associated safely', (annotations) => {
    expect(() => parseTaskUploadParts([
      { name: 'files', filename: 'original.png', type: 'image/png', data: Buffer.from('image') },
      { name: 'annotations', data: Buffer.from(JSON.stringify(annotations)) },
    ])).toThrowError(expect.objectContaining({ statusMessage: 'invalid_upload_annotations' }));
  });
});
