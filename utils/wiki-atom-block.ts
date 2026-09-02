import { parseAttributes } from '@tiptap/core';

const UUID_SHORTHAND = /(^|\s)#([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?=\s|$)/giu;

/**
 * Tiptap's Pandoc attribute parser treats `#...` as a CSS id and therefore
 * rejects UUIDs that begin with a digit. Wiki atom ids are UUIDs rather than
 * CSS identifiers, so normalize that shorthand to the equivalent quoted id
 * before handing the remaining attributes to Tiptap.
 */
export function parseWikiAtomBlockAttributes(value: string) {
  return parseAttributes(value.replace(
    UUID_SHORTHAND,
    (_match, prefix: string, id: string) => `${prefix}id="${id}"`,
  ));
}
