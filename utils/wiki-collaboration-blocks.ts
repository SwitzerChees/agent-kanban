import { Extension } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface WikiCollaborationLease {
  blockId: string;
  sessionId: string;
  userId: string;
  userName: string;
  color: string;
  expiresAt: string;
}

export interface WikiCollaborationBlockOptions {
  getLeases: () => readonly WikiCollaborationLease[];
  getOwnSessionId: () => string | null;
}

export const WIKI_COLLABORATION_LOCK_META = 'wikiCollaborationLocks';
const assignIdsMeta = 'wikiCollaborationAssignIds';
const blockPluginKey = new PluginKey('wikiCollaborationBlocks');
const blockTypes = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'table',
  'wikiTodoList',
  'wikiImage',
];

export function createWikiCollaborationBlocks(options?: Partial<WikiCollaborationBlockOptions>) {
  const resolved: WikiCollaborationBlockOptions = {
    getLeases: options?.getLeases ?? (() => []),
    getOwnSessionId: options?.getOwnSessionId ?? (() => null),
  };

  return Extension.create<WikiCollaborationBlockOptions>({
    name: 'wikiCollaborationBlocks',

    addOptions() {
      return resolved;
    },

    addGlobalAttributes() {
      return [{
        types: blockTypes,
        attributes: {
          collabId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-collab-id'),
            renderHTML: (attributes) => attributes.collabId
              ? { 'data-collab-id': attributes.collabId }
              : {},
          },
        },
      }];
    },

    addProseMirrorPlugins() {
      const extensionOptions = this.options;
      return [new Plugin({
        key: blockPluginKey,
        filterTransaction(transaction, state) {
          if (!transaction.docChanged || isChangeOrigin(transaction) || transaction.getMeta(assignIdsMeta)) return true;
          const ownSessionId = extensionOptions.getOwnSessionId();
          const foreignLocks = new Map(extensionOptions.getLeases()
            .filter((lease) => lease.sessionId !== ownSessionId)
            .map((lease) => [lease.blockId, lease]));
          if (!foreignLocks.size) return true;
          return !changedTopLevelBlockIds(state.doc, transaction).some((id) => foreignLocks.has(id));
        },
        appendTransaction(_transactions, _oldState, state) {
          let position = 0;
          let changed = false;
          const transaction = state.tr;
          for (let index = 0; index < state.doc.childCount; index += 1) {
            const node = state.doc.child(index);
            if (!node.attrs.collabId) {
              transaction.setNodeMarkup(position, undefined, {
                ...node.attrs,
                collabId: globalThis.crypto.randomUUID(),
              });
              changed = true;
            }
            position += node.nodeSize;
          }
          return changed
            ? transaction.setMeta(assignIdsMeta, true).setMeta('addToHistory', false)
            : null;
        },
        props: {
          decorations(state) {
            const ownSessionId = extensionOptions.getOwnSessionId();
            const locks = new Map(extensionOptions.getLeases()
              .filter((lease) => lease.sessionId !== ownSessionId)
              .map((lease) => [lease.blockId, lease]));
            if (!locks.size) return null;
            const decorations: Decoration[] = [];
            let position = 0;
            for (let index = 0; index < state.doc.childCount; index += 1) {
              const node = state.doc.child(index);
              const lease = locks.get(String(node.attrs.collabId ?? ''));
              if (lease) {
                decorations.push(Decoration.node(position, position + node.nodeSize, {
                  class: 'ak-wiki-collab-block-locked',
                  'data-collab-editor': lease.userName,
                  style: `--ak-collab-color:${lease.color}`,
                }));
              }
              position += node.nodeSize;
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      })];
    },
  });
}

export function selectedWikiCollaborationBlockId(editor: { state: { selection: { $from: any } } }) {
  const position = editor.state.selection.$from;
  if (position.depth >= 1) return String(position.node(1).attrs.collabId ?? '') || null;
  return String(position.nodeAfter?.attrs?.collabId ?? '') || null;
}

function changedTopLevelBlockIds(
  doc: ProseMirrorNode,
  transaction: Transaction,
) {
  const ids = new Set<string>();
  for (const step of transaction.steps) {
    step.getMap().forEach((oldStart, oldEnd) => {
      collectTopLevelBlockIds(doc, oldStart, Math.max(oldStart + 1, oldEnd), ids);
    });
  }
  collectTopLevelBlockIds(doc, transaction.selection.from, Math.max(transaction.selection.from + 1, transaction.selection.to), ids);
  return [...ids];
}

function collectTopLevelBlockIds(doc: ProseMirrorNode, from: number, to: number, ids: Set<string>) {
  const maximum = doc.content.size;
  doc.nodesBetween(Math.max(0, Math.min(from, maximum)), Math.max(0, Math.min(to, maximum)), (node, _position, parent) => {
    if (parent !== doc) return true;
    const id = String(node.attrs.collabId ?? '');
    if (id) ids.add(id);
    return false;
  });
}
