<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper } from '@tiptap/vue-3';
import {
  filterWikiTodoItems,
  wikiTodoEditableText,
  wikiTodoTextParts,
  type WikiTodoExtensionOptions,
  type WikiTodoFilter,
  type WikiTodoItemRecord,
  type WikiTodoTextPart,
} from '~/utils/wiki-todos';

const props = defineProps<NodeViewProps>();
const options = computed(() => props.extension.options as WikiTodoExtensionOptions);
const listId = computed(() => String(props.node.attrs.id ?? ''));
const list = computed(() => options.value.getList(listId.value));
const locale = computed(() => options.value.getLocale());
const members = computed(() => options.value.getMembers?.() ?? []);
const tasks = computed(() => options.value.getTasks?.() ?? []);
const filter = ref<WikiTodoFilter>('all');
const collapsed = ref(false);
const newText = ref('');
const editingItemId = ref<string | null>(null);
const editingText = ref('');
const busyItems = ref(new Set<string>());
const creating = ref(false);
const error = ref('');

const copy = computed(() => locale.value === 'de' ? {
  missing: 'Diese TODO-Liste ist nicht mehr verfügbar.',
  all: 'Alle',
  active: 'Offen',
  completed: 'Erledigt',
  week: '7 Tage',
  month: '30 Tage',
  add: 'Hinzufügen',
  placeholder: 'Neuer Eintrag – mit @ Person oder # Task verknüpfen …',
  edit: 'Eintrag bearbeiten',
  save: 'Speichern',
  cancel: 'Abbrechen',
  delete: 'Löschen',
  deleteConfirm: 'Diesen TODO-Eintrag wirklich löschen?',
  empty: 'Keine Einträge in dieser Ansicht.',
  failed: 'Die Änderung konnte nicht gespeichert werden.',
  collapse: 'TODO-Liste einklappen',
  expand: 'TODO-Liste ausklappen',
  summary: (active: number, total: number) => `${active} offen · ${total} gesamt`,
} : {
  missing: 'This TODO list is no longer available.',
  all: 'All',
  active: 'Active',
  completed: 'Completed',
  week: '7 days',
  month: '30 days',
  add: 'Add',
  placeholder: 'New item – link a person with @ or a task with # …',
  edit: 'Edit item',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteConfirm: 'Delete this TODO item?',
  empty: 'No items in this view.',
  failed: 'The change could not be saved.',
  collapse: 'Collapse TODO list',
  expand: 'Expand TODO list',
  summary: (active: number, total: number) => `${active} active · ${total} total`,
});

const filters = computed(() => (['all', 'active', 'completed', 'week', 'month'] as const).map((value) => ({
  value,
  label: copy.value[value],
})));
const visibleItems = computed(() => filterWikiTodoItems(list.value?.items ?? [], filter.value));
const activeCount = computed(() => list.value?.items.filter((item) => !item.completed).length ?? 0);

function textParts(text: string) {
  return wikiTodoTextParts(text, options.value.resolveReference);
}

function itemLabel(item: WikiTodoItemRecord) {
  return textParts(item.text).map((part) => part.text).join('');
}

function startEditing(item: WikiTodoItemRecord) {
  if (busyItems.value.has(item.id)) return;
  error.value = '';
  editingItemId.value = item.id;
  editingText.value = wikiTodoEditableText(item.text, options.value.resolveReference);
}

function cancelEditing() {
  editingItemId.value = null;
  editingText.value = '';
  error.value = '';
}

async function saveItem(item: WikiTodoItemRecord) {
  const text = editingText.value.trim();
  if (!text || !options.value.updateItem) return;
  if (text === wikiTodoEditableText(item.text, options.value.resolveReference).trim()) {
    cancelEditing();
    return;
  }
  setBusy(item.id, true);
  error.value = '';
  try {
    await options.value.updateItem(item, text);
    cancelEditing();
  } catch {
    error.value = copy.value.failed;
  } finally {
    setBusy(item.id, false);
  }
}

async function removeItem(item: WikiTodoItemRecord) {
  if (!options.value.deleteItem || busyItems.value.has(item.id) || !window.confirm(copy.value.deleteConfirm)) return;
  setBusy(item.id, true);
  error.value = '';
  try {
    await options.value.deleteItem(item);
    cancelEditing();
  } catch {
    error.value = copy.value.failed;
  } finally {
    setBusy(item.id, false);
  }
}

async function toggleItem(item: WikiTodoItemRecord, event: Event) {
  const checkbox = event.target as HTMLInputElement;
  if (!options.value.toggleItem) return;
  setBusy(item.id, true);
  error.value = '';
  try {
    await options.value.toggleItem(item, checkbox.checked);
  } catch {
    checkbox.checked = item.completed;
    error.value = copy.value.failed;
  } finally {
    setBusy(item.id, false);
  }
}

