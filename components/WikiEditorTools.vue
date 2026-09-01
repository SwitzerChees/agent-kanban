<script setup lang="ts">
import type { Editor } from '@tiptap/core';
import type {} from '@tiptap/extension-table';

type Locale = 'en' | 'de';
type TableAction = 'insert' | 'addRow' | 'addColumn' | 'deleteRow' | 'deleteColumn' | 'deleteTable';

const props = defineProps<{
  editor: Editor;
  locale: Locale;
}>();

const tableActive = ref(false);

const copy = computed(() => props.locale === 'de' ? {
  insert: 'Tabelle einfügen',
  addRow: 'Zeile hinzufügen',
  addColumn: 'Spalte hinzufügen',
  deleteRow: 'Zeile löschen',
  deleteColumn: 'Spalte löschen',
  deleteTable: 'Tabelle löschen',
} : {
  insert: 'Insert table',
  addRow: 'Add row',
  addColumn: 'Add column',
  deleteRow: 'Delete row',
  deleteColumn: 'Delete column',
  deleteTable: 'Delete table',
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
