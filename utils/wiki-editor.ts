import type {
  ChainedCommands,
  CommandProps,
  Editor,
  JSONContent,
  KeyboardShortcutCommand,
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

type WikiListType = 'bulletList' | 'orderedList' | 'taskList';
type WikiListItemType = 'listItem' | 'taskItem';
type WikiTableCellAlign = 'left' | 'center' | 'right' | null;

interface MarkdownTableCellToken extends MarkdownToken {
  align?: WikiTableCellAlign;
}

interface MarkdownTableToken extends MarkdownToken {
  align?: WikiTableCellAlign[];
  header?: MarkdownTableCellToken[];
  rows?: MarkdownTableCellToken[][];
}

interface ParsedCellLine {
  source: string;
  listType: WikiListType | null;
  depth: number;
  checked?: boolean;
  start?: number;
}

const listTypes: WikiListType[] = ['bulletList', 'orderedList', 'taskList'];

export const wikiEditorHandlers = {
  bulletList: createWikiListHandler('bulletList'),
  orderedList: createWikiListHandler('orderedList'),
  taskList: createWikiListHandler('taskList'),
};

export function wikiTableKeyboardShortcuts(
  editor: Editor,
  fallback: Record<string, KeyboardShortcutCommand | undefined>,
) {
  return {
    ...fallback,
    Tab: () => runTableListIndent(editor, 'sink') || fallback.Tab?.({ editor }) || false,
    'Shift-Tab': () => runTableListIndent(editor, 'lift') || fallback['Shift-Tab']?.({ editor }) || false,
  };
}

export function parseWikiTableMarkdown(token: MarkdownTableToken, helpers: MarkdownParseHelpers) {
  const alignments = token.align ?? [];
  const rows: JSONContent[] = [];

  if (token.header) {
    rows.push(helpers.createNode('tableRow', {}, token.header.map((cell, index) => helpers.createNode(
      'tableHeader',
      tableCellAttrs(alignments[index] ?? cell.align),
      parseTableCell(cell, helpers),
    ))));
  }

  for (const row of token.rows ?? []) {
    rows.push(helpers.createNode('tableRow', {}, row.map((cell, index) => helpers.createNode(
      'tableCell',
      tableCellAttrs(alignments[index] ?? cell.align),
      parseTableCell(cell, helpers),
    ))));
  }

  return helpers.createNode('table', undefined, rows);
}

export function renderWikiTableMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => ({
    text: renderTableCell(cell, helpers),
    header: cell.type === 'tableHeader',
    align: normalizedAlign(cell.attrs?.align),
  })));
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (!columnCount) return '';

  const widths = Array.from({ length: columnCount }, (_, index) => Math.max(
    3,
    ...rows.map((row) => row[index]?.text.length ?? 0),
  ));
  const alignments = Array.from({ length: columnCount }, (_, index) => (
    rows.find((row) => row[index]?.align)?.[index]?.align ?? null
  ));
  const firstRow = rows[0] ?? [];
  const hasHeader = firstRow.some((cell) => cell.header);
  const header = Array.from({ length: columnCount }, (_, index) => hasHeader ? firstRow[index]?.text ?? '' : '');
  const body = hasHeader ? rows.slice(1) : rows;
  const pad = (value: string, width: number) => value + ' '.repeat(Math.max(0, width - value.length));

  let markdown = `\n| ${header.map((value, index) => pad(value, widths[index]!)).join(' | ')} |\n`;
  markdown += `| ${widths.map((width, index) => tableDivider(width, alignments[index] ?? null)).join(' | ')} |\n`;
  for (const row of body) {
    markdown += `| ${Array.from({ length: columnCount }, (_, index) => pad(row[index]?.text ?? '', widths[index]!)).join(' | ')} |\n`;
  }
  return markdown;
}

function createWikiListHandler(listType: WikiListType) {
  return {
    canExecute: (editor: Editor) => canToggleList(editor, listType)
      || editor.isActive('listItem')
      || listTypes.some((type) => hasExtension(editor, type) && editor.isActive(type)),
    execute: (editor: Editor) => {
      let chain = editor.chain().focus().command(splitActiveTableLine);
      const targetItemType: WikiListItemType = listType === 'taskList' ? 'taskItem' : 'listItem';

      if (editor.isActive(listType)) {
        chain = chain.liftListItem(targetItemType);
        return liftLists(chain, editor);
      }

      if (listTypes.some((type) => hasExtension(editor, type) && editor.isActive(type))) {
        const currentItemType: WikiListItemType = editor.isActive('taskList') ? 'taskItem' : 'listItem';
        chain = liftLists(chain.liftListItem(currentItemType), editor);
      }

      return toggleList(chain, listType);
    },
    isActive: (editor: Editor) => editor.isActive(listType),
    isDisabled: (editor: Editor) => !hasExtension(editor, listType) || editor.isActive('code'),
  };
}