async function createItem() {
  const text = newText.value.trim();
  if (!text || !options.value.createItem || creating.value) return;
  creating.value = true;
  error.value = '';
  try {
    await options.value.createItem(listId.value, text);
    newText.value = '';
  } catch {
    error.value = copy.value.failed;
  } finally {
    creating.value = false;
  }
}

function setBusy(itemId: string, busy: boolean) {
  const next = new Set(busyItems.value);
  if (busy) next.add(itemId);
  else next.delete(itemId);
  busyItems.value = next;
}

function openReference(part: WikiTodoTextPart) {
  if (part.reference?.kind === 'task' && part.reference.valid) options.value.openTask?.(part.reference.id);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-CH' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));
}
</script>

<template>
  <NodeViewWrapper
    as="section"
    class="ak-wiki-todo"
    :class="{ 'is-invalid': !list, 'is-selected': props.selected && props.editor.isEditable, 'is-collapsed': collapsed }"
    :data-wiki-todo-list-id="listId"
    contenteditable="false"
  >
    <template v-if="list">
      <header>
        <div class="ak-wiki-todo-heading">
          <span data-drag-handle class="ak-wiki-todo-drag" aria-hidden="true"><UIcon name="i-lucide-grip-vertical" /></span>
          <span><strong>{{ list.name }}</strong><small>{{ copy.summary(activeCount, list.items.length) }}</small></span>
        </div>
        <div class="ak-wiki-todo-header-actions">
          <div class="ak-wiki-todo-filters" role="group">
            <button
              v-for="entry in filters"
              :key="entry.value"
              type="button"
              :class="{ 'is-active': filter === entry.value }"
              :aria-pressed="filter === entry.value"
              @mousedown.stop
              @click.stop="filter = entry.value"
            >{{ entry.label }}</button>
          </div>
          <button
            type="button"
            class="ak-wiki-todo-collapse"
            :aria-expanded="!collapsed"
            :aria-label="collapsed ? copy.expand : copy.collapse"
            :title="collapsed ? copy.expand : copy.collapse"
            @mousedown.stop
            @click.stop="collapsed = !collapsed"
          ><UIcon :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" /></button>
        </div>
      </header>

      <ul v-show="!collapsed">
        <li v-for="item in visibleItems" :key="item.id" :class="{ 'is-completed': item.completed, 'is-editing': editingItemId === item.id }">
          <input
            type="checkbox"
            :checked="item.completed"
            :disabled="busyItems.has(item.id)"
            :aria-label="itemLabel(item)"
            @mousedown.stop
            @click.stop
            @change="toggleItem(item, $event)"
          >

          <form v-if="editingItemId === item.id" class="ak-wiki-todo-edit" @submit.prevent="saveItem(item)" @mousedown.stop @click.stop>
            <WikiTodoTextArea
              v-model="editingText"
              :locale="locale"
              :members="members"
              :tasks="tasks"
              :placeholder="copy.placeholder"
              :label="copy.edit"
              :disabled="busyItems.has(item.id)"
              autofocus
              cancelable
              @submit="saveItem(item)"
              @cancel="cancelEditing"
            />
            <div class="ak-wiki-todo-edit-actions">
              <button type="button" class="is-danger" :disabled="busyItems.has(item.id)" @mousedown.stop @click.stop="removeItem(item)">{{ copy.delete }}</button>
              <button type="button" @mousedown.stop @click.stop="cancelEditing">{{ copy.cancel }}</button>
              <button type="submit" class="is-primary" :disabled="!editingText.trim() || busyItems.has(item.id)" @mousedown.stop>{{ copy.save }}</button>
            </div>
          </form>

          <template v-else>
            <div
              class="ak-wiki-todo-item-text"
              role="button"
              tabindex="0"
              :aria-label="`${copy.edit}: ${itemLabel(item)}`"
              @mousedown.stop
              @click.stop="startEditing(item)"
              @keydown.enter.stop.prevent="startEditing(item)"
              @keydown.space.stop.prevent="startEditing(item)"
            >
              <template v-for="(part, index) in textParts(item.text)" :key="index">
                <button
                  v-if="part.reference?.kind === 'task'"
                  type="button"
                  class="ak-wiki-reference is-task"
                  :class="{ 'is-invalid': !part.reference.valid }"
                  :disabled="!part.reference.valid"
                  :data-wiki-task-id="part.reference.id"
                  @mousedown.stop
                  @click.stop="openReference(part)"
                >{{ part.text }}</button>
                <span
                  v-else-if="part.reference"
                  class="ak-wiki-reference"
                  :class="[`is-${part.reference.kind}`, { 'is-invalid': !part.reference.valid }]"
                  :data-wiki-user-id="part.reference.kind === 'user' ? part.reference.id : undefined"
                >{{ part.text }}</span>
                <span v-else>{{ part.text }}</span>
              </template>
            </div>
            <div class="ak-wiki-todo-item-meta">
              <time v-if="item.completedAt" :datetime="item.completedAt">{{ formatDate(item.completedAt) }}</time>
              <button type="button" class="ak-wiki-todo-edit-button" :aria-label="`${copy.edit}: ${itemLabel(item)}`" @mousedown.stop @click.stop="startEditing(item)"><UIcon name="i-lucide-pencil" /></button>
            </div>
          </template>
        </li>
        <li v-if="!visibleItems.length" class="is-empty">{{ copy.empty }}</li>
      </ul>

      <form v-show="!collapsed" class="ak-wiki-todo-add" @submit.prevent="createItem" @mousedown.stop @click.stop>
        <WikiTodoTextArea
          v-model="newText"
          :locale="locale"
          :members="members"
          :tasks="tasks"
          :placeholder="copy.placeholder"
          :label="copy.placeholder"
          :disabled="creating"
          @submit="createItem"
        />
        <button type="submit" class="is-primary" :disabled="!newText.trim() || creating" @mousedown.stop>{{ copy.add }}</button>
      </form>
      <p v-if="error && !collapsed" class="ak-wiki-todo-error" role="alert">{{ error }}</p>
    </template>
    <template v-else>
      <strong>{{ String(props.node.attrs.label ?? 'TODO list') }}</strong>
      <p>{{ copy.missing }}</p>
    </template>
  </NodeViewWrapper>
