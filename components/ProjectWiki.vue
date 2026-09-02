<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Table, TableCell, TableHeader, TableRow, TableView } from '@tiptap/extension-table';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import { parseWikiTableMarkdown, renderWikiTableMarkdown, wikiEditorHandlers, wikiTableKeyboardShortcuts } from '~/utils/wiki-editor';
import { filterWikiPageReferenceItems, resolveWikiReference, wikiPageReferenceItems, wikiReferenceRevision, type WikiReferenceAttributes } from '~/utils/wiki-references';
import { createWikiTodoListExtension, type WikiTodoFilter, type WikiTodoListRecord } from '~/utils/wiki-todos';

type Locale = 'en' | 'de';
type WikiTemplateId = 'blank' | 'meeting' | 'checklist';
type WikiDropPlacement = 'before' | 'inside' | 'after';

interface WikiProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

interface WikiPage {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  content: string;
  position: number;
  createdBy: string;
  updatedBy: string;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WikiTreeRow {
  page: WikiPage;
  depth: number;
}

interface WikiMember {
  id: string;
  name: string;
  email: string;
}

interface WikiTask {
  id: string;
  key: string;
  title: string;
}

interface MentionRenderProps {
  options: { HTMLAttributes: Record<string, unknown> };
  node: { attrs: WikiReferenceAttributes };
}

const props = defineProps<{
  project: WikiProject;
  locale: Locale;
  isMobileViewport: boolean;
  sidebarCollapsed: boolean;
  members: WikiMember[];
  tasks: WikiTask[];
}>();

const emit = defineEmits<{
  showBoard: [];
  openSidebar: [];
  openTask: [taskId: string];
  pageChange: [page: { id: string; title: string } | null];
}>();

const copy = computed(() => props.locale === 'de' ? {
  board: 'Board',
  wiki: 'Wiki',
  pages: 'Seiten',
  search: 'Seiten durchsuchen …',
  newPage: 'Neue Seite',
  addChild: 'Unterseite anlegen',
  edit: 'Bearbeiten',
  save: 'Speichern',
  cancel: 'Abbrechen',
  delete: 'Seite löschen',
  deleteConfirm: 'Diese Wiki-Seite wirklich löschen?',
  share: 'Link kopieren',
  copied: 'Link kopiert',
  saved: 'Gespeichert',
  saving: 'Wird gespeichert …',
  editedBy: 'Bearbeitet von',
  pageTree: 'Wiki-Seiten',
  outline: 'Auf dieser Seite',
  noOutline: 'Noch keine Überschriften',
  noResults: 'Keine passenden Seiten.',
  emptyTitle: 'Wissen, das beim Projekt bleibt',
  emptyBody: 'Halte Meeting-Notizen, Entscheidungen, Checklisten und wiederkehrende Abläufe direkt neben dem Board fest.',
  chooseTemplate: 'Mit einer Vorlage starten',
  blank: 'Leere Seite',
  blankHint: 'Für freie Notizen und Dokumentation',
  meeting: 'Meeting-Notiz',
  meetingHint: 'Agenda, Notizen, Entscheidungen und nächste Schritte',
  checklist: 'Checkliste',
  checklistHint: 'Wiederkehrende Abläufe und offene Punkte',
  untitled: 'Unbenannte Seite',
  meetingTitle: 'Neue Meeting-Notiz',
  checklistTitle: 'Neue Checkliste',
  titleLabel: 'Seitentitel',
  contentLabel: 'Inhalt der Wiki-Seite',
  placeholder: 'Schreibe Notizen, füge Überschriften hinzu oder erstelle eine Checkliste …',
  rootPages: 'Projekt-Wiki',
  loading: 'Wiki wird geladen …',
  retry: 'Erneut versuchen',
  childDeleteError: 'Die Seite hat noch Unterseiten. Lösche oder verschiebe diese zuerst.',
  genericError: 'Die Wiki-Aktion konnte nicht abgeschlossen werden.',
  bold: 'Fett',
  italic: 'Kursiv',
  paragraph: 'Absatz',
  heading1: 'Überschrift 1',
  heading2: 'Überschrift 2',
  heading3: 'Überschrift 3',
  bulletList: 'Aufzählung',
  orderedList: 'Nummerierte Liste',
  taskList: 'Checkliste',
  quote: 'Zitat',
  link: 'Link',
  undo: 'Rückgängig',
  redo: 'Wiederholen',
  referencesHint: 'Tippe @ für Projektmitglieder, # für Projekt-Tasks und seite: für Wiki-Seiten.',
  openTask: 'Task öffnen',
  openPage: 'Wiki-Seite öffnen',
  pageReference: 'Seite',
  missingPage: 'Gelöschte oder nicht zugängliche Wiki-Seite',
  dragPage: 'Seite verschieben',
  dropBefore: 'Davor einfügen',
  dropInside: 'Als Unterseite einfügen',
  dropAfter: 'Danach einfügen',
  dropRoot: 'Auf oberster Ebene ablegen',
  stalePage: 'Die Seite wurde inzwischen geändert. Deine Änderung wurde nicht gespeichert; bitte lade die Seite neu und prüfe sie erneut.',
  todoError: 'Die TODO-Liste konnte nicht aktualisiert werden.',
  todoDuplicate: 'Eine TODO-Liste mit diesem Namen existiert bereits.',
} : {
  board: 'Board',
  wiki: 'Wiki',
  pages: 'Pages',
  search: 'Search pages …',
  newPage: 'New page',
  addChild: 'Add child page',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete page',
  deleteConfirm: 'Delete this wiki page?',
  share: 'Copy link',
  copied: 'Link copied',
  saved: 'Saved',
  saving: 'Saving …',
  editedBy: 'Edited by',
  pageTree: 'Wiki pages',
  outline: 'On this page',
  noOutline: 'No headings yet',
  noResults: 'No matching pages.',
  emptyTitle: 'Knowledge that stays with the project',
  emptyBody: 'Keep meeting notes, decisions, checklists, and recurring processes right beside the board.',
  chooseTemplate: 'Start with a template',
  blank: 'Blank page',
  blankHint: 'For free-form notes and documentation',
  meeting: 'Meeting notes',
  meetingHint: 'Agenda, notes, decisions, and next steps',
  checklist: 'Checklist',
  checklistHint: 'Recurring processes and open items',
  untitled: 'Untitled page',
  meetingTitle: 'New meeting notes',
  checklistTitle: 'New checklist',
  titleLabel: 'Page title',
  contentLabel: 'Wiki page content',
  placeholder: 'Write notes, add headings, or create a checklist …',
  rootPages: 'Project wiki',
  loading: 'Loading wiki …',
  retry: 'Try again',
  childDeleteError: 'This page still has child pages. Delete or move them first.',
  genericError: 'The wiki action could not be completed.',
  bold: 'Bold',
  italic: 'Italic',
  paragraph: 'Paragraph',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  bulletList: 'Bullet list',
  orderedList: 'Numbered list',
  taskList: 'Checklist',
  quote: 'Quote',
  link: 'Link',
  undo: 'Undo',
  redo: 'Redo',
  referencesHint: 'Type @ for project members, # for project tasks, and page: for Wiki pages.',
  openTask: 'Open task',
  openPage: 'Open Wiki page',
  pageReference: 'Page',
  missingPage: 'Deleted or inaccessible Wiki page',
  dragPage: 'Move page',
  dropBefore: 'Insert before',
  dropInside: 'Insert as child page',
  dropAfter: 'Insert after',
  dropRoot: 'Drop at the top level',
  stalePage: 'This page changed in the meantime. Your change was not saved; reload the page and review it again.',
  todoError: 'The TODO list could not be updated.',
  todoDuplicate: 'A TODO list with this name already exists.',
});

const pages = ref<WikiPage[]>([]);
const todoLists = ref<WikiTodoListRecord[]>([]);
const todoFilters = reactive<Record<string, WikiTodoFilter>>({});
const selectedPageId = ref<string | null>(null);
const searchQuery = ref('');
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const createMenuOpen = ref(false);
const mobilePagesOpen = ref(false);
const copied = ref(false);
const errorMessage = ref<string | null>(null);
const pageSearchDe = ref('');
const pageSearchEn = ref('');
const draftTitle = ref('');
const draftContent = ref('');
const draggedPageId = ref<string | null>(null);
const dropTarget = ref<{ pageId: string | null; placement: WikiDropPlacement | 'root' } | null>(null);

const templates = computed(() => [{
  id: 'blank' as const,
  label: copy.value.blank,
  hint: copy.value.blankHint,
  icon: 'i-lucide-file-plus-2',
  title: copy.value.untitled,
  content: '',
}, {
  id: 'meeting' as const,
  label: copy.value.meeting,
  hint: copy.value.meetingHint,
  icon: 'i-lucide-calendar-clock',
  title: copy.value.meetingTitle,
  content: props.locale === 'de'
    ? '## Agenda\n\n- [ ] Thema ergänzen\n\n## Notizen\n\n\n## Entscheidungen\n\n\n## Nächste Schritte\n\n- [ ] Aufgabe ergänzen\n'
    : '## Agenda\n\n- [ ] Add topic\n\n## Notes\n\n\n## Decisions\n\n\n## Next steps\n\n- [ ] Add action item\n',
}, {
  id: 'checklist' as const,
  label: copy.value.checklist,
  hint: copy.value.checklistHint,
  icon: 'i-lucide-list-checks',
  title: copy.value.checklistTitle,
  content: props.locale === 'de'
    ? '## Checkliste\n\n- [ ] Ersten Punkt ergänzen\n- [ ] Zweiten Punkt ergänzen\n'
    : '## Checklist\n\n- [ ] Add first item\n- [ ] Add second item\n',
}]);

const editorToolbarItems = computed<EditorToolbarItem[][]>(() => [[
  { kind: 'paragraph', icon: 'i-lucide-pilcrow', tooltip: { text: copy.value.paragraph }, 'aria-label': copy.value.paragraph },
  { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', tooltip: { text: copy.value.heading1 }, 'aria-label': copy.value.heading1 },
  { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: copy.value.heading2 }, 'aria-label': copy.value.heading2 },
  { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', tooltip: { text: copy.value.heading3 }, 'aria-label': copy.value.heading3 },
], [
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: copy.value.bold }, 'aria-label': copy.value.bold },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: copy.value.italic }, 'aria-label': copy.value.italic },
], [
  { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: copy.value.bulletList }, 'aria-label': copy.value.bulletList },
  { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: copy.value.orderedList }, 'aria-label': copy.value.orderedList },
  { kind: 'taskList', icon: 'i-lucide-list-checks', tooltip: { text: copy.value.taskList }, 'aria-label': copy.value.taskList },
  { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: copy.value.quote }, 'aria-label': copy.value.quote },
  { kind: 'link', icon: 'i-lucide-link-2', tooltip: { text: copy.value.link }, 'aria-label': copy.value.link },
], [
  { kind: 'undo', icon: 'i-lucide-undo-2', tooltip: { text: copy.value.undo }, 'aria-label': copy.value.undo },
  { kind: 'redo', icon: 'i-lucide-redo-2', tooltip: { text: copy.value.redo }, 'aria-label': copy.value.redo },
]]);

