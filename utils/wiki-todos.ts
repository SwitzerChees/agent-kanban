import { Node, createAtomBlockMarkdownSpec, mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';

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

interface WikiTodoExtensionOptions {
  getList: (id: string) => WikiTodoListRecord | undefined;
  getFilter: (id: string) => WikiTodoFilter;
  getLocale: () => 'en' | 'de';
}

const markdownSpec = createAtomBlockMarkdownSpec({
  nodeName: 'wikiTodoList',
  name: 'todo-list',
  requiredAttributes: ['id'],
  allowedAttributes: ['id', 'label'],
});

export function createWikiTodoListExtension(options: WikiTodoExtensionOptions) {
  return Node.create({
    name: 'wikiTodoList',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

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
      return renderTodoList(options.getList(id), id, fallbackLabel, options.getFilter(id), options.getLocale(), HTMLAttributes);
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
      'aria-label': item.text,
    }],
    ['span', {}, item.text],
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
      ['input', { name: 'text', type: 'text', maxlength: '500', placeholder: copy.placeholder, 'aria-label': copy.placeholder }],
      ['button', { type: 'submit' }, copy.add],
    ],
  ];
}

function formatCompletionDate(value: string, locale: 'en' | 'de') {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));
}
