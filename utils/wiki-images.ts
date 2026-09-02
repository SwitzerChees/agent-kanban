import { Node, createAtomBlockMarkdownSpec, mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';

export interface WikiImagePoint {
  x: number;
  y: number;
}

export interface WikiImageStroke {
  color: string;
  width: number;
  points: WikiImagePoint[];
}

export interface WikiImagePin {
  id: string;
  x: number;
  y: number;
  comment: string;
}

export interface WikiImageAnnotation {
  version: 1;
  strokes: WikiImageStroke[];
  pins: WikiImagePin[];
}

export interface WikiImageRecord {
  id: string;
  pageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  sourceUrl: string;
  annotation: WikiImageAnnotation;
  createdAt: string;
  updatedAt: string;
}

interface WikiImageExtensionOptions {
  getImage: (id: string) => WikiImageRecord | undefined;
  getLocale: () => 'en' | 'de';
}

const markdownSpec = createAtomBlockMarkdownSpec({
  nodeName: 'wikiImage',
  name: 'wiki-image',
  requiredAttributes: ['id'],
  allowedAttributes: ['id', 'alt'],
});

export function createWikiImageExtension(options: WikiImageExtensionOptions) {
  return Node.create({
    name: 'wikiImage',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
      return {
        id: { default: null },
        alt: { default: '' },
      };
    },

    parseHTML() {
      return [{ tag: 'figure[data-wiki-image-id]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const id = String(node.attrs.id ?? '');
      const alt = String(node.attrs.alt ?? '');
      return renderWikiImage(options.getImage(id), id, alt, options.getLocale(), HTMLAttributes);
    },

    ...markdownSpec,
  });
}

export function renderWikiImage(
  image: WikiImageRecord | undefined,
  id: string,
  fallbackAlt: string,
  locale: 'en' | 'de',
  HTMLAttributes: Record<string, unknown>,
): DOMOutputSpec {
  const copy = locale === 'de' ? {
    edit: 'Bild bearbeiten',
    missing: 'Dieses Bild wurde gelöscht oder ist nicht mehr zugänglich.',
    pin: 'Bildkommentar',
  } : {
    edit: 'Edit image',
    missing: 'This image was deleted or is no longer accessible.',
    pin: 'Image comment',
  };
  const attrs = mergeAttributes(HTMLAttributes, {
    class: `ak-wiki-image${image ? '' : ' is-invalid'}`,
    'data-wiki-image-id': id,
    contenteditable: 'false',
  });
  if (!image) {
    return ['figure', attrs, ['div', { class: 'ak-wiki-image-missing' }, copy.missing], ['figcaption', {}, fallbackAlt]];
  }
  const alt = fallbackAlt || image.fileName;
  const pins = image.annotation.pins.map((pin, index) => [
    'button',
    {
      type: 'button',
      class: 'ak-wiki-image-pin',
      style: `left:${pin.x * 100}%;top:${pin.y * 100}%`,
      'aria-label': `${copy.pin} ${index + 1}: ${pin.comment}`,
    },
    String(index + 1),
    ['span', { role: 'tooltip' }, pin.comment],
  ] as DOMOutputSpec);
  return [
    'figure',
    attrs,
    ['div', { class: 'ak-wiki-image-stage' },
      ['img', { src: image.url, alt, loading: 'lazy', draggable: 'false' }],
      ...pins,
      ['button', { type: 'button', class: 'ak-wiki-image-edit', 'data-wiki-image-edit': id }, copy.edit],
    ],
    ['figcaption', {}, alt],
  ];
}

export function cloneWikiImageAnnotation(annotation: WikiImageAnnotation): WikiImageAnnotation {
  return {
    version: 1,
    strokes: annotation.strokes.map((stroke) => ({
      color: stroke.color,
      width: stroke.width,
      points: stroke.points.map((point) => ({ ...point })),
    })),
    pins: annotation.pins.map((pin) => ({ ...pin })),
  };
}