const AccessibleTable = Table.extend({
  parseMarkdown: parseWikiTableMarkdown,
  renderMarkdown: renderWikiTableMarkdown,
  renderHTML(props): DOMOutputSpec {
    const rendered = this.parent?.(props) as DOMOutputSpec;

    if (Array.isArray(rendered) && rendered[0] === 'div') {
      const attributes = typeof rendered[1] === 'object' && !Array.isArray(rendered[1])
        ? rendered[1]
        : {};
      return ['div', { ...attributes, tabindex: '0' }, ...rendered.slice(2)] as DOMOutputSpec;
    }

    return rendered;
  },
  addNodeView() {
    return ({ node }) => {
      const view = new TableView(node, this.options.cellMinWidth);
      view.dom.tabIndex = 0;
      return view;
    };
  },
  addKeyboardShortcuts() {
    return wikiTableKeyboardShortcuts(this.editor, this.parent?.() ?? {});
  },
}).configure({ renderWrapper: true });

const WikiTodoList = createWikiTodoListExtension({
  getList: (id) => todoLists.value.find((list) => list.id === id),
  getFilter: (id) => todoFilters[id] ?? 'all',
  getLocale: () => props.locale,
});

const wikiEditorExtensions = [
  TaskList,
  TaskItem.configure({ nested: true }),
  AccessibleTable,
  TableRow,
  TableHeader,
  TableCell,
  WikiTodoList,
];

const userMentionItems = computed(() => props.members.map((member) => ({
  id: member.id,
  label: member.name,
  description: member.email,
  icon: 'i-lucide-user-round',
})));

const taskMentionItems = computed(() => props.tasks.map((task) => ({
  id: task.id,
  label: `${task.key} · ${task.title}`,
  description: task.title,
  icon: 'i-lucide-square-check-big',
})));

const pageMentionItems = computed(() => wikiPageReferenceItems(pages.value, props.locale));
const filteredPageMentionItemsDe = computed(() => filterWikiPageReferenceItems(pageMentionItems.value, pageSearchDe.value, props.locale));
const filteredPageMentionItemsEn = computed(() => filterWikiPageReferenceItems(pageMentionItems.value, pageSearchEn.value, props.locale));

const referenceLabelVersion = computed(() => wikiReferenceRevision(props.members, props.tasks, pages.value));
const todoListRevision = computed(() => JSON.stringify([
  todoLists.value.map((list) => [list.id, list.name, list.updatedAt, list.items.map((item) => [item.id, item.updatedAt])]),
  todoFilters,
]));

const wikiMentionOptions = computed(() => ({
  HTMLAttributes: { class: 'ak-wiki-reference' },
  renderText: ({ node }: MentionRenderProps) => referenceText(node.attrs),
  renderHTML: ({ options, node }: MentionRenderProps): DOMOutputSpec => {
    const reference = resolveWikiReference(node.attrs, props.members, props.tasks, pages.value);
    const task = reference.kind === 'task';
    const page = reference.kind === 'page';
    const label = page ? `${copy.value.pageReference} · ${reference.label}` : `${reference.char}${reference.label}`;
    return ['span', {
      ...options.HTMLAttributes,
      class: `ak-wiki-reference ${task ? 'is-task' : page ? 'is-page' : 'is-user'}${reference.valid ? '' : ' is-invalid'}`,
      ...(task
        ? { 'data-wiki-task-id': reference.id, role: 'link', tabindex: '0', 'aria-label': `${copy.value.openTask}: ${reference.label}` }
        : page && reference.valid
          ? { 'data-wiki-page-id': reference.id, role: 'link', tabindex: '0', 'aria-label': `${copy.value.openPage}: ${reference.label}` }
          : page
            ? { 'aria-disabled': 'true', title: copy.value.missingPage }
            : { 'data-wiki-user-id': reference.id }),
    }, label];
  },
}));

const selectedPage = computed(() => pages.value.find((page) => page.id === selectedPageId.value) ?? null);
const dirty = computed(() => Boolean(selectedPage.value && (
  draftTitle.value.trim() !== selectedPage.value.title
  || draftContent.value !== selectedPage.value.content
)));