function splitActiveTableLine({ tr }: CommandProps) {
  const { selection } = tr;
  const { $from } = selection;
  if (!selection.empty || $from.parent.type.name !== 'paragraph') return true;
  if (!hasAncestor($from, ['tableCell', 'tableHeader'])) return true;
  if (hasAncestor($from, ['listItem', 'taskItem'])) return true;

  const paragraph = $from.parent;
  const segments: ProseMirrorNode[][] = [[]];
  const breakOffsets: number[] = [];
  paragraph.forEach((child, offset) => {
    if (child.type.name === 'hardBreak') {
      breakOffsets.push(offset);
      segments.push([]);
    } else {
      segments.at(-1)!.push(child);
    }
  });
  if (!breakOffsets.length) return true;

  const cursorOffset = $from.parentOffset;
  const activeSegment = breakOffsets.filter((offset) => offset < cursorOffset).length;
  const segmentStart = activeSegment ? breakOffsets[activeSegment - 1]! + 1 : 0;
  const segmentSize = segments[activeSegment]!.reduce((total, child) => total + child.nodeSize, 0);
  const offsetInSegment = Math.min(Math.max(cursorOffset - segmentStart, 0), segmentSize);
  const paragraphs = segments.map((content) => paragraph.type.create(paragraph.attrs, content));
  const paragraphPosition = $from.before($from.depth);
  const precedingSize = paragraphs.slice(0, activeSegment).reduce((total, child) => total + child.nodeSize, 0);

  tr.replaceWith(paragraphPosition, paragraphPosition + paragraph.nodeSize, paragraphs);
  tr.setSelection(TextSelection.create(tr.doc, paragraphPosition + precedingSize + 1 + offsetInSegment));
  return true;
}

function runTableListIndent(editor: Editor, direction: 'sink' | 'lift') {
  if (!editor.isActive('table')) return false;
  const itemType: WikiListItemType | null = editor.isActive('taskItem')
    ? 'taskItem'
    : editor.isActive('listItem') ? 'listItem' : null;
  if (!itemType) return false;

  if (direction === 'sink') editor.commands.sinkListItem(itemType);
  else editor.commands.liftListItem(itemType);
  return true;
}

function hasAncestor(position: CommandProps['tr']['selection']['$from'], names: string[]) {
  for (let depth = position.depth; depth >= 0; depth -= 1) {
    if (names.includes(position.node(depth).type.name)) return true;
  }
  return false;
}

function toggleList(chain: ChainedCommands, listType: WikiListType) {
  if (listType === 'bulletList') return chain.toggleBulletList();
  if (listType === 'orderedList') return chain.toggleOrderedList();
  return chain.toggleTaskList();
}

function canToggleList(editor: Editor, listType: WikiListType) {
  if (listType === 'bulletList') return editor.can().toggleBulletList();
  if (listType === 'orderedList') return editor.can().toggleOrderedList();
  return editor.can().toggleTaskList();
}

function liftLists(chain: ChainedCommands, editor: Editor) {
  let result = chain;
  for (const type of listTypes) {
    if (hasExtension(editor, type)) result = result.lift(type);
  }
  return result;
}

function hasExtension(editor: Editor, name: string) {
  return editor.extensionManager.extensions.some((extension) => extension.name === name);
}

function parseTableCell(cell: MarkdownTableCellToken, helpers: MarkdownParseHelpers) {
  const lines = splitCellLines(cell.text ?? '').map(parseCellLine);
  const content: JSONContent[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.listType) {
      content.push(helpers.createNode('paragraph', {}, parseInline(line.source, helpers)));
      index += 1;
      continue;
    }
    const parsed = parseList(lines, index, line.depth, line.listType, helpers);
    content.push(parsed.node);
    index = parsed.nextIndex;
  }
  return content.length ? content : [helpers.createNode('paragraph')];
}

