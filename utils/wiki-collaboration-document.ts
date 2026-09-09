import { getSchema, type AnyExtension, type JSONContent } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';
import { MarkdownManager } from '@tiptap/markdown';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { createWikiCollaborationBlocks, wikiCollaborationNodeUsesId } from './wiki-collaboration-blocks';
import { parseWikiTableMarkdown, renderWikiTableMarkdown } from './wiki-editor';
import { createWikiImageExtension } from './wiki-images';
import { createWikiTodoListExtension } from './wiki-todos';

export const WIKI_COLLABORATION_FIELD = 'default';
export const WIKI_COLLABORATION_META = 'wiki-meta';

const CollaborationTable = Table.extend({
  parseMarkdown: parseWikiTableMarkdown,
  renderMarkdown: renderWikiTableMarkdown,
}).configure({ renderWrapper: true });

let documentCodec: ReturnType<typeof createDocumentCodec> | null = null;

export function createWikiCollaborationDocument(title: string, markdown: string) {
  const { manager, schema } = getDocumentCodec();
  const content = manager.parse(markdown);
  content.content = content.content?.map((node) => assignWikiCollaborationIds(node, true));
  const document = prosemirrorJSONToYDoc(schema, content, WIKI_COLLABORATION_FIELD);
  document.getMap<string>(WIKI_COLLABORATION_META).set('title', title);
  return document;
}

function assignWikiCollaborationIds(node: JSONContent, topLevel = false): JSONContent {
  return {
    ...node,
    ...(wikiCollaborationNodeUsesId(String(node.type), topLevel)
      ? { attrs: { ...node.attrs, collabId: globalThis.crypto.randomUUID() } }
      : {}),
    ...(node.content ? { content: node.content.map((child) => assignWikiCollaborationIds(child)) } : {}),
  };
}

export function serializeWikiCollaborationDocument(document: Y.Doc) {
  const { manager } = getDocumentCodec();
  const title = String(document.getMap<string>(WIKI_COLLABORATION_META).get('title') ?? '');
  const content = manager.serialize(yDocToProsemirrorJSON(document, WIKI_COLLABORATION_FIELD));
  return { title, content };
}

function getDocumentCodec() {
  documentCodec ??= createDocumentCodec();
  return documentCodec;
}

function createDocumentCodec() {
  const extensions: AnyExtension[] = [
    StarterKit.configure({ undoRedo: false }),
    Mention,
    TaskList,
    TaskItem.configure({ nested: true }),
    CollaborationTable,
    TableRow,
    TableHeader,
    TableCell,
    createWikiTodoListExtension({
      getList: () => undefined,
      getFilter: () => 'all',
      getLocale: () => 'en',
    }),
    createWikiImageExtension({ getImage: () => undefined, getLocale: () => 'en' }),
    createWikiCollaborationBlocks(),
  ];
  return {
    manager: new MarkdownManager({ extensions }),
    schema: getSchema(extensions),
  };
}
