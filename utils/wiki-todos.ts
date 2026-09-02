import { Node, createAtomBlockMarkdownSpec, mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { parseWikiAtomBlockAttributes } from './wiki-atom-block';
import type {
  ResolvedWikiReference,
  WikiReferenceAttributes,
  WikiReferenceMember,
  WikiReferenceTask,
} from './wiki-references';

export type WikiTodoFilter = 'all' | 'active' | 'completed' | 'week' | 'month';

export interface WikiTodoItemRecord {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  completedAt: string | null;
  position: number;
  updatedAt: string;
}

export interface WikiTodoListRecord {
  id: string;
  projectId: string;
  name: string;
  updatedAt: string;
  items: WikiTodoItemRecord[];
}

export interface WikiTodoExtensionOptions {
  getList: (id: string) => WikiTodoListRecord | undefined;
  getFilter: (id: string) => WikiTodoFilter;
  getLocale: () => 'en' | 'de';
  resolveReference?: (attrs: WikiReferenceAttributes) => ResolvedWikiReference;
  getMembers?: () => readonly WikiReferenceMember[];
  getTasks?: () => readonly WikiReferenceTask[];
  createItem?: (listId: string, text: string) => Promise<WikiTodoItemRecord>;
  updateItem?: (item: WikiTodoItemRecord, text: string) => Promise<WikiTodoItemRecord>;
  toggleItem?: (item: WikiTodoItemRecord, completed: boolean) => Promise<WikiTodoItemRecord>;
  deleteItem?: (item: WikiTodoItemRecord) => Promise<void>;
  openTask?: (taskId: string) => void;
}

const stableReferencePattern = /\[@\s+id="([^"\r\n]*)"\s+label="([^"\r\n]*)"(?:\s+char="([^"\r\n]*)")?\]/g;
type WikiTodoTextNode = string | DOMOutputSpec;

export interface WikiTodoTextPart {
  type: 'text' | 'reference';
  text: string;
  reference?: ResolvedWikiReference;
}

const markdownSpec = createAtomBlockMarkdownSpec({
  nodeName: 'wikiTodoList',
  name: 'todo-list',
  requiredAttributes: ['id'],
  allowedAttributes: ['id', 'label'],
  parseAttributes: parseWikiAtomBlockAttributes,
});

export function createWikiTodoListExtension(options: WikiTodoExtensionOptions) {
  return Node.create<WikiTodoExtensionOptions>({
    name: 'wikiTodoList',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
      return options;
    },

    addAttributes() {
      return {
        id: { default: null },
        label: { default: '' },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-wiki-todo-list-id]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const id = String(node.attrs.id ?? '');
      const fallbackLabel = String(node.attrs.label ?? 'TODO list');
      return renderTodoList(this.options.getList(id), id, fallbackLabel, this.options.getFilter(id), this.options.getLocale(), HTMLAttributes, this.options.resolveReference);
    },

    ...markdownSpec,
  });
}

export function filterWikiTodoItems(
  items: readonly WikiTodoItemRecord[],
  filter: WikiTodoFilter,
  now = new Date(),
) {
  if (filter === 'active') return items.filter((item) => !item.completed);
  if (filter === 'completed') return items.filter((item) => item.completed);
  if (filter === 'week' || filter === 'month') {
    const threshold = now.getTime() - (filter === 'week' ? 7 : 30) * 24 * 60 * 60 * 1000;
    return items.filter((item) => item.completed && item.completedAt && new Date(item.completedAt).getTime() >= threshold);
  }
  return [...items];
}

