import { describe, expect, test } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { parseWikiTableMarkdown, renderWikiTableMarkdown, wikiEditorHandlers, wikiTableKeyboardShortcuts } from '../utils/wiki-editor';
import { canonicalizeWikiReferences, filterWikiPageReferenceItems, resolveWikiReference, wikiPageReferenceItems, wikiReferenceRevision } from '../utils/wiki-references';
import { createWikiTodoListExtension, filterWikiTodoItems, renderWikiTodoText, wikiTodoEditableText, type WikiTodoItemRecord } from '../utils/wiki-todos';
import { cloneWikiImageAnnotation, createWikiImageExtension, renderWikiImage, type WikiImageRecord } from '../utils/wiki-images';
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
    expect(component).toContain('row.ancestorIds.every((id) => expandedPageIds.value.has(id))');
    expect(component).toContain(':aria-expanded="pageIsExpanded(row.page.id)"');
    expect(component).toContain('@click.stop="togglePageExpanded(row.page.id)"');
    expect(component).toContain("'i-lucide-chevron-down' : 'i-lucide-chevron-right'");
    expect(component).toContain("dropLabel(dropTarget.placement)");
    expect(component).toContain('/move`');
    expect(component).toContain("ul[data-type='taskList'] > li");
    expect(component).toContain('flex-direction: row');
    expect(component).toContain('char="seite:"');
    expect(component).toContain('char="page:"');
    expect(component).toContain(':items="filteredPageMentionItemsDe"');
    expect(component).toContain(':items="filteredPageMentionItemsEn"');
    expect(component).toContain("'[data-wiki-page-id]'");
    expect(component).toContain('@paste.capture="handleWikiImagePaste"');
    expect(component).toContain('@drop.capture="handleWikiImageDrop"');
    expect(component).toContain('<WikiImageEditor');
    expect(component).toContain('VueNodeViewRenderer(WikiTodoListNodeView)');
    expect(component).toContain(':not(.tableWrapper):not(.ak-wiki-todo)');
    expect(component).toContain('.tiptap > .ak-wiki-todo');
    expect(component).not.toContain('todoListRevision');
    const todoNodeView = readFileSync(new URL('../components/WikiTodoListNodeView.vue', import.meta.url), 'utf8');
    const todoTextArea = readFileSync(new URL('../components/WikiTodoTextArea.vue', import.meta.url), 'utf8');
    expect(todoNodeView).toContain('<WikiTodoTextArea');
    expect(todoNodeView).toContain('updateItem');
    expect(todoNodeView).toContain('@click.stop="startEditing(item)"');
    expect(todoNodeView).toContain(':aria-expanded="!collapsed"');
    expect(todoNodeView).toContain('@click.stop="collapsed = !collapsed"');
    expect(todoNodeView).toContain('<ul v-show="!collapsed">');
    expect(todoTextArea).toContain('rows="2"');
    expect(todoTextArea).toContain("event.metaKey || event.ctrlKey");
    expect(todoTextArea).toContain('data-wiki-todo-reference-menu');
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

  test('repairs bold text with trailing whitespace immediately before stable Wiki references', () => {
    const markdown = [
      '**TODO: **[@ id="user-1" label="Alice"] Termine klären',
      '**Review ** [@ id="task-42" label="MATE-42 · Press release" char="#"]',
      '[@ id="user-1" label="Alice"]** Follow up**',
      '[@ id="user-1" label="Alice"]** **[@ id="task-42" label="MATE-42 · Press release" char="#"]**Review**',
      '`**Literal: **[@ id="user-1" label="Alice"]` stays code',
      '**Unrelated: ** plain text stays unchanged',
    ].join('\n');

    const normalized = canonicalizeWikiReferences(markdown, [], []);

    expect(normalized).toContain('**TODO:** [@ id="user-1" label="Alice"] Termine klären');
    expect(normalized).toContain('**Review** [@ id="task-42" label="MATE-42 · Press release" char="#"]');
    expect(normalized).toContain('[@ id="user-1" label="Alice"] **Follow up**');
    expect(normalized).toContain('[@ id="user-1" label="Alice"] [@ id="task-42" label="MATE-42 · Press release" char="#"] **Review**');
    expect(normalized).toContain('`**Literal: **[@ id="user-1" label="Alice"]` stays code');
    expect(normalized).toContain('**Unrelated: ** plain text stays unchanged');

    const editor = createEditor(normalized);
    const firstParagraph = editor.getJSON().content?.[0]?.content;
    expect(firstParagraph?.[0]).toMatchObject({ text: 'TODO:', marks: [{ type: 'bold' }] });
    expect(firstParagraph?.some((node) => node.type === 'mention')).toBe(true);
    editor.destroy();
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

  test('builds project-page suggestions with hierarchy context and case-insensitive title filtering', () => {
    const pages = [
      { id: 'root-1', parentId: null, title: 'Product' },
      { id: 'child-1', parentId: 'root-1', title: 'Release Plan' },
      { id: 'root-2', parentId: null, title: 'Operations' },
      { id: 'child-2', parentId: 'root-2', title: 'Release Plan' },
      { id: 'duplicate-1', parentId: null, title: 'Notes' },
      { id: 'duplicate-2', parentId: null, title: 'Notes' },
    ];
    const items = wikiPageReferenceItems(pages, 'en');

    expect(items.find((item) => item.id === 'child-1')?.description).toBe('Page · Product › Release Plan');
    expect(items.find((item) => item.id === 'child-2')?.description).toBe('Page · Operations › Release Plan');
    expect(items.filter((item) => item.label === 'Notes').map((item) => item.description))
      .toEqual(['Page · Notes · licate-1', 'Page · Notes · licate-2']);
    expect(filterWikiPageReferenceItems(items, '', 'en')).toHaveLength(pages.length);
    expect(filterWikiPageReferenceItems(items, 'RELEASE', 'en').map((item) => item.id)).toEqual(['child-1', 'child-2']);
    expect(filterWikiPageReferenceItems(items, 'does not exist', 'en')).toEqual([]);
  });

  test('resolves renamed page IDs and marks deleted page targets invalid', () => {
    const pages = [{ id: 'page-1', parentId: null, title: 'Current title' }];
    expect(resolveWikiReference(
      { id: 'page-1', label: 'Old title', mentionSuggestionChar: 'seite:' },
      [],
      [],
      pages,
    )).toMatchObject({ kind: 'page', char: 'seite:', label: 'Current title', valid: true });
    expect(resolveWikiReference(
      { id: 'deleted', label: 'Former page', mentionSuggestionChar: 'page:' },
      [],
      [],
      pages,
    )).toMatchObject({ kind: 'page', label: 'Former page', valid: false });
    expect(wikiReferenceRevision([], [], pages)).not.toBe(wikiReferenceRevision([], [], [
      { ...pages[0]!, title: 'Renamed again' },
    ]));
  });

  test('round-trips both stable page-reference prefixes through Markdown', () => {
    const editor = createEditor([
      'Deutsch [@ id="page-1" label="Plan alt" char="seite:"]',
      '',
      'English [@ id="page-1" label="Old plan" char="page:"]',
    ].join('\n'));
    const markdown = editor.getMarkdown();

    expect(markdown).toContain('[@ id="page-1" label="Plan alt" char="seite:"]');
    expect(markdown).toContain('[@ id="page-1" label="Old plan" char="page:"]');
    expect(editor.getJSON().content?.[0]?.content?.[1]).toMatchObject({
      type: 'mention',
      attrs: { id: 'page-1', mentionSuggestionChar: 'seite:' },
    });
    editor.destroy();
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

  test('round-trips reusable TODO list references without embedding mutable items', () => {
    const TodoList = createWikiTodoListExtension({
      getList: () => undefined,
      getFilter: () => 'all',
      getLocale: () => 'en',
    });
    const editor = new Editor({
      extensions: [StarterKit, Markdown, TodoList],
      content: ':::todo-list {id="list-1" label="Release checklist"} :::',
      contentType: 'markdown',
    });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'wikiTodoList',
      attrs: { id: 'list-1', label: 'Release checklist' },
    });
    const markdown = editor.getMarkdown();
    expect(markdown).toBe(':::todo-list {#list-1 label="Release checklist"} :::');
    const roundTrip = new Editor({
      extensions: [StarterKit, Markdown, TodoList],
      content: markdown,
      contentType: 'markdown',
    });
    expect(roundTrip.getJSON().content?.[0]).toMatchObject({
      type: 'wikiTodoList',
      attrs: { id: 'list-1', label: 'Release checklist' },
    });
    editor.destroy();
    roundTrip.destroy();
  });

  test('parses reusable TODO list UUIDs that begin with a digit', () => {
    const TodoList = createWikiTodoListExtension({
      getList: () => undefined,
      getFilter: () => 'all',
      getLocale: () => 'en',
    });
    const listId = '12c8ea75-c2ba-4931-ad01-98eb2afc76bc';
    const editor = new Editor({
      extensions: [StarterKit, Markdown, TodoList],
      content: `:::todo-list {#${listId} label="Numeric UUID"} :::`,
      contentType: 'markdown',
    });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'wikiTodoList',
      attrs: { id: listId, label: 'Numeric UUID' },
    });
    expect(editor.getMarkdown()).toBe(`:::todo-list {#${listId} label="Numeric UUID"} :::`);
    editor.destroy();
  });

  test('renders current person and task labels in TODO items and exposes an autocomplete input', () => {
    const itemText = 'Ask [@ id="user-1" label="Alice Old"] about [@ id="task-18" label="AK-18 · Old title" char="#"]';
    const rendered = JSON.stringify(renderWikiTodoText(itemText, (attrs) => resolveWikiReference(
      attrs,
      [{ id: 'user-1', name: 'Alice Updated' }],
      [{ id: 'task-18', key: 'AK-18', title: 'Current title' }],
    )));
    const todoSource = readFileSync(new URL('../utils/wiki-todos.ts', import.meta.url), 'utf8');

    expect(rendered).toContain('data-wiki-user-id');
    expect(rendered).toContain('@Alice Updated');
    expect(rendered).toContain('data-wiki-task-id');
    expect(rendered).toContain('#AK-18 · Current title');
    expect(rendered).not.toContain('Alice Old');
    expect(todoSource).toContain("'data-wiki-todo-reference-input': id");
    expect(todoSource).toContain("'aria-autocomplete': 'list'");
  });

  test('turns stable TODO references into current, editable @ and # tokens', () => {
    const text = [
      'Coordinate [@ id="user-1" label="Alice Old"]',
      'Review [@ id="task-18" label="AK-18 · Old title" char="#"]',
    ].join('\n');
    const editable = wikiTodoEditableText(text, (attrs) => resolveWikiReference(
      attrs,
      [{ id: 'user-1', name: 'Alice Updated' }],
      [{ id: 'task-18', key: 'AK-18', title: 'Current title' }],
    ));

    expect(editable).toBe('Coordinate @Alice Updated\nReview #AK-18');
  });

  test('filters completed TODO items by state and completion window', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    const items: WikiTodoItemRecord[] = [
      todoItem('active', false, null),
      todoItem('recent', true, '2026-08-31T12:00:00.000Z'),
      todoItem('older', true, '2026-08-15T12:00:00.000Z'),
      todoItem('historic', true, '2026-07-01T12:00:00.000Z'),
    ];

    expect(filterWikiTodoItems(items, 'all', now).map((item) => item.id)).toEqual(['active', 'recent', 'older', 'historic']);
    expect(filterWikiTodoItems(items, 'active', now).map((item) => item.id)).toEqual(['active']);
    expect(filterWikiTodoItems(items, 'completed', now).map((item) => item.id)).toEqual(['recent', 'older', 'historic']);
    expect(filterWikiTodoItems(items, 'week', now).map((item) => item.id)).toEqual(['recent']);
    expect(filterWikiTodoItems(items, 'month', now).map((item) => item.id)).toEqual(['recent', 'older']);
  });

  test('round-trips stable Wiki image references and renders persisted pin comments', () => {
    const imageId = '52c8ea75-c2ba-4931-ad01-98eb2afc76bc';
    const image: WikiImageRecord = {
      id: imageId,
      pageId: 'page-1',
      fileName: 'release.png',
      mimeType: 'image/png',
      size: 42,
      url: `/api/wiki-images/${imageId}?v=2`,
      sourceUrl: `/api/wiki-images/${imageId}?variant=source&v=2`,
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:01:00.000Z',
      annotation: {
        version: 1,
        strokes: [],
        pins: [{ id: 'pin-1', x: 0.25, y: 0.75, comment: 'Check this area' }],
      },
    };
    const WikiImage = createWikiImageExtension({ getImage: (id) => id === image.id ? image : undefined, getLocale: () => 'en' });
    const editor = new Editor({
      extensions: [StarterKit, Markdown, WikiImage],
      content: `:::wiki-image {#${imageId} alt="Release preview"} :::`,
      contentType: 'markdown',
    });

    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'wikiImage', attrs: { id: imageId, alt: 'Release preview' } });
    expect(editor.getMarkdown()).toBe(`:::wiki-image {#${imageId} alt="Release preview"} :::`);
    const rendered = JSON.stringify(renderWikiImage(image, image.id, 'Release preview', 'en', {}));
    expect(rendered).toContain('data-wiki-image-id');
    expect(rendered).toContain('Check this area');
    expect(rendered).toContain('left:25%;top:75%');
    editor.destroy();
  });

  test('keeps image annotation edits immutable and renders missing images safely', () => {
    const original = {
      version: 1 as const,
      strokes: [{ color: '#ef4444', width: 5, points: [{ x: 0.1, y: 0.2 }] }],
      pins: [{ id: 'pin-1', x: 0.3, y: 0.4, comment: 'Original' }],
    };
    const cloned = cloneWikiImageAnnotation(original);
    cloned.pins[0]!.comment = 'Changed';
    cloned.strokes[0]!.points[0]!.x = 0.9;
    expect(original.pins[0]!.comment).toBe('Original');
    expect(original.strokes[0]!.points[0]!.x).toBe(0.1);

    const MissingImage = createWikiImageExtension({ getImage: () => undefined, getLocale: () => 'en' });
    const editor = new Editor({
      extensions: [StarterKit, Markdown, MissingImage],
      content: ':::wiki-image {#missing alt="Former image"} :::',
      contentType: 'markdown',
    });
    const rendered = JSON.stringify(renderWikiImage(undefined, 'missing', 'Former image', 'en', {}));
    expect(rendered).toContain('ak-wiki-image is-invalid');
    expect(rendered).toContain('deleted or is no longer accessible');
    expect(editor.getMarkdown()).toContain('#missing');
    editor.destroy();
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

function todoItem(id: string, completed: boolean, completedAt: string | null): WikiTodoItemRecord {
  return {
    id,
    listId: 'list-1',
    text: id,
    completed,
    completedAt,
    position: 0,
    updatedAt: '2026-09-02T12:00:00.000Z',
  };
}
