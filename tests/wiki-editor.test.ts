import { describe, expect, test } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { parseWikiTableMarkdown, renderWikiTableMarkdown, wikiEditorHandlers, wikiTableKeyboardShortcuts } from '../utils/wiki-editor';
import { canonicalizeWikiReferences, resolveWikiReference, wikiReferenceRevision } from '../utils/wiki-references';
import { readFileSync } from 'node:fs';

const WikiTestTable = Table.extend({
  parseMarkdown: parseWikiTableMarkdown,
  renderMarkdown: renderWikiTableMarkdown,
  addKeyboardShortcuts() {
    return wikiTableKeyboardShortcuts(this.editor, this.parent?.() ?? {});
  },
});

const content = [
  '| Topic | Owner |',
  '| --- | --- |',
  '| Wiki | [@ id="user-1" label="Alice"] |',
  '',
  'Related task [@ id="task-18" label="AK-18 · Project wiki" char="#"]',
].join('\n');

describe('wiki editor document extensions', () => {
  test('keeps rendered content flush with the document header and exposes page-tree drop zones', () => {
    const component = readFileSync(new URL('../components/ProjectWiki.vue', import.meta.url), 'utf8');
    expect(component).toContain(".ak-wiki-rendered :deep([data-slot='content'])");
    expect(component).toContain('padding-inline: 0 !important');
    expect(component).toContain('@dragstart="startPageDrag');
    expect(component).toContain("dropLabel(dropTarget.placement)");
    expect(component).toContain('/move`');
    expect(component).toContain("ul[data-type='taskList'] > li");
    expect(component).toContain('flex-direction: row');
  });

  test('canonicalizes unambiguous plain Wiki references without touching code or links', () => {
    const markdown = [
      '- @Bastian please clarify this',
      '- [ ] **Bastian:** Prepare the release',
      '- Review #MATE-42',
      '- `@Bastian #MATE-42` stays code',
      '- https://example.test/@Bastian stays a URL',
      '- [@ id="user-1" label="Bastian Old"] stays canonical',
    ].join('\n');
    const normalized = canonicalizeWikiReferences(
      markdown,
      [{ id: 'user-1', name: 'Bastian Hofacker' }],
      [{ id: 'task-42', key: 'MATE-42', title: 'Press release' }],
    );

    expect(normalized).toContain('- [@ id="user-1" label="Bastian Hofacker"] please clarify this');
    expect(normalized).toContain('- [ ] [@ id="user-1" label="Bastian Hofacker"]: Prepare the release');
    expect(normalized).toContain('[@ id="task-42" label="MATE-42 · Press release" char="#"]');
    expect(normalized).toContain('`@Bastian #MATE-42` stays code');
    expect(normalized).toContain('https://example.test/@Bastian stays a URL');
    expect(normalized).toContain('[@ id="user-1" label="Bastian Old"] stays canonical');
  });

  test('does not guess when a short member name is ambiguous', () => {
    const normalized = canonicalizeWikiReferences('@Bastian and @Bastian Hofacker', [
      { id: 'user-1', name: 'Bastian Hofacker' },
      { id: 'user-2', name: 'Bastian Müller' },
    ], []);

    expect(normalized).toContain('@Bastian and');
    expect(normalized).toContain('[@ id="user-1" label="Bastian Hofacker"]');
  });
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

  test('turns only the active visual line in a table cell into a list', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Previous line' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Active line' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Following line' },
              ],
            }],
          }],
        }],
      }],
    }, 'json');
    const activePosition = textPosition(editor, 'Active line');
    editor.commands.setTextSelection(activePosition + 3);

    wikiEditorHandlers.bulletList.execute(editor).run();

    const cell = (editor.getJSON() as JSONContent).content?.[0]?.content?.[0]?.content?.[0];
    expect(cell?.content?.map((node) => node.type)).toEqual(['paragraph', 'bulletList', 'paragraph']);
    expect(cell?.content?.[0]?.content?.[0]?.text).toBe('Previous line');
    expect(cell?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Active line');
    expect(cell?.content?.[2]?.content?.[0]?.text).toBe('Following line');
    editor.destroy();
  });

  test('uses Tab to indent a table list item instead of moving to another cell', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent item' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child item' }] }] },
              ],
            }],
          }, {
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Next cell' }] }],
          }],
        }],
      }],
    }, 'json');
    editor.commands.setTextSelection(textPosition(editor, 'Child item') + 2);

    const shortcuts = wikiTableKeyboardShortcuts(editor, {});
    expect(shortcuts.Tab()).toBe(true);

    const firstCell = (editor.getJSON() as JSONContent).content?.[0]?.content?.[0]?.content?.[0];
    const nestedList = firstCell?.content?.[0]?.content?.[0]?.content?.[1];
    expect(nestedList).toMatchObject({
      type: 'bulletList',
      content: [{ type: 'listItem' }],
    });
    expect(editor.state.selection.$from.parent.textContent).toBe('Child item');
    expect(Array.from({ length: editor.state.selection.$from.depth + 1 }, (_, depth) => (
      editor.state.selection.$from.node(depth).type.name
    ))).toContain('tableCell');
    editor.destroy();
  });

  test('round-trips nested lists inside Markdown table cells', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] }] }],
        }, {
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Context' }] }, {
              type: 'bulletList',
              content: [{
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] }, {
                  type: 'bulletList',
                  content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] }],
                }],
              }, {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sibling' }] }],
              }],
            }],
          }],
        }],
      }],
    }, 'json');

    const markdown = editor.getMarkdown();
    expect(markdown).toContain('Context<br>- Parent<br>&nbsp;&nbsp;- Child<br>- Sibling');
    const roundTrip = createEditor(markdown);
    const content = (roundTrip.getJSON() as JSONContent).content?.[0]?.content?.[1]?.content?.[0]?.content;
    expect(content?.map((node) => node.type)).toEqual(['paragraph', 'bulletList']);
    expect(content?.[1]?.content?.[0]?.content?.[1]).toMatchObject({
      type: 'bulletList',
      content: [{ type: 'listItem' }],
    });
    editor.destroy();
    roundTrip.destroy();
  });
});

function createEditor(editorContent: string | Record<string, unknown> = content, contentType: 'markdown' | 'json' = 'markdown') {
  return new Editor({
    extensions: [StarterKit, Markdown, Mention, TaskList, TaskItem.configure({ nested: true }), WikiTestTable, TableRow, TableHeader, TableCell],
    content: editorContent,
    contentType,
  });
}

function textPosition(editor: Editor, text: string) {
  let position = -1;
  editor.state.doc.descendants((node, nodePosition) => {
    if (position < 0 && node.isText && node.text === text) position = nodePosition;
  });
  expect(position).toBeGreaterThanOrEqual(0);
  return position;
}