function renderTodoList(
  list: WikiTodoListRecord | undefined,
  id: string,
  fallbackLabel: string,
  filter: WikiTodoFilter,
  locale: 'en' | 'de',
  HTMLAttributes: Record<string, unknown>,
  resolveReference?: WikiTodoExtensionOptions['resolveReference'],
): DOMOutputSpec {
  const copy = locale === 'de' ? {
    missing: 'Diese TODO-Liste ist nicht mehr verfügbar.',
    all: 'Alle',
    active: 'Offen',
    completed: 'Erledigt',
    week: '7 Tage',
    month: '30 Tage',
    add: 'Hinzufügen',
    placeholder: 'Neuer Eintrag …',
    empty: 'Keine Einträge in dieser Ansicht.',
    summary: (active: number, total: number) => `${active} offen · ${total} gesamt`,
  } : {
    missing: 'This TODO list is no longer available.',
    all: 'All',
    active: 'Active',
    completed: 'Completed',
    week: '7 days',
    month: '30 days',
    add: 'Add',
    placeholder: 'New item …',
    empty: 'No items in this view.',
    summary: (active: number, total: number) => `${active} active · ${total} total`,
  };
  const attrs = mergeAttributes(HTMLAttributes, {
    class: `ak-wiki-todo${list ? '' : ' is-invalid'}`,
    'data-wiki-todo-list-id': id,
    contenteditable: 'false',
  });

  if (!list) {
    return ['section', attrs, ['strong', {}, fallbackLabel], ['p', {}, copy.missing]];
  }

  const visibleItems = filterWikiTodoItems(list.items, filter);
  const activeCount = list.items.filter((item) => !item.completed).length;
  const filterButtons = (['all', 'active', 'completed', 'week', 'month'] as const).map((value) => [
    'button',
    {
      type: 'button',
      class: value === filter ? 'is-active' : '',
      'data-wiki-todo-filter': value,
      'data-wiki-todo-list-id': id,
      'aria-pressed': value === filter ? 'true' : 'false',
    },
    copy[value],
  ] as DOMOutputSpec);
  const itemNodes = visibleItems.map((item) => [
    'li',
    { class: item.completed ? 'is-completed' : '' },
    ['input', {
      type: 'checkbox',
      checked: item.completed ? 'checked' : null,
      'data-wiki-todo-item-id': item.id,
      'aria-label': wikiTodoTextLabel(item.text, resolveReference),
    }],
    ['span', {}, ...renderWikiTodoText(item.text, resolveReference)],
    ...(item.completedAt ? [['time', { datetime: item.completedAt }, formatCompletionDate(item.completedAt, locale)]] : []),
  ] as DOMOutputSpec);

  return [
    'section',
    attrs,
    ['header', {},
      ['div', {}, ['strong', {}, list.name], ['span', {}, copy.summary(activeCount, list.items.length)]],
      ['div', { class: 'ak-wiki-todo-filters', role: 'group' }, ...filterButtons],
    ],
    ['ul', {}, ...(itemNodes.length ? itemNodes : [['li', { class: 'is-empty' }, copy.empty] as DOMOutputSpec])],
    ['form', { 'data-wiki-todo-add-form': id },
      ['textarea', {
        name: 'text',
        rows: '2',
        maxlength: '2000',
        autocomplete: 'off',
        placeholder: copy.placeholder,
        'aria-label': copy.placeholder,
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'data-wiki-todo-reference-input': id,
      }, ''],
      ['button', { type: 'submit' }, copy.add],
    ],
  ];
}

export function renderWikiTodoText(
  text: string,
  resolveReference?: WikiTodoExtensionOptions['resolveReference'],
): WikiTodoTextNode[] {
  return wikiTodoTextParts(text, resolveReference).map((part) => {
    if (part.type === 'text' || !part.reference) return part.text;
    const reference = part.reference;
    const page = reference.kind === 'page';
    return ['span', {
      class: `ak-wiki-reference ${reference.kind === 'task' ? 'is-task' : page ? 'is-page' : 'is-user'}${reference.valid ? '' : ' is-invalid'}`,
      ...(reference.kind === 'task'
        ? { 'data-wiki-task-id': reference.id, role: 'link', tabindex: '0' }
        : page && reference.valid
          ? { 'data-wiki-page-id': reference.id, role: 'link', tabindex: '0' }
          : reference.kind === 'user'
            ? { 'data-wiki-user-id': reference.id }
            : { 'aria-disabled': 'true' }),
    }, part.text] as DOMOutputSpec;
  });
}

export function wikiTodoTextParts(
  text: string,
  resolveReference?: WikiTodoExtensionOptions['resolveReference'],
): WikiTodoTextPart[] {
  const content: WikiTodoTextPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(stableReferencePattern)) {
    const index = match.index ?? 0;
    if (index > offset) content.push({ type: 'text', text: text.slice(offset, index) });
    const attrs: WikiReferenceAttributes = {
      id: match[1],
      label: match[2],
      mentionSuggestionChar: match[3],
    };
    const reference = resolveReference?.(attrs) ?? fallbackReference(attrs);
    const page = reference.kind === 'page';
    content.push({
      type: 'reference',
      text: page ? `page: · ${reference.label}` : `${reference.char}${reference.label}`,
      reference,
    });
    offset = index + match[0].length;
  }
  if (offset < text.length) content.push({ type: 'text', text: text.slice(offset) });
  return content.length ? content : [{ type: 'text', text: '' }];
}

export function wikiTodoEditableText(
  text: string,
  resolveReference?: WikiTodoExtensionOptions['resolveReference'],
) {
  return wikiTodoTextParts(text, resolveReference).map((part) => {
    if (part.type === 'text' || !part.reference) return part.text;
    if (part.reference.kind === 'task') return `#${part.reference.label.split(' · ')[0]}`;
    if (part.reference.kind === 'user') return `@${part.reference.label}`;
    return `${part.reference.char}${part.reference.label}`;
  }).join('');
}

function wikiTodoTextLabel(
  text: string,
  resolveReference?: WikiTodoExtensionOptions['resolveReference'],
) {
  return renderWikiTodoText(text, resolveReference).map((node) => (
    typeof node === 'string' ? node : Array.isArray(node) ? String(node[2] ?? '') : ''
  )).join('');
}

function fallbackReference(attrs: WikiReferenceAttributes): ResolvedWikiReference {
  const char = attrs.mentionSuggestionChar === '#'
    ? '#'
    : attrs.mentionSuggestionChar === 'seite:' || attrs.mentionSuggestionChar === 'page:'
      ? attrs.mentionSuggestionChar
      : '@';
  return {
    id: attrs.id ?? '',
    char,
    kind: char === '#' ? 'task' : char === '@' ? 'user' : 'page',
    label: attrs.label ?? attrs.id ?? '',
    valid: true,
  };
}

function formatCompletionDate(value: string, locale: 'en' | 'de') {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));
}
