import { describe, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { resolveWikiReference, wikiReferenceRevision } from '../utils/wiki-references';

const content = [
  '| Topic | Owner |',
  '| --- | --- |',
  '| Wiki | [@ id="user-1" label="Alice"] |',
  '',
  'Related task [@ id="task-18" label="AK-18 · Project wiki" char="#"]',
].join('\n');

describe('wiki editor document extensions', () => {
  test('resolves stored reference IDs to current user names and task titles', () => {
    const members = [{ id: 'user-1', name: 'Alice Updated' }];
    const tasks = [{ id: 'task-18', key: 'AK-18', title: 'Current project wiki title' }];

    expect(resolveWikiReference(
      { id: 'user-1', label: 'Alice Old' },
      members,
      tasks,
    )).toMatchObject({ char: '@', kind: 'user', label: 'Alice Updated' });
    expect(resolveWikiReference(
      { id: 'task-18', label: 'AK-18 · Old title', mentionSuggestionChar: '#' },
      members,
      tasks,
    )).toMatchObject({ char: '#', kind: 'task', label: 'AK-18 · Current project wiki title' });
  });

  test('keeps stored labels as a fallback and invalidates rendering when current labels change', () => {
    const originalMembers = [{ id: 'user-1', name: 'Alice' }];
    const originalTasks = [{ id: 'task-18', key: 'AK-18', title: 'Old title' }];

    expect(resolveWikiReference(
      { id: 'missing-user', label: 'Former member' },
      originalMembers,
      originalTasks,
    ).label).toBe('Former member');
    expect(wikiReferenceRevision(originalMembers, originalTasks)).not.toBe(wikiReferenceRevision(
      [{ id: 'user-1', name: 'Alice Renamed' }],
      [{ id: 'task-18', key: 'AK-18', title: 'New title' }],
    ));
  });

  test('round-trips GFM tables and stable user/task references through markdown', () => {
    const editor = createEditor();

    const markdown = editor.getMarkdown();
    expect(markdown).toContain('| Topic | Owner');
    expect(markdown).toContain('[@ id="user-1" label="Alice"]');
    expect(markdown).toContain('[@ id="task-18" label="AK-18 · Project wiki" char="#"]');

    const document = editor.getJSON();
    expect(document.content?.[0]).toMatchObject({ type: 'table' });
    expect(document.content?.[1]?.content?.[1]).toMatchObject({
      type: 'mention',
      attrs: { id: 'task-18', mentionSuggestionChar: '#' },
    });
    editor.destroy();
  });

  test('adds rows and columns relative to the selected table cell', () => {
    const editor = createEditor();

    expect(editor.commands.addRowAfter()).toBe(true);
    expect(editor.commands.addColumnAfter()).toBe(true);

    const table = editor.getJSON().content?.[0];
    const tableRows = table && 'content' in table ? table.content ?? [] : [];
    expect(tableRows).toHaveLength(3);
    expect(tableRows.map((row) => 'content' in row ? row.content?.length : 0)).toEqual([3, 3, 3]);
    expect(editor.getMarkdown()).toMatch(/\| Topic\s+\|\s+\| Owner/);
    editor.destroy();
  });
});

function createEditor() {
  return new Editor({
    extensions: [StarterKit, Markdown, Mention, TableKit],
    content,
    contentType: 'markdown',
  });
}
