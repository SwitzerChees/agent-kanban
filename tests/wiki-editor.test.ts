import { describe, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { canonicalizeWikiReferences, resolveWikiReference, wikiReferenceRevision } from '../utils/wiki-references';
import { readFileSync } from 'node:fs';

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
});

function createEditor() {
  return new Editor({
    extensions: [StarterKit, Markdown, Mention, TableKit],
    content,
    contentType: 'markdown',
  });
}