const treeRows = computed<WikiTreeRow[]>(() => {
  const byParent = new Map<string | null, WikiPage[]>();
  for (const page of pages.value) {
    const parentId = pages.value.some((candidate) => candidate.id === page.parentId) ? page.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(page);
    byParent.set(parentId, siblings);
  }
  const rows: WikiTreeRow[] = [];
  const append = (parentId: string | null, depth: number, visited: Set<string>) => {
    for (const page of byParent.get(parentId) ?? []) {
      if (visited.has(page.id)) continue;
      const nextVisited = new Set(visited).add(page.id);
      rows.push({ page, depth });
      append(page.id, Math.min(depth + 1, 5), nextVisited);
    }
  };
  append(null, 0, new Set());
  return rows;
});

const visibleTreeRows = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase(props.locale === 'de' ? 'de-CH' : 'en');
  if (!query) return treeRows.value;
  return treeRows.value.filter(({ page }) => `${page.title}\n${page.content}`.toLocaleLowerCase().includes(query));
});

const outline = computed(() => {
  const source = editing.value ? draftContent.value : selectedPage.value?.content ?? '';
  const headings: Array<{ level: number; label: string; index: number }> = [];
  for (const match of source.matchAll(/^(#{1,3})\s+(.+)$/gm)) {
    headings.push({ level: match[1]!.length, label: match[2]!.replace(/[*_`]/g, '').trim(), index: headings.length });
  }
  return headings;
});

const updatedLabel = computed(() => {
  if (!selectedPage.value) return '';
  const date = new Date(selectedPage.value.updatedAt);
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-CH' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
});

const updatedInitials = computed(() => (selectedPage.value?.updatedByName ?? 'AK')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''));

watch(selectedPage, (page) => {
  emit('pageChange', page ? { id: page.id, title: page.title } : null);
}, { immediate: true });

watch(() => props.project.id, () => void loadPages());

onMounted(() => {
  void loadPages();
  window.addEventListener('keydown', handleSaveShortcut);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSaveShortcut);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

async function loadPages() {
  loading.value = true;
  errorMessage.value = null;
  editing.value = false;
  try {
    const [response, todoResponse] = await Promise.all([
      $fetch<{ pages: WikiPage[] }>(`/api/projects/${props.project.id}/wiki/pages`),
      $fetch<{ lists: WikiTodoListRecord[] }>(`/api/projects/${props.project.id}/wiki/todo-lists`),
    ]);
    pages.value = response.pages;
    todoLists.value = todoResponse.lists;
    const routeMatch = import.meta.client
      ? window.location.hash.match(/^#wiki\/([^/]+)\/([^/]+)$/)
      : null;
    const routeProjectId = decodeHashSegment(routeMatch?.[1]);
    const legacyMatch = import.meta.client ? window.location.hash.match(/^#wiki\/([^/]+)$/) : null;
    const sharedId = routeProjectId === props.project.id
      ? decodeHashSegment(routeMatch?.[2])
      : decodeHashSegment(legacyMatch?.[1]);
    selectedPageId.value = pages.value.some((page) => page.id === sharedId)
      ? sharedId
      : pages.value.some((page) => page.id === selectedPageId.value)
        ? selectedPageId.value
        : pages.value[0]?.id ?? null;
    resetDraft();
    syncHash(selectedPageId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    loading.value = false;
  }
}

function resetDraft() {
  draftTitle.value = selectedPage.value?.title ?? '';
  draftContent.value = selectedPage.value?.content ?? '';
}

function startEditing() {
  if (!selectedPage.value) return;
  resetDraft();
  editing.value = true;
  nextTick(() => document.querySelector<HTMLTextAreaElement>('.ak-wiki-title-editor')?.focus());
}

function cancelEditing() {
  resetDraft();
  editing.value = false;
  errorMessage.value = null;
}

async function savePage() {
  if (!selectedPage.value || saving.value) return false;
  const title = draftTitle.value.trim();
  if (!title) {
    errorMessage.value = props.locale === 'de' ? 'Der Seitentitel darf nicht leer sein.' : 'The page title cannot be empty.';
    return false;
  }
  if (!dirty.value) {
    editing.value = false;
    return true;
  }
  saving.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ page: WikiPage }>(`/api/wiki-pages/${selectedPage.value.id}`, {
      method: 'PATCH',
      body: { title, content: draftContent.value, expectedUpdatedAt: selectedPage.value.updatedAt },
    });
    pages.value = pages.value.map((page) => page.id === response.page.id ? response.page : page);
    selectedPageId.value = response.page.id;
    resetDraft();
    editing.value = false;
    return true;
  } catch (error) {
    errorMessage.value = humanError(error);
    return false;
  } finally {
    saving.value = false;
  }
}

async function refreshPages() {
  if (editing.value && dirty.value) return;
  try {
    const [response, todoResponse] = await Promise.all([
      $fetch<{ pages: WikiPage[] }>(`/api/projects/${props.project.id}/wiki/pages`),
      $fetch<{ lists: WikiTodoListRecord[] }>(`/api/projects/${props.project.id}/wiki/todo-lists`),
    ]);
    pages.value = response.pages;
    todoLists.value = todoResponse.lists;
    selectedPageId.value = pages.value.some((page) => page.id === selectedPageId.value)
      ? selectedPageId.value
      : pages.value[0]?.id ?? null;
    resetDraft();
    syncHash(selectedPageId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  }
}

defineExpose({ refreshPages });

async function savePageAction() {
  await savePage();
}

async function selectPage(pageId: string) {
  if (pageId === selectedPageId.value) {
    mobilePagesOpen.value = false;
    syncHash(pageId);
    return;
  }
  if (editing.value && dirty.value && !(await savePage())) return;
  selectedPageId.value = pageId;
  editing.value = false;
  mobilePagesOpen.value = false;
  resetDraft();
  syncHash(pageId);
}

async function createFromTemplate(templateId: WikiTemplateId, parentId: string | null = null) {
  if (saving.value) return;
  const template = templates.value.find((item) => item.id === templateId)!;
  saving.value = true;
  createMenuOpen.value = false;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ page: WikiPage }>(`/api/projects/${props.project.id}/wiki/pages`, {
      method: 'POST',
      body: { title: template.title, content: template.content, parentId },
    });
    pages.value.push(response.page);
    selectedPageId.value = response.page.id;
    syncHash(response.page.id);
    resetDraft();
    editing.value = true;
    await nextTick();
    document.querySelector<HTMLTextAreaElement>('.ak-wiki-title-editor')?.select();
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    saving.value = false;
  }
}

async function deleteSelectedPage() {
  if (!selectedPage.value || saving.value || !window.confirm(copy.value.deleteConfirm)) return;
  saving.value = true;
  errorMessage.value = null;
  const deleted = selectedPage.value;
  try {
    await $fetch(`/api/wiki-pages/${deleted.id}`, { method: 'DELETE' });
    pages.value = pages.value.filter((page) => page.id !== deleted.id);
    selectedPageId.value = pages.value.find((page) => page.id === deleted.parentId)?.id ?? pages.value[0]?.id ?? null;
    editing.value = false;
    resetDraft();
    syncHash(selectedPageId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    saving.value = false;
  }
}

async function copyPageLink() {
  if (!selectedPage.value) return;
  syncHash(selectedPage.value.id);
  try {
    await navigator.clipboard.writeText(window.location.href);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    errorMessage.value = props.locale === 'de' ? 'Der Link konnte nicht kopiert werden.' : 'The link could not be copied.';
  }
}

function syncHash(pageId: string | null) {
  if (!import.meta.client) return;
  const base = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(
    window.history.state,
    '',
    pageId
      ? `${base}#wiki/${encodeURIComponent(props.project.id)}/${encodeURIComponent(pageId)}`
      : `${base}#wiki/${encodeURIComponent(props.project.id)}`,
  );
}

function decodeHashSegment(value: string | undefined) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function scrollToHeading(index: number) {
  const headings = document.querySelectorAll<HTMLElement>('.ak-wiki-rendered h1, .ak-wiki-rendered h2, .ak-wiki-rendered h3');
  headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleSaveShortcut(event: KeyboardEvent) {
  if (!editing.value || !(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== 's') return;
  event.preventDefault();
  void savePage();
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
}

function referenceText(attrs: WikiReferenceAttributes) {
  const reference = resolveWikiReference(attrs, props.members, props.tasks, pages.value);
  return reference.kind === 'page'
    ? `${copy.value.pageReference} · ${reference.label}`
    : `${reference.char}${reference.label}`;
}

async function createWikiTodoList(payload: { name: string; editor: { chain: () => any } }) {
  errorMessage.value = null;
  try {
    const response = await $fetch<{ list: WikiTodoListRecord }>(`/api/projects/${props.project.id}/wiki/todo-lists`, {
      method: 'POST',
      body: { name: payload.name },
    });
    todoLists.value.push(response.list);
    payload.editor.chain().focus().insertContent([
      { type: 'wikiTodoList', attrs: { id: response.list.id, label: response.list.name } },
      { type: 'paragraph' },
    ]).run();
  } catch (error) {
    errorMessage.value = humanError(error);
  }
}

async function handleWikiTodoClick(event: Event) {
  const element = event.target instanceof Element ? event.target : null;
  const filterButton = element?.closest<HTMLElement>('[data-wiki-todo-filter]');
  const filterListId = filterButton?.dataset.wikiTodoListId;
  const filter = filterButton?.dataset.wikiTodoFilter as WikiTodoFilter | undefined;
  if (filterListId && filter) {
    event.preventDefault();
    todoFilters[filterListId] = filter;
    return;
  }

  const checkbox = element?.closest<HTMLInputElement>('input[data-wiki-todo-item-id]');
  const itemId = checkbox?.dataset.wikiTodoItemId;
  if (!checkbox || !itemId) return;
  const current = todoLists.value.flatMap((list) => list.items).find((item) => item.id === itemId);
  if (!current) return;
  try {
    const response = await $fetch<{ item: WikiTodoListRecord['items'][number] }>(`/api/wiki-todo-items/${itemId}`, {
      method: 'PATCH',
      body: { completed: checkbox.checked, expectedUpdatedAt: current.updatedAt },
    });
    todoLists.value = todoLists.value.map((list) => list.id !== current.listId ? list : {
      ...list,
      updatedAt: response.item.updatedAt,
      items: list.items.map((item) => item.id === itemId ? response.item : item),
    });
  } catch (error) {
    checkbox.checked = current.completed;
    errorMessage.value = humanError(error);
    await refreshTodoLists();
  }
}

async function handleWikiTodoSubmit(event: Event) {
  const form = event.target instanceof HTMLFormElement && event.target.matches('[data-wiki-todo-add-form]')
    ? event.target
    : null;
  const listId = form?.dataset.wikiTodoAddForm;
  const input = form?.elements.namedItem('text');
  if (!form || !listId || !(input instanceof HTMLInputElement) || !input.value.trim()) return;
  event.preventDefault();
  const text = input.value.trim();
  input.disabled = true;
  try {
    const response = await $fetch<{ item: WikiTodoListRecord['items'][number] }>(`/api/wiki-todo-lists/${listId}/items`, {
      method: 'POST',
      body: { text },
    });
    todoLists.value = todoLists.value.map((list) => list.id !== listId ? list : {
      ...list,
      updatedAt: response.item.updatedAt,
      items: [...list.items, response.item],
    });
  } catch (error) {
    errorMessage.value = humanError(error);
    input.disabled = false;
    input.value = text;
  }
}

async function refreshTodoLists() {
  try {
    const response = await $fetch<{ lists: WikiTodoListRecord[] }>(`/api/projects/${props.project.id}/wiki/todo-lists`);
    todoLists.value = response.lists;
  } catch (error) {
    errorMessage.value = humanError(error);
  }
}

function handleWikiContentClick(event: Event) {
  void handleWikiTodoClick(event);
  activateWikiReference(event);
}

function activateWikiReference(event: Event) {
  const element = event.target instanceof Element ? event.target : null;
  const taskId = element?.closest<HTMLElement>('[data-wiki-task-id]')?.dataset.wikiTaskId;
  if (taskId) {
    event.preventDefault();
    emit('openTask', taskId);
    return;
  }
  const pageId = element?.closest<HTMLElement>('[data-wiki-page-id]')?.dataset.wikiPageId;
  if (!pageId || !pages.value.some((page) => page.id === pageId)) return;
  event.preventDefault();
  void selectPage(pageId);
}

function canDragPage(pageId: string) {
  return !searchQuery.value && !saving.value && !(pageId === selectedPageId.value && editing.value && dirty.value);
}

function startPageDrag(event: DragEvent, pageId: string) {
  if (!canDragPage(pageId)) {
    event.preventDefault();
    return;
  }
  draggedPageId.value = pageId;
  dropTarget.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', pageId);
  }
}

function updatePageDrop(event: DragEvent, pageId: string) {
  const draggedId = draggedPageId.value;
  if (!draggedId || draggedId === pageId || isWikiDescendant(pageId, draggedId)) {
    dropTarget.value = null;
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const element = event.currentTarget as HTMLElement;
  const bounds = element.getBoundingClientRect();
  const ratio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
  const placement: WikiDropPlacement = ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
  dropTarget.value = { pageId, placement };
}

function updateRootDrop(event: DragEvent) {
  if (!draggedPageId.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTarget.value = { pageId: null, placement: 'root' };
}

async function finishPageDrop(event: DragEvent, pageId: string | null) {
  event.preventDefault();
  const draggedId = draggedPageId.value;
  const target = dropTarget.value;
  if (!draggedId || !target || target.pageId !== pageId) {
    clearPageDrag();
    return;
  }
  const dragged = pages.value.find((page) => page.id === draggedId);
  if (!dragged) {
    clearPageDrag();
    return;
  }

  let parentId: string | null;
  let position: number;
  if (target.placement === 'root') {
    parentId = null;
    position = siblingPages(null, draggedId).length;
  } else {
    const targetPage = pages.value.find((page) => page.id === target.pageId);
    if (!targetPage) {
      clearPageDrag();
      return;
    }
    if (target.placement === 'inside') {
      parentId = targetPage.id;
      position = siblingPages(parentId, draggedId).length;
    } else {
      parentId = targetPage.parentId ?? null;
      const siblings = siblingPages(parentId, draggedId);
      const targetIndex = siblings.findIndex((page) => page.id === targetPage.id);
      position = Math.max(0, targetIndex + (target.placement === 'after' ? 1 : 0));
    }
  }

  clearPageDrag();
  saving.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ page: WikiPage; pages: WikiPage[] }>(`/api/wiki-pages/${draggedId}/move`, {
      method: 'POST',
      body: { parentId, position, expectedUpdatedAt: dragged.updatedAt },
    });
    pages.value = response.pages;
    if (!editing.value) resetDraft();
  } catch (error) {
    errorMessage.value = humanError(error);
    await refreshPages();
  } finally {
    saving.value = false;
  }
}

function siblingPages(parentId: string | null, excludeId: string) {
  return pages.value
    .filter((page) => page.id !== excludeId && (page.parentId ?? null) === parentId)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
}

function isWikiDescendant(candidateId: string, ancestorId: string) {
  let cursor = pages.value.find((page) => page.id === candidateId)?.parentId ?? null;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    if (cursor === ancestorId) return true;
    visited.add(cursor);
    cursor = pages.value.find((page) => page.id === cursor)?.parentId ?? null;
  }
  return false;
}

function clearPageDrag() {
  draggedPageId.value = null;
  dropTarget.value = null;
}

function dropLabel(placement: WikiDropPlacement | 'root') {
  if (placement === 'before') return copy.value.dropBefore;
  if (placement === 'inside') return copy.value.dropInside;
  if (placement === 'after') return copy.value.dropAfter;
  return copy.value.dropRoot;
}

function humanError(error: unknown) {
  const details = error as { data?: { statusMessage?: string }; statusMessage?: string; message?: string };
  const code = details.data?.statusMessage ?? details.statusMessage ?? details.message ?? '';
  if (code.includes('wiki_page_not_empty')) return copy.value.childDeleteError;
  if (code.includes('wiki_page_stale')) return copy.value.stalePage;
  if (code.includes('wiki_todo_list_name_exists')) return copy.value.todoDuplicate;
  if (code.includes('wiki_todo')) return copy.value.todoError;
  return copy.value.genericError;
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="ak-wiki-toolbar flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <UButton
        class="shrink-0 md:hidden"
        data-mobile-sidebar-trigger
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-menu"
        :tabindex="props.isMobileViewport && !props.sidebarCollapsed ? -1 : undefined"
        :aria-label="copy.pages"
        @click="emit('openSidebar')"
      />

      <div class="hidden min-w-0 shrink-0 items-center gap-2 sm:flex sm:max-w-40 xl:max-w-52" :title="props.project.description ?? props.project.name">
        <span class="hidden shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold tracking-wide text-zinc-600 xl:inline-flex dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{{ props.project.key }}</span>
        <h1 class="ak-display truncate text-base font-semibold tracking-tight text-zinc-950 dark:text-white">{{ props.project.name }}</h1>
      </div>

      <div class="ak-surface-switch" role="tablist" :aria-label="props.project.name">
        <button type="button" role="tab" class="ak-surface-switch-button" :aria-label="copy.board" :aria-selected="false" @click="emit('showBoard')">
          <UIcon name="i-lucide-columns-3" class="size-3.5" />
          <span class="hidden sm:inline">{{ copy.board }}</span>
        </button>
        <button type="button" role="tab" class="ak-surface-switch-button is-active" :aria-label="copy.wiki" :aria-selected="true">
          <UIcon name="i-lucide-notebook-tabs" class="size-3.5" />
          <span class="hidden sm:inline">{{ copy.wiki }}</span>
        </button>
      </div>

      <UInput v-model="searchQuery" class="ml-1 hidden min-w-36 flex-1 md:block lg:max-w-xs" size="sm" icon="i-lucide-search" :placeholder="copy.search" :aria-label="copy.search" />

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <UPopover v-model:open="createMenuOpen" :content="{ align: 'end', side: 'bottom' }">
          <UButton color="primary" variant="soft" size="sm" icon="i-lucide-file-plus-2" class="!bg-teal-50 !text-teal-800 dark:!bg-teal-950/60 dark:!text-teal-200" :loading="saving" :aria-label="copy.newPage" aria-controls="wiki-new-page-menu">
            <span class="hidden lg:inline">{{ copy.newPage }}</span>
          </UButton>
          <template #content>
            <div id="wiki-new-page-menu" class="w-80 p-2">
              <p class="px-3 pb-2 pt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{{ copy.chooseTemplate }}</p>
              <button v-for="template in templates" :key="template.id" type="button" class="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-600 dark:hover:bg-zinc-800" @click="createFromTemplate(template.id)">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"><UIcon :name="template.icon" class="size-4" /></span>
                <span><span class="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ template.label }}</span><span class="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ template.hint }}</span></span>
              </button>
            </div>
          </template>
        </UPopover>
        <UButton v-if="selectedPage && !editing" class="hidden lg:inline-flex" color="neutral" variant="ghost" size="sm" :icon="copied ? 'i-lucide-check' : 'i-lucide-share-2'" @click="copyPageLink">{{ copied ? copy.copied : copy.share }}</UButton>
        <UButton v-if="selectedPage && !editing" color="neutral" variant="soft" size="sm" icon="i-lucide-pencil-line" :aria-label="copy.edit" @click="startEditing"><span class="hidden sm:inline">{{ copy.edit }}</span></UButton>
        <template v-if="selectedPage && editing">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :disabled="saving" :aria-label="copy.cancel" @click="cancelEditing"><span class="hidden lg:inline">{{ copy.cancel }}</span></UButton>
          <UButton color="primary" variant="solid" size="sm" icon="i-lucide-check" :loading="saving" :disabled="!draftTitle.trim()" :aria-label="copy.save" @click="savePageAction"><span class="hidden sm:inline">{{ copy.save }}</span></UButton>
        </template>
        <UPopover v-if="selectedPage && !editing" :content="{ align: 'end', side: 'bottom' }">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" :aria-label="copy.delete" aria-controls="wiki-page-actions-menu" />
          <template #content>
            <div id="wiki-page-actions-menu" class="grid w-56 gap-1 p-2">
              <UButton color="neutral" variant="ghost" icon="i-lucide-copy" class="justify-start" @click="copyPageLink">{{ copied ? copy.copied : copy.share }}</UButton>
              <UButton color="error" variant="ghost" icon="i-lucide-trash-2" class="justify-start" @click="deleteSelectedPage">{{ copy.delete }}</UButton>
            </div>
          </template>
        </UPopover>
      </div>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" :actions="loading ? [{ label: copy.retry, onClick: loadPages }] : undefined" />

    <div v-if="loading" class="grid min-h-0 flex-1 place-items-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div class="grid justify-items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-teal-600" /><span>{{ copy.loading }}</span></div>
    </div>

    <div v-else-if="!pages.length" class="grid min-h-0 flex-1 place-items-center overflow-y-auto rounded-xl border border-zinc-200 bg-white px-6 py-12 dark:border-zinc-800 dark:bg-zinc-950">
      <div class="w-full max-w-3xl text-center">
        <span class="mx-auto grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-900"><UIcon name="i-lucide-notebook-tabs" class="size-6" /></span>
        <h2 class="ak-display mt-5 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">{{ copy.emptyTitle }}</h2>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">{{ copy.emptyBody }}</p>
        <p class="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{{ copy.chooseTemplate }}</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <button v-for="template in templates" :key="template.id" type="button" class="group rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/60 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-800 dark:hover:bg-teal-950/30" @click="createFromTemplate(template.id)">
            <span class="grid size-9 place-items-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-teal-300 dark:ring-zinc-700"><UIcon :name="template.icon" class="size-4" /></span>
            <span class="mt-4 block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ template.label }}</span>
            <span class="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ template.hint }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="ak-wiki-frame min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <aside class="ak-wiki-pages hidden w-[250px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/55 md:flex" :aria-label="copy.pageTree">
        <div class="border-b border-zinc-200 p-3 dark:border-zinc-800"><UInput v-model="searchQuery" class="w-full" size="sm" icon="i-lucide-search" :placeholder="copy.search" :aria-label="copy.search" /></div>
        <nav class="min-h-0 flex-1 overflow-y-auto px-2 py-3" :aria-label="copy.pages">
          <div
            class="ak-wiki-root-drop mb-2 flex min-h-7 items-center rounded-md px-2"
            :class="dropTarget?.placement === 'root' ? 'is-drop-target' : ''"
            @dragover="updateRootDrop"
            @drop="finishPageDrop($event, null)"
          >
            <p class="text-[11px] font-semibold uppercase tracking-[0.11em] text-zinc-600 dark:text-zinc-400">{{ copy.rootPages }}</p>
            <span v-if="dropTarget?.placement === 'root'" class="ml-auto text-[10px] font-semibold normal-case tracking-normal text-teal-700 dark:text-teal-300">{{ dropLabel('root') }}</span>
          </div>
          <div
            v-for="row in visibleTreeRows"
            :key="row.page.id"
            class="ak-wiki-tree-row group relative flex items-center gap-0.5 rounded-lg"
            :class="[
              draggedPageId === row.page.id ? 'is-dragging' : '',
              dropTarget?.pageId === row.page.id ? `is-drop-${dropTarget.placement}` : '',
            ]"
            :draggable="canDragPage(row.page.id)"
            @dragstart="startPageDrag($event, row.page.id)"
            @dragover="updatePageDrop($event, row.page.id)"
            @drop="finishPageDrop($event, row.page.id)"
            @dragend="clearPageDrag"
          >
            <span class="ak-wiki-drag-handle grid size-5 shrink-0 place-items-center text-zinc-400 opacity-0 transition group-hover:opacity-100" :title="copy.dragPage" aria-hidden="true"><UIcon name="i-lucide-grip-vertical" class="size-3.5" /></span>
            <button type="button" class="ak-wiki-page-link min-w-0 flex-1" :class="selectedPageId === row.page.id ? 'is-active' : ''" :style="{ paddingLeft: `${0.25 + row.depth * 0.875}rem` }" @click="selectPage(row.page.id)">
              <UIcon :name="row.depth ? 'i-lucide-file-text' : 'i-lucide-book-open-text'" class="size-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate text-left">{{ row.page.title }}</span>
            </button>
            <button type="button" class="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" :aria-label="`${copy.addChild}: ${row.page.title}`" @click="createFromTemplate('blank', row.page.id)"><UIcon name="i-lucide-plus" class="size-3.5" /></button>
            <span v-if="dropTarget?.pageId === row.page.id" class="ak-wiki-drop-label pointer-events-none absolute right-8 z-10 rounded bg-teal-700 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm">{{ dropLabel(dropTarget.placement) }}</span>
          </div>
          <p v-if="searchQuery && !visibleTreeRows.length" class="px-3 py-8 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ copy.noResults }}</p>
        </nav>
      </aside>

      <div class="ak-wiki-document min-w-0 flex-1 overflow-y-auto bg-white dark:bg-zinc-950">
        <div class="ak-wiki-mobile-context sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
          <UPopover v-model:open="mobilePagesOpen" :content="{ align: 'start', side: 'bottom' }">
            <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-list-tree" aria-controls="wiki-mobile-pages-menu"><span class="max-w-44 truncate">{{ selectedPage?.title ?? copy.pages }}</span></UButton>
            <template #content>
              <div id="wiki-mobile-pages-menu" class="max-h-[60dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-2">
                <UInput v-model="searchQuery" class="mb-2 w-full" size="sm" icon="i-lucide-search" :placeholder="copy.search" />
                <button v-for="row in visibleTreeRows" :key="row.page.id" type="button" class="ak-wiki-page-link" :class="selectedPageId === row.page.id ? 'is-active' : ''" :style="{ paddingLeft: `${0.5 + row.depth * 0.875}rem` }" @click="selectPage(row.page.id)"><UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" /><span class="truncate">{{ row.page.title }}</span></button>
              </div>
            </template>
          </UPopover>
          <span v-if="editing" class="ml-auto inline-flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300"><UIcon name="i-lucide-cloud" class="size-3.5" />{{ saving ? copy.saving : dirty ? copy.save : copy.saved }}</span>
        </div>

        <article v-if="selectedPage" class="ak-wiki-document-inner mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          <header class="ak-wiki-document-header border-b border-zinc-200 pb-7 dark:border-zinc-800">
            <div class="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400"><span class="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-900"><UIcon name="i-lucide-file-text" class="size-4" /></span><span>{{ props.project.name }}</span><UIcon name="i-lucide-chevron-right" class="size-3.5" /><span class="truncate">{{ selectedPage.title }}</span></div>
            <textarea v-if="editing" v-model="draftTitle" class="ak-wiki-title-editor mt-5" rows="2" maxlength="200" :aria-label="copy.titleLabel" />
            <h2 v-else class="ak-display mt-5 text-3xl font-semibold leading-tight tracking-tight text-zinc-950 text-balance sm:text-4xl dark:text-white">{{ selectedPage.title }}</h2>
            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400"><span class="grid size-6 place-items-center rounded-md bg-zinc-900 text-[9px] font-bold text-white dark:bg-white dark:text-zinc-950">{{ updatedInitials }}</span><span>{{ copy.editedBy }} {{ selectedPage.updatedByName ?? '—' }}</span><span aria-hidden="true">·</span><time :datetime="selectedPage.updatedAt">{{ updatedLabel }}</time><span v-if="editing" class="ml-auto hidden items-center gap-1.5 text-teal-700 sm:inline-flex dark:text-teal-300"><UIcon name="i-lucide-cloud" class="size-3.5" />{{ saving ? copy.saving : dirty ? copy.save : copy.saved }}</span></div>
          </header>

          <div v-if="editing" class="ak-wiki-editor mt-6 rounded-xl border border-zinc-200 bg-white shadow-sm focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/15 dark:border-zinc-800 dark:bg-zinc-950" @click="handleWikiContentClick" @submit.prevent="handleWikiTodoSubmit">
            <UEditor :key="`wiki-edit:${selectedPage.id}:${props.locale}:${referenceLabelVersion}:${todoListRevision}`" v-slot="{ editor }" v-model="draftContent" content-type="markdown" :extensions="wikiEditorExtensions" :handlers="wikiEditorHandlers" :image="false" :mention="wikiMentionOptions" :placeholder="copy.placeholder" :ui="{ content: 'min-h-[26rem]', base: 'min-h-[26rem] px-5 py-5 sm:px-7' }" :aria-label="copy.contentLabel">
              <div class="ak-wiki-editor-toolbar sticky top-12 z-[5] flex min-w-0 items-center border-b border-zinc-200 bg-zinc-50/95 px-2 py-1.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:top-0">
                <div class="min-w-0 flex-1 overflow-x-auto">
                  <UEditorToolbar layout="fixed" :editor="editor" :items="editorToolbarItems" class="w-max" />
                </div>
                <WikiEditorTools :editor="editor" :locale="props.locale" :todo-lists="todoLists" @create-todo-list="createWikiTodoList" />
              </div>
              <UEditorMentionMenu :editor="editor" :items="userMentionItems" :filter-fields="['label', 'description']" char="@" plugin-key="wiki-user-mentions" :limit="8" />
              <UEditorMentionMenu :editor="editor" :items="taskMentionItems" :filter-fields="['label', 'description']" char="#" plugin-key="wiki-task-links" :limit="8" />
              <UEditorMentionMenu v-model:search-term="pageSearchDe" :editor="editor" :items="filteredPageMentionItemsDe" char="seite:" plugin-key="wiki-page-links-de" :limit="8" ignore-filter />
              <UEditorMentionMenu v-model:search-term="pageSearchEn" :editor="editor" :items="filteredPageMentionItemsEn" char="page:" plugin-key="wiki-page-links-en" :limit="8" ignore-filter />
            </UEditor>
            <p class="border-t border-zinc-100 px-5 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:px-7">{{ copy.referencesHint }}</p>
          </div>
          <div v-else-if="selectedPage.content" @click="handleWikiContentClick" @submit.prevent="handleWikiTodoSubmit" @keydown.enter="activateWikiReference" @keydown.space.prevent="activateWikiReference">
            <UEditor :key="`wiki-read:${selectedPage.id}:${props.locale}:${referenceLabelVersion}:${todoListRevision}`" :model-value="selectedPage.content" content-type="markdown" :extensions="wikiEditorExtensions" :editable="false" :image="false" :mention="wikiMentionOptions" class="ak-wiki-rendered ak-wiki-prose pt-8 text-zinc-800 dark:text-zinc-200" :ui="{ root: 'px-0', content: 'px-0 py-0', base: 'px-0 py-0 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300' }" />
          </div>
          <button v-else type="button" class="mt-8 flex min-h-40 w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 transition hover:border-teal-400 hover:bg-teal-50/50 hover:text-teal-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-teal-700 dark:hover:bg-teal-950/20 dark:hover:text-teal-300" @click="startEditing"><span class="inline-flex items-center gap-2"><UIcon name="i-lucide-pencil-line" class="size-4" />{{ copy.placeholder }}</span></button>
        </article>
      </div>

      <aside class="ak-wiki-outline hidden w-[210px] shrink-0 flex-col border-l border-zinc-200 bg-white px-4 py-5 dark:border-zinc-800 dark:bg-zinc-950 xl:flex" :aria-label="copy.outline">
        <p class="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{{ copy.outline }}</p>
        <nav v-if="outline.length" class="mt-3 grid gap-0.5 border-b border-zinc-200 pb-5 dark:border-zinc-800"><button v-for="heading in outline" :key="`${heading.index}-${heading.label}`" type="button" class="ak-wiki-outline-link" :style="{ paddingLeft: `${0.5 + (heading.level - 1) * 0.625}rem` }" @click="scrollToHeading(heading.index)">{{ heading.label }}</button></nav>
        <p v-else class="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ copy.noOutline }}</p>
        <div class="mt-auto rounded-lg bg-zinc-50 px-3 py-2.5 text-[11px] leading-5 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-400 dark:ring-zinc-800"><span class="font-semibold text-zinc-700 dark:text-zinc-200">{{ pages.length }}</span> {{ copy.pages.toLocaleLowerCase() }}</div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.ak-wiki-tree-row {
  isolation: isolate;
}

.ak-wiki-tree-row.is-dragging {
  opacity: 0.42;
}

.ak-wiki-tree-row.is-drop-before::before,
.ak-wiki-tree-row.is-drop-after::after {
  position: absolute;
  z-index: 20;
  right: 0.25rem;
  left: 0.25rem;
  height: 2px;
  border-radius: 999px;
  background: rgb(13 148 136);
  content: '';
  box-shadow: 0 0 0 2px rgb(204 251 241 / 0.9);
}

.ak-wiki-tree-row.is-drop-before::before {
  top: -1px;
}

.ak-wiki-tree-row.is-drop-after::after {
  bottom: -1px;
}

.ak-wiki-tree-row.is-drop-inside {
  background: rgb(204 251 241 / 0.72);
  box-shadow: inset 0 0 0 1px rgb(20 184 166);
}

.ak-wiki-root-drop.is-drop-target {
  background: rgb(204 251 241 / 0.78);
  box-shadow: inset 0 0 0 1px rgb(20 184 166);
}

.ak-wiki-drop-label {
  top: 50%;
  transform: translateY(-50%);
}

:global(.dark) .ak-wiki-tree-row.is-drop-inside,
:global(.dark) .ak-wiki-root-drop.is-drop-target {
  background: rgb(19 78 74 / 0.55);
}

.ak-wiki-rendered :deep(.tiptap > :not(.tableWrapper)) {
  max-width: 72ch;
}

.ak-wiki-rendered,
.ak-wiki-rendered :deep([data-slot='root']),
.ak-wiki-rendered :deep([data-slot='content']),
.ak-wiki-rendered :deep([data-slot='base']),
.ak-wiki-rendered :deep(.ProseMirror),
.ak-wiki-rendered :deep(.tiptap) {
  margin-inline: 0 !important;
  padding-inline: 0 !important;
}

.ak-wiki-rendered {
  width: 100%;
  max-width: none;
}

.ak-wiki-rendered :deep(h1),
.ak-wiki-rendered :deep(h2),
.ak-wiki-rendered :deep(h3) {
  scroll-margin-top: 5rem;
}

.ak-wiki-rendered :deep(a) {
  color: rgb(13 148 136);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.ak-wiki-editor :deep(.ak-wiki-todo),
.ak-wiki-rendered :deep(.ak-wiki-todo) {
  width: 100%;
  margin-block: 1.5rem;
  overflow: hidden;
  border: 1px solid rgb(212 212 216);
  border-radius: 0.75rem;
  background: rgb(250 250 250 / 0.7);
}

.ak-wiki-editor :deep(.ak-wiki-todo > header),
.ak-wiki-rendered :deep(.ak-wiki-todo > header) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid rgb(228 228 231);
}

.ak-wiki-editor :deep(.ak-wiki-todo > header > div:first-child),
.ak-wiki-rendered :deep(.ak-wiki-todo > header > div:first-child) {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo > header strong),
.ak-wiki-rendered :deep(.ak-wiki-todo > header strong) {
  color: rgb(24 24 27);
  font-size: 0.875rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo > header span),
.ak-wiki-rendered :deep(.ak-wiki-todo > header span),
.ak-wiki-editor :deep(.ak-wiki-todo time),
.ak-wiki-rendered :deep(.ak-wiki-todo time) {
  color: rgb(113 113 122);
  font-size: 0.6875rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo-filters),
.ak-wiki-rendered :deep(.ak-wiki-todo-filters) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo button),
.ak-wiki-rendered :deep(.ak-wiki-todo button) {
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  color: rgb(82 82 91);
  font-size: 0.6875rem;
  font-weight: 650;
  line-height: 1rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo button:hover),
.ak-wiki-rendered :deep(.ak-wiki-todo button:hover),
.ak-wiki-editor :deep(.ak-wiki-todo button.is-active),
.ak-wiki-rendered :deep(.ak-wiki-todo button.is-active) {
  background: rgb(204 251 241);
  color: rgb(15 118 110);
}

.ak-wiki-editor :deep(.ak-wiki-todo > ul),
.ak-wiki-rendered :deep(.ak-wiki-todo > ul) {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ak-wiki-editor :deep(.ak-wiki-todo > ul > li),
.ak-wiki-rendered :deep(.ak-wiki-todo > ul > li) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.625rem;
  margin: 0;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid rgb(244 244 245);
}

.ak-wiki-editor :deep(.ak-wiki-todo > ul > li::before),
.ak-wiki-rendered :deep(.ak-wiki-todo > ul > li::before) {
  display: none;
}

.ak-wiki-editor :deep(.ak-wiki-todo > ul > li.is-completed > span),
.ak-wiki-rendered :deep(.ak-wiki-todo > ul > li.is-completed > span) {
  color: rgb(113 113 122);
  text-decoration: line-through;
}

.ak-wiki-editor :deep(.ak-wiki-todo > ul > li.is-empty),
.ak-wiki-rendered :deep(.ak-wiki-todo > ul > li.is-empty) {
  display: block;
  color: rgb(113 113 122);
  font-size: 0.8125rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo input[type='checkbox']),
.ak-wiki-rendered :deep(.ak-wiki-todo input[type='checkbox']) {
  width: 1rem;
  height: 1rem;
  margin-top: 0.35rem;
  accent-color: rgb(13 148 136);
}

.ak-wiki-editor :deep(.ak-wiki-todo > form),
.ak-wiki-rendered :deep(.ak-wiki-todo > form) {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo > form input),
.ak-wiki-rendered :deep(.ak-wiki-todo > form input) {
  min-width: 0;
  flex: 1;
  border: 1px solid rgb(212 212 216);
  border-radius: 0.5rem;
  background: white;
  padding: 0.375rem 0.625rem;
  color: rgb(39 39 42);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo > form button),
.ak-wiki-rendered :deep(.ak-wiki-todo > form button) {
  background: rgb(13 148 136);
  color: white;
  padding-inline: 0.75rem;
}

.ak-wiki-editor :deep(.ak-wiki-todo.is-invalid),
.ak-wiki-rendered :deep(.ak-wiki-todo.is-invalid) {
  border-style: dashed;
  padding: 0.875rem;
  color: rgb(113 113 122);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo) {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27 / 0.6);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo > header),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo > header),
:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo > ul > li),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo > ul > li) {
  border-color: rgb(63 63 70);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo > header strong),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo > header strong) {
  color: rgb(244 244 245);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo button:hover),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo button:hover),
:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo button.is-active),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo button.is-active) {
  background: rgb(19 78 74);
  color: rgb(153 246 228);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-todo > form input),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-todo > form input) {
  border-color: rgb(82 82 91);
  background: rgb(24 24 27);
  color: rgb(244 244 245);
}

.ak-wiki-editor :deep(.tableWrapper),
.ak-wiki-rendered :deep(.tableWrapper) {
  width: 100%;
  max-width: 100%;
  margin-block: 1.5rem;
  overflow-x: auto;
  border-radius: 0.75rem;
  border: 1px solid rgb(228 228 231);
}

.ak-wiki-editor-toolbar {
  border-top-left-radius: calc(0.75rem - 1px);
  border-top-right-radius: calc(0.75rem - 1px);
}

:global(.dark) .ak-wiki-editor :deep(.tableWrapper),
:global(.dark) .ak-wiki-rendered :deep(.tableWrapper) {
  border-color: rgb(63 63 70);
}

.ak-wiki-editor :deep(table),
.ak-wiki-rendered :deep(table) {
  width: 100%;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.ak-wiki-editor :deep(th),
.ak-wiki-editor :deep(td),
.ak-wiki-rendered :deep(th),
.ak-wiki-rendered :deep(td) {
  position: relative;
  min-width: 8rem;
  border-right: 1px solid rgb(228 228 231);
  border-bottom: 1px solid rgb(228 228 231);
  padding: 0.65rem 0.75rem;
  text-align: left;
  vertical-align: top;
  overflow-wrap: normal;
  word-break: normal;
}

.ak-wiki-editor :deep(td ul:not([data-type='taskList'])),
.ak-wiki-editor :deep(td ol),
.ak-wiki-rendered :deep(td ul:not([data-type='taskList'])),
.ak-wiki-rendered :deep(td ol) {
  margin-block: 0.2rem;
  padding-left: 1.25rem;
}

.ak-wiki-editor :deep(td li > ul),
.ak-wiki-editor :deep(td li > ol),
.ak-wiki-rendered :deep(td li > ul),
.ak-wiki-rendered :deep(td li > ol) {
  margin-block: 0.1rem 0;
}

.ak-wiki-editor :deep(th:last-child),
.ak-wiki-editor :deep(td:last-child),
.ak-wiki-rendered :deep(th:last-child),
.ak-wiki-rendered :deep(td:last-child) {
  border-right: 0;
}

.ak-wiki-editor :deep(tr:last-child td),
.ak-wiki-rendered :deep(tr:last-child td) {
  border-bottom: 0;
}

.ak-wiki-editor :deep(th),
.ak-wiki-rendered :deep(th) {
  background: rgb(244 244 245 / 0.85);
  color: rgb(39 39 42);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.025em;
}

:global(.dark) .ak-wiki-editor :deep(th),
:global(.dark) .ak-wiki-rendered :deep(th) {
  background: rgb(39 39 42 / 0.8);
  color: rgb(244 244 245);
}

:global(.dark) .ak-wiki-editor :deep(th),
:global(.dark) .ak-wiki-editor :deep(td),
:global(.dark) .ak-wiki-rendered :deep(th),
:global(.dark) .ak-wiki-rendered :deep(td) {
  border-color: rgb(63 63 70);
}

.ak-wiki-editor :deep(.selectedCell::after) {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  content: '';
  background: rgb(13 148 136 / 0.1);
  box-shadow: inset 0 0 0 2px rgb(13 148 136);
}

.ak-wiki-editor :deep(.ak-wiki-reference),
.ak-wiki-rendered :deep(.ak-wiki-reference) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border-radius: 0.375rem;
  padding-inline: 0.3rem;
  font-weight: 650;
  line-height: 1.45;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.ak-wiki-editor :deep(.ak-wiki-reference.is-user),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-user) {
  background: rgb(236 253 245);
  color: rgb(4 120 87);
}