</template>

<style scoped>
.ak-wiki-todo {
  width: 100%;
  margin-block: 1.5rem;
  overflow: hidden;
  border: 1px solid rgb(212 212 216);
  border-radius: 0.75rem;
  background: rgb(250 250 250 / 0.72);
  color: rgb(63 63 70);
}
.ak-wiki-todo.is-selected { border-color: rgb(20 184 166); box-shadow: 0 0 0 2px rgb(20 184 166 / 0.12); }
.ak-wiki-todo > header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid rgb(228 228 231);
}
.ak-wiki-todo.is-collapsed > header { border-bottom-color: transparent; }
.ak-wiki-todo-heading { display: flex; min-width: 0; align-items: center; gap: 0.375rem; }
.ak-wiki-todo-heading > span:last-child { display: flex; min-width: 0; align-items: baseline; gap: 0.625rem; }
.ak-wiki-todo-heading strong { color: rgb(24 24 27); font-size: 0.875rem; }
.ak-wiki-todo-heading small,
.ak-wiki-todo time { color: rgb(113 113 122); font-size: 0.6875rem; }
.ak-wiki-todo-drag { display: grid; width: 1.25rem; height: 1.5rem; cursor: grab; place-items: center; color: rgb(161 161 170); }
.ak-wiki-todo-drag svg { width: 0.875rem; height: 0.875rem; }
.ak-wiki-todo-header-actions { display: flex; align-items: center; gap: 0.375rem; }
.ak-wiki-todo-filters { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.ak-wiki-todo button.ak-wiki-todo-collapse {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  flex: none;
  padding: 0;
  place-items: center;
}
.ak-wiki-todo-collapse svg { width: 1rem; height: 1rem; }
.ak-wiki-todo-collapse:focus-visible { outline: 2px solid rgb(13 148 136); outline-offset: 2px; }
.ak-wiki-todo button {
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  color: rgb(82 82 91);
  font-size: 0.6875rem;
  font-weight: 650;
  line-height: 1rem;
}
.ak-wiki-todo button:hover:not(:disabled),
.ak-wiki-todo button.is-active { background: rgb(204 251 241); color: rgb(15 118 110); }
.ak-wiki-todo button:disabled { cursor: not-allowed; opacity: 0.55; }
.ak-wiki-todo > ul { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.ak-wiki-todo > ul > li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.625rem;
  margin: 0;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid rgb(244 244 245);
}
.ak-wiki-todo > ul > li::before { display: none; }
.ak-wiki-todo input[type='checkbox'] { width: 1rem; height: 1rem; margin-top: 0.35rem; accent-color: rgb(13 148 136); }
.ak-wiki-todo-item-text {
  min-width: 0;
  cursor: text;
  border-radius: 0.375rem;
  padding: 0.125rem 0.25rem;
  white-space: pre-wrap;
  font-size: 0.8125rem;
  line-height: 1.35rem;
  outline: none;
}
.ak-wiki-todo-item-text:hover { background: rgb(244 244 245); }
.ak-wiki-todo-item-text:focus-visible { box-shadow: 0 0 0 2px rgb(20 184 166 / 0.35); }
.is-completed .ak-wiki-todo-item-text { color: rgb(113 113 122); text-decoration: line-through; }
.ak-wiki-todo-item-meta { display: flex; min-height: 1.5rem; align-items: center; gap: 0.25rem; }
.ak-wiki-todo-edit-button { display: grid; width: 1.5rem; height: 1.5rem; place-items: center; opacity: 0; }
li:hover .ak-wiki-todo-edit-button,
.ak-wiki-todo-edit-button:focus-visible { opacity: 1; }
.ak-wiki-todo-edit-button svg { width: 0.75rem; height: 0.75rem; }
.ak-wiki-todo-edit { grid-column: 2 / -1; min-width: 0; }
.ak-wiki-todo-edit-actions { display: flex; justify-content: flex-end; gap: 0.375rem; margin-top: 0.5rem; }
.ak-wiki-todo button.is-danger { margin-right: auto; color: rgb(220 38 38); }
.ak-wiki-todo button.is-danger:hover:not(:disabled) { background: rgb(254 226 226); color: rgb(185 28 28); }
.ak-wiki-todo button.is-primary { background: rgb(13 148 136); color: white; padding: 0.4375rem 0.875rem; }
.ak-wiki-todo button.is-primary:hover:not(:disabled) { background: rgb(15 118 110); color: white; }
.ak-wiki-todo > ul > li.is-empty { display: block; color: rgb(113 113 122); font-size: 0.8125rem; }
.ak-wiki-todo-add { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.75rem 0.875rem; }
.ak-wiki-todo-add > .ak-wiki-todo-textarea-wrap { flex: 1; }
.ak-wiki-todo-add > button { margin-top: 0.0625rem; min-height: 2.625rem; }
.ak-wiki-todo-error { margin: 0; border-top: 1px solid rgb(254 202 202); background: rgb(254 242 242); padding: 0.5rem 0.875rem; color: rgb(185 28 28); font-size: 0.75rem; }
.ak-wiki-todo .ak-wiki-reference { display: inline; border-radius: 0.3rem; padding: 0.08rem 0.25rem; font-size: inherit; font-weight: 650; line-height: inherit; text-decoration: none; }
.ak-wiki-todo button.ak-wiki-reference { vertical-align: baseline; }
.ak-wiki-todo .ak-wiki-reference.is-user { background: rgb(236 253 245); color: rgb(4 120 87); }
.ak-wiki-todo .ak-wiki-reference.is-task { background: rgb(239 246 255); color: rgb(29 78 216); }
.ak-wiki-todo .ak-wiki-reference.is-task:hover:not(:disabled) { background: rgb(219 234 254); color: rgb(30 64 175); text-decoration: underline; }
.ak-wiki-todo.is-invalid { border-style: dashed; padding: 0.875rem; color: rgb(113 113 122); }
:global(.dark) .ak-wiki-todo { border-color: rgb(63 63 70); background: rgb(24 24 27 / 0.62); color: rgb(212 212 216); }
:global(.dark) .ak-wiki-todo > header,
:global(.dark) .ak-wiki-todo > ul > li { border-color: rgb(63 63 70); }
:global(.dark) .ak-wiki-todo-heading strong { color: rgb(244 244 245); }
:global(.dark) .ak-wiki-todo-item-text:hover { background: rgb(39 39 42); }
:global(.dark) .ak-wiki-todo button:hover:not(:disabled),
:global(.dark) .ak-wiki-todo button.is-active { background: rgb(19 78 74); color: rgb(153 246 228); }
:global(.dark) .ak-wiki-todo button.is-primary { background: rgb(13 148 136); color: white; }
:global(.dark) .ak-wiki-todo button.is-danger { color: rgb(252 165 165); }
:global(.dark) .ak-wiki-todo button.is-danger:hover:not(:disabled) { background: rgb(127 29 29 / 0.45); color: rgb(254 202 202); }
:global(.dark) .ak-wiki-todo .ak-wiki-reference.is-user { background: rgb(6 78 59 / 0.6); color: rgb(110 231 183); }
:global(.dark) .ak-wiki-todo .ak-wiki-reference.is-task { background: rgb(30 58 138 / 0.55); color: rgb(147 197 253); }
:global(.dark) .ak-wiki-todo-error { border-color: rgb(127 29 29); background: rgb(69 10 10 / 0.45); color: rgb(254 202 202); }
@media (max-width: 640px) {
  .ak-wiki-todo-header-actions { width: 100%; justify-content: space-between; }
  .ak-wiki-todo-add { flex-direction: column; }
  .ak-wiki-todo-add > button { width: 100%; }
  .ak-wiki-todo > ul > li { grid-template-columns: auto minmax(0, 1fr); }
  .ak-wiki-todo-item-meta { grid-column: 2; }
  .ak-wiki-todo-edit { grid-column: 2; }
}
</style>
