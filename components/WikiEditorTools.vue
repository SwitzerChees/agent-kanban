<script setup lang="ts">
import type { Editor } from '@tiptap/core';
import type {} from '@tiptap/extension-table';

type Locale = 'en' | 'de';
type TableAction = 'insert' | 'addRow' | 'addColumn' | 'deleteRow' | 'deleteColumn' | 'deleteTable';

const props = defineProps<{
  editor: Editor;
  locale: Locale;
  todoLists: Array<{ id: string; name: string; items: Array<{ completed: boolean }> }>;
}>();

const emit = defineEmits<{
  createTodoList: [payload: { name: string; editor: Editor }];
}>();

const tableActive = ref(false);
const todoMenuOpen = ref(false);
const newTodoListName = ref('');

const copy = computed(() => props.locale === 'de' ? {
  insert: 'Tabelle einfügen',
  addRow: 'Zeile hinzufügen',
  addColumn: 'Spalte hinzufügen',
  deleteRow: 'Zeile löschen',
  deleteColumn: 'Spalte löschen',
  deleteTable: 'Tabelle löschen',
  todoList: 'TODO-Liste',
  todoLists: 'Wiederverwendbare TODO-Listen',
  createTodoList: 'Neue Liste erstellen',
  listName: 'Name der Liste',
  noTodoLists: 'Noch keine Listen vorhanden.',
} : {
  insert: 'Insert table',
  addRow: 'Add row',
  addColumn: 'Add column',
  deleteRow: 'Delete row',
  deleteColumn: 'Delete column',
  deleteTable: 'Delete table',
  todoList: 'TODO list',
  todoLists: 'Reusable TODO lists',
  createTodoList: 'Create new list',
  listName: 'List name',
  noTodoLists: 'No lists yet.',
});

onMounted(() => {
  syncState();
  props.editor.on('selectionUpdate', syncState);
  props.editor.on('transaction', syncState);
});

onBeforeUnmount(() => {
  props.editor.off('selectionUpdate', syncState);
  props.editor.off('transaction', syncState);
});

function syncState() {
  tableActive.value = props.editor.isActive('table');
}

function run(action: TableAction) {
  const chain = props.editor.chain().focus();
  if (action === 'insert') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  if (action === 'addRow') chain.addRowAfter().run();
  if (action === 'addColumn') chain.addColumnAfter().run();
  if (action === 'deleteRow') chain.deleteRow().run();
  if (action === 'deleteColumn') chain.deleteColumn().run();
  if (action === 'deleteTable') chain.deleteTable().run();
  syncState();
}

function insertTodoList(list: { id: string; name: string }) {
  props.editor.chain().focus().insertContent([
    { type: 'wikiTodoList', attrs: { id: list.id, label: list.name } },
    { type: 'paragraph' },
  ]).run();
  todoMenuOpen.value = false;
}

function createTodoList() {
  const name = newTodoListName.value.trim();
  if (!name) return;
  emit('createTodoList', { name, editor: props.editor });
  newTodoListName.value = '';
  todoMenuOpen.value = false;
}
</script>

<template>
  <div class="ak-wiki-table-tools flex shrink-0 items-center gap-1 border-l border-zinc-200 pl-1.5 dark:border-zinc-700">
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-lucide-table-2"
      :title="copy.insert"
      :aria-label="copy.insert"
      @click="run('insert')"
    >
      <span class="hidden 2xl:inline">{{ copy.insert }}</span>
    </UButton>

    <UPopover v-model:open="todoMenuOpen" :content="{ align: 'end', side: 'bottom' }">
      <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-list-todo" :title="copy.todoList" :aria-label="copy.todoList">
        <span class="hidden 2xl:inline">{{ copy.todoList }}</span>
      </UButton>
      <template #content>
        <div class="w-80 p-2">
          <p class="px-2 pb-2 pt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{{ copy.todoLists }}</p>
          <div class="max-h-56 overflow-y-auto">
            <button v-for="list in props.todoLists" :key="list.id" type="button" class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-teal-600 dark:hover:bg-zinc-800" @click="insertTodoList(list)">
              <UIcon name="i-lucide-list-checks" class="size-4 shrink-0 text-teal-600" />
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ list.name }}</span>
              <span class="text-[11px] tabular-nums text-zinc-500">{{ list.items.filter((item) => !item.completed).length }}/{{ list.items.length }}</span>
            </button>
            <p v-if="!props.todoLists.length" class="px-2.5 py-4 text-xs text-zinc-500 dark:text-zinc-400">{{ copy.noTodoLists }}</p>
          </div>
          <form class="mt-2 flex gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800" @submit.prevent="createTodoList">
            <UInput v-model="newTodoListName" class="min-w-0 flex-1" size="sm" :placeholder="copy.listName" :aria-label="copy.listName" maxlength="120" />
            <UButton type="submit" size="sm" color="primary" icon="i-lucide-plus" :disabled="!newTodoListName.trim()">{{ copy.createTodoList }}</UButton>
          </form>
        </div>
      </template>
    </UPopover>

    <template v-if="tableActive">
      <span class="mx-0.5 h-5 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
      <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-rows-3" :title="copy.addRow" :aria-label="copy.addRow" @click="run('addRow')">
        <span class="hidden xl:inline">{{ copy.addRow }}</span>
      </UButton>
      <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-columns-3" :title="copy.addColumn" :aria-label="copy.addColumn" @click="run('addColumn')">
        <span class="hidden xl:inline">{{ copy.addColumn }}</span>
      </UButton>
      <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-between-horizontal-end" :title="copy.deleteRow" :aria-label="copy.deleteRow" @click="run('deleteRow')" />
      <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-between-vertical-end" :title="copy.deleteColumn" :aria-label="copy.deleteColumn" @click="run('deleteColumn')" />
      <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :title="copy.deleteTable" :aria-label="copy.deleteTable" @click="run('deleteTable')" />
    </template>
  </div>
</template>