.ak-wiki-editor :deep(.ak-wiki-reference.is-task),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-task) {
  background: rgb(239 246 255);
  color: rgb(29 78 216);
}

.ak-wiki-editor :deep(.ak-wiki-reference.is-page),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-page) {
  background: rgb(240 253 250);
  color: rgb(15 118 110);
}

.ak-wiki-rendered :deep(.ak-wiki-reference.is-task),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-page:not(.is-invalid)) {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgb(59 130 246 / 0.35);
  text-underline-offset: 0.2em;
}

.ak-wiki-rendered :deep(.ak-wiki-reference.is-task:hover),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-task:focus-visible),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-page:not(.is-invalid):hover),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-page:not(.is-invalid):focus-visible) {
  background: rgb(219 234 254);
  outline: 2px solid transparent;
}

.ak-wiki-rendered :deep(.ak-wiki-reference.is-page:not(.is-invalid):hover),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-page:not(.is-invalid):focus-visible) {
  background: rgb(204 251 241);
}

.ak-wiki-editor :deep(.ak-wiki-reference.is-invalid),
.ak-wiki-rendered :deep(.ak-wiki-reference.is-invalid) {
  border: 1px dashed rgb(161 161 170);
  background: rgb(244 244 245);
  color: rgb(113 113 122);
  text-decoration: line-through;
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-reference.is-user),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-reference.is-user) {
  background: rgb(6 78 59 / 0.5);
  color: rgb(110 231 183);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-reference.is-task),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-reference.is-task) {
  background: rgb(30 58 138 / 0.5);
  color: rgb(147 197 253);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-reference.is-page),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-reference.is-page) {
  background: rgb(19 78 74 / 0.55);
  color: rgb(94 234 212);
}

