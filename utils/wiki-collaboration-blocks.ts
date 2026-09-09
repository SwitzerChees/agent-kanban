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
const topLevelBlockTypes = [
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
const granularBlockTypes = ['tableRow', 'listItem', 'taskItem'];
const blockTypes = [...topLevelBlockTypes, ...granularBlockTypes];
const topLevelBlockTypeSet = new Set(topLevelBlockTypes);
const granularBlockTypeSet = new Set(granularBlockTypes);

export function wikiCollaborationNodeUsesId(type: string, topLevel = false) {
  return granularBlockTypeSet.has(type) || (topLevel && topLevelBlockTypeSet.has(type));
}

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
          return !changedWikiCollaborationBlockIds(state.doc, transaction).some((id) => foreignLocks.has(id));
        },
        appendTransaction(_transactions, _oldState, state) {
          let changed = false;
          const transaction = state.tr;
          state.doc.descendants((node, position, parent) => {
            if (wikiCollaborationNodeUsesId(node.type.name, parent === state.doc) && !node.attrs.collabId) {
              transaction.setNodeMarkup(position, undefined, {
                ...node.attrs,
                collabId: globalThis.crypto.randomUUID(),
              });
              changed = true;
            }
          });
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
            state.doc.descendants((node, position) => {
              const lease = locks.get(String(node.attrs.collabId ?? ''));
              if (lease) {
                if (node.type.name === 'tableRow') {
                  node.forEach((cell, offset, index) => {
                    decorations.push(Decoration.node(
                      position + 1 + offset,
                      position + 1 + offset + cell.nodeSize,
                      lockDecorationAttributes(lease, 'table-row', index === 0),
                    ));
                  });
                } else {
                  decorations.push(Decoration.node(
                    position,
                    position + node.nodeSize,
                    lockDecorationAttributes(
                      lease,
                      granularBlockTypeSet.has(node.type.name) ? 'list-item' : 'block',
                      true,
                    ),
                  ));
                }
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      })];
    },
  });
}

export function selectedWikiCollaborationBlockId(editor: { state: { selection: { $from: any } } }) {
  const position = editor.state.selection.$from;
  for (let depth = position.depth; depth >= 1; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === 'tableRow') return String(node.attrs.collabId ?? '') || null;
  }
  for (let depth = position.depth; depth >= 1; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
      return String(node.attrs.collabId ?? '') || null;
    }
  }
  if (position.depth >= 1) return String(position.node(1).attrs.collabId ?? '') || null;
  return String(position.nodeAfter?.attrs?.collabId ?? '') || null;
}

function changedWikiCollaborationBlockIds(
  doc: ProseMirrorNode,
  transaction: Transaction,
) {
  const ids = new Set<string>();
  for (const step of transaction.steps) {
    step.getMap().forEach((oldStart, oldEnd) => {
      collectWikiCollaborationBlockIds(doc, oldStart, Math.max(oldStart + 1, oldEnd), ids);
    });
  }
  collectWikiCollaborationBlockIds(doc, transaction.selection.from, Math.max(transaction.selection.from + 1, transaction.selection.to), ids);
  return [...ids];
}

function collectWikiCollaborationBlockIds(doc: ProseMirrorNode, from: number, to: number, ids: Set<string>) {
  const maximum = doc.content.size;
  doc.nodesBetween(Math.max(0, Math.min(from, maximum)), Math.max(0, Math.min(to, maximum)), (node) => {
    const id = String(node.attrs.collabId ?? '');
    if (id) ids.add(id);
    return true;
  });
}

function lockDecorationAttributes(
  lease: WikiCollaborationLease,
  scope: 'block' | 'list-item' | 'table-row',
  showEditor: boolean,
) {
  return {
    class: 'ak-wiki-collab-block-locked',
    ...(showEditor ? { 'data-collab-editor': lease.userName } : {}),
    'data-collab-lock-scope': scope,
    style: `--ak-collab-color:${lease.color}`,
  };
}