function parseList(
  lines: ParsedCellLine[],
  startIndex: number,
  depth: number,
  listType: WikiListType,
  helpers: MarkdownParseHelpers,
): { node: JSONContent; nextIndex: number } {
  const items: JSONContent[] = [];
  let index = startIndex;
  const firstStart = lines[startIndex]?.start ?? 1;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.listType || line.depth < depth || (line.depth === depth && line.listType !== listType)) break;
    if (line.depth > depth) {
      if (!items.length) break;
      const nested = parseList(lines, index, line.depth, line.listType, helpers);
      items.at(-1)!.content = [...(items.at(-1)!.content ?? []), nested.node];
      index = nested.nextIndex;
      continue;
    }

    const itemType = listType === 'taskList' ? 'taskItem' : 'listItem';
    const attrs = listType === 'taskList' ? { checked: Boolean(line.checked) } : {};
    items.push(helpers.createNode(itemType, attrs, [
      helpers.createNode('paragraph', {}, parseInline(line.source, helpers)),
    ]));
    index += 1;
  }

  const attrs = listType === 'orderedList' ? { start: firstStart, type: null } : {};
  return { node: helpers.createNode(listType, attrs, items), nextIndex: index };
}

function parseCellLine(source: string): ParsedCellLine {
  const indentation = source.match(/^((?:&nbsp;|\u00a0| )*)/)?.[1] ?? '';
  const indentWidth = indentation.replaceAll('&nbsp;', ' ').length;
  const value = source.slice(indentation.length);
  const task = value.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
  if (task) return { source: task[2]!, listType: 'taskList', depth: Math.floor(indentWidth / 2), checked: task[1]!.toLowerCase() === 'x' };
  const ordered = value.match(/^(\d+)\.\s+(.*)$/);
  if (ordered) return { source: ordered[2]!, listType: 'orderedList', depth: Math.floor(indentWidth / 2), start: Number(ordered[1]) };
  const bullet = value.match(/^[-*+]\s+(.*)$/);
  if (bullet) return { source: bullet[1]!, listType: 'bulletList', depth: Math.floor(indentWidth / 2) };
  return { source: value, listType: null, depth: 0 };
}

function parseInline(source: string, helpers: MarkdownParseHelpers) {
  if (!source) return [];
  const tokens = helpers.tokenizeInline?.(source) ?? [{ type: 'text', raw: source, text: source }];
  return helpers.parseInline(tokens);
}

function splitCellLines(source: string) {
  return source.split(/<br\s*\/?\s*>|\u001f/gi);
}

function renderTableCell(cell: JSONContent, helpers: MarkdownRendererHelpers) {
  const lines = (cell.content ?? []).flatMap((child) => renderCellBlock(child, helpers));
  return lines.map(encodeCellLine).join('<br>');
}

function renderCellBlock(node: JSONContent, helpers: MarkdownRendererHelpers): string[] {
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
    return renderListLines(node, helpers, 0);
  }
  return helpers.renderChildren(node).trim().split(/\r?\n/);
}

function renderListLines(list: JSONContent, helpers: MarkdownRendererHelpers, depth: number): string[] {
  const lines: string[] = [];
  const start = Number(list.attrs?.start ?? 1);
  for (const [index, item] of (list.content ?? []).entries()) {
    const paragraph = item.content?.find((child) => child.type === 'paragraph');
    const label = paragraph ? helpers.renderChildren(paragraph).replace(/\s*\r?\n\s*/g, ' ').trim() : '';
    const marker = list.type === 'orderedList'
      ? `${start + index}.`
      : list.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}]` : '-';
    lines.push(`${'  '.repeat(depth)}${marker} ${label}`.trimEnd());
    for (const nested of item.content?.filter((child) => listTypes.includes(child.type as WikiListType)) ?? []) {
      lines.push(...renderListLines(nested, helpers, depth + 1));
    }
  }
  return lines;
}

function encodeCellLine(source: string) {
  const leadingSpaces = source.match(/^ */)?.[0].length ?? 0;
  const value = `${'&nbsp;'.repeat(leadingSpaces)}${source.slice(leadingSpaces)}`;
  return value.replace(/(?<!\\)\|/g, '\\|');
}

function tableCellAttrs(value: unknown) {
  const align = normalizedAlign(value);
  return align ? { align } : {};
}

function normalizedAlign(value: unknown): WikiTableCellAlign {
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

function tableDivider(width: number, align: WikiTableCellAlign) {
  const dashes = '-'.repeat(Math.max(3, width));
  if (align === 'left') return `:${dashes}`;
  if (align === 'right') return `${dashes}:`;
  if (align === 'center') return `:${dashes}:`;
  return dashes;
}