:global(.dark) .ak-wiki-editor :deep(.ak-wiki-reference.is-invalid),
:global(.dark) .ak-wiki-rendered :deep(.ak-wiki-reference.is-invalid) {
  border-color: rgb(82 82 91);
  background: rgb(39 39 42);
  color: rgb(161 161 170);
}

.ak-wiki-editor :deep(.tiptap),
.ak-wiki-rendered :deep(.tiptap) {
  font-size: 0.9375rem;
  line-height: 1.75rem;
}

.ak-wiki-editor :deep(ul[data-type='taskList']),
.ak-wiki-rendered :deep(ul[data-type='taskList']) {
  display: grid;
  gap: 0.25rem;
  padding-left: 0;
  list-style: none;
}

.ak-wiki-editor :deep(ul[data-type='taskList'] > li),
.ak-wiki-rendered :deep(ul[data-type='taskList'] > li) {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.625rem;
}

.ak-wiki-editor :deep(ul[data-type='taskList'] > li > label),
.ak-wiki-rendered :deep(ul[data-type='taskList'] > li > label) {
  display: flex;
  flex: none;
  align-items: center;
  padding-top: 0.35rem;
}

.ak-wiki-editor :deep(ul[data-type='taskList'] > li > label input),
.ak-wiki-rendered :deep(ul[data-type='taskList'] > li > label input) {
  width: 1rem;
  height: 1rem;
  accent-color: rgb(13 148 136);
}

.ak-wiki-editor :deep(ul[data-type='taskList'] > li > div),
.ak-wiki-rendered :deep(ul[data-type='taskList'] > li > div) {
  min-width: 0;
  flex: 1;
}

.ak-wiki-editor :deep(ul[data-type='taskList'] > li > div > p),
.ak-wiki-rendered :deep(ul[data-type='taskList'] > li > div > p) {
  margin-block: 0;
}
</style>
