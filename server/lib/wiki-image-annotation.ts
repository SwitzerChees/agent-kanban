import { z } from 'zod';
import { annotationDataSchema } from './attachment-annotation';

export const wikiImageAnnotationSchema = annotationDataSchema.extend({
  pins: z.array(z.object({
    id: z.string().min(1).max(100),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    comment: z.string().trim().min(1).max(500),
  })).max(200),
});

export type WikiImageAnnotation = z.infer<typeof wikiImageAnnotationSchema>;

export function emptyWikiImageAnnotation(): WikiImageAnnotation {
  return { version: 1, strokes: [], pins: [] };
}

export function parseWikiImageAnnotation(value: string): WikiImageAnnotation {
  try {
    return wikiImageAnnotationSchema.parse(JSON.parse(value));
  } catch {
    return emptyWikiImageAnnotation();
  }
}
