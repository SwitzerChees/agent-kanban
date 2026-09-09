import { getSchema } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, test } from 'vitest';
import {
  createWikiCollaborationBlocks,
  selectedWikiCollaborationBlockId,
  wikiCollaborationNodeUsesId,
  type WikiCollaborationLease,
} from '../utils/wiki-collaboration-blocks';

describe('wiki collaboration block scopes', () => {
  test('uses the enclosing table row even when the cell contains a list item', () => {
    expect(selectedWikiCollaborationBlockId(editorAt([
      node('doc'),
      node('table', 'table-id'),
      node('tableRow', 'row-id'),
      node('tableCell'),
      node('bulletList', 'nested-list-id'),
      node('listItem', 'nested-item-id'),
      node('paragraph', 'paragraph-id'),
    ]))).toBe('row-id');
  });

  test('uses individual list items outside tables and otherwise falls back to the top-level block', () => {
    expect(selectedWikiCollaborationBlockId(editorAt([
      node('doc'),
      node('taskList', 'task-list-id'),
      node('taskItem', 'task-item-id'),
      node('paragraph', 'paragraph-id'),
    ]))).toBe('task-item-id');
    expect(selectedWikiCollaborationBlockId(editorAt([
      node('doc'),
      node('blockquote', 'quote-id'),
      node('paragraph', 'paragraph-id'),
    ]))).toBe('quote-id');
  });

  test('assigns collaboration IDs only to supported lock scopes', () => {
    expect(wikiCollaborationNodeUsesId('tableRow')).toBe(true);
    expect(wikiCollaborationNodeUsesId('listItem')).toBe(true);
    expect(wikiCollaborationNodeUsesId('taskItem')).toBe(true);
    expect(wikiCollaborationNodeUsesId('paragraph')).toBe(false);
    expect(wikiCollaborationNodeUsesId('paragraph', true)).toBe(true);
    expect(wikiCollaborationNodeUsesId('tableCell')).toBe(false);
    expect(wikiCollaborationNodeUsesId('text')).toBe(false);
  });

  test('blocks changes in a leased row while keeping adjacent rows editable', () => {
    const leases: WikiCollaborationLease[] = [{
      blockId: 'row-one',
      sessionId: 'foreign-session',
      userId: 'foreign-user',
      userName: 'Other editor',
      color: '#0d9488',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }];
    const blocks = createWikiCollaborationBlocks({
      getLeases: () => leases,
      getOwnSessionId: () => 'own-session',
    });
    const schema = getSchema([StarterKit, Table, TableRow, TableHeader, TableCell, blocks]);
    const plugins = (blocks.config.addProseMirrorPlugins as any).call(blocks);
    let state = EditorState.create({ doc: schema.nodeFromJSON(tableDocument()), plugins });
    const rowDecorations = plugins[0].props.decorations(state).find();
    expect(rowDecorations).toHaveLength(2);
    expect(rowDecorations[0].type.attrs).toMatchObject({
      class: 'ak-wiki-collab-block-locked',
      'data-collab-editor': 'Other editor',
      'data-collab-lock-scope': 'table-row',
    });
    expect(rowDecorations[1].type.attrs).not.toHaveProperty('data-collab-editor');

    const firstPosition = textPosition(state.doc, 'First');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, firstPosition + 1)));
    const blocked = state.applyTransaction(state.tr.insertText('X'));
    expect(blocked.transactions).toHaveLength(0);
    expect(blocked.state.doc.textContent).not.toContain('FXirst');

    const secondPosition = textPosition(state.doc, 'Second');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, secondPosition + 1)));
    const allowed = state.applyTransaction(state.tr.insertText('X'));
    expect(allowed.transactions).toHaveLength(1);
    expect(allowed.state.doc.textContent).toContain('SXecond');
  });
});

function node(name: string, collabId?: string) {
  return { type: { name }, attrs: { collabId } };
}

function editorAt(nodes: Array<ReturnType<typeof node>>) {
  return {
    state: {
      selection: {
        $from: {
          depth: nodes.length - 1,
          node: (depth: number) => nodes[depth],
          nodeAfter: null,
        },
      },
    },
  };
}

function tableDocument() {
  const cell = (text: string) => ({
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'doc',
    content: [{
      type: 'table',
      attrs: { collabId: 'table' },
      content: [
        { type: 'tableRow', attrs: { collabId: 'row-one' }, content: [cell('First'), cell('Owner one')] },
        { type: 'tableRow', attrs: { collabId: 'row-two' }, content: [cell('Second'), cell('Owner two')] },
      ],
    }],
  };
}

function textPosition(document: ProseMirrorNode, text: string) {
  let match = -1;
  document.descendants((node, position) => {
    if (node.isText && node.text === text) match = position;
  });
  expect(match).toBeGreaterThanOrEqual(0);
  return match;
}
