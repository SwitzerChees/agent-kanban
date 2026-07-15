<script setup lang="ts">
interface PendingFileItem {
  id: string;
  file: File;
  url: string;
  purpose: 'task' | 'guidance' | 'follow-up';
  annotation: {
    version: 1;
    strokes: Array<{
      color: string;
      width: number;
      points: Array<{ x: number; y: number }>;
    }>;
  };
  annotatedUrl: string | null;
  renderedFile: File | null;
}

const props = withDefaults(defineProps<{
  files: PendingFileItem[];
  title: string;
  hint: string;
  chooseLabel: string;
  editImageLabel: string;
  removeLabel: string;
  tone?: 'neutral' | 'warning';
}>(), {
  tone: 'neutral',
});

const emit = defineEmits<{
  fileChange: [event: Event];
  fileDrop: [event: DragEvent];
  annotate: [item: PendingFileItem];
  remove: [item: PendingFileItem];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const openFileDialog = () => fileInput.value?.click();

const isImage = (item: PendingFileItem) => item.file.type.startsWith('image/');

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};
</script>

<template>
  <section
    class="rounded-xl border border-dashed p-3 transition-colors sm:p-4"
    :class="props.tone === 'warning'
      ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20'
      : 'border-zinc-300 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-900/55'"
    @dragover.prevent
    @drop.prevent="emit('fileDrop', $event)"
  >
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg"
          :class="props.tone === 'warning'
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
            : 'bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-700'"
        >
          <UIcon name="i-lucide-paperclip" class="size-4" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ props.title }}</p>
          <p class="max-w-prose text-xs leading-4 text-zinc-500 dark:text-zinc-400">{{ props.hint }}</p>
        </div>
      </div>
      <button
        type="button"
        class="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        :class="props.tone === 'warning'
          ? 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400'
          : 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'"
        :aria-label="props.chooseLabel"
        @click="openFileDialog"
      >
        <UIcon name="i-lucide-plus" class="size-4" />
        <span>{{ props.chooseLabel }}</span>
      </button>
      <input ref="fileInput" type="file" multiple class="sr-only" tabindex="-1" aria-hidden="true" @change="emit('fileChange', $event)">
    </div>

    <div v-if="props.files.length" class="mt-3 grid gap-2 sm:grid-cols-2">
      <div
        v-for="item in props.files"
        :key="item.id"
        class="flex min-w-0 items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-700"
      >
        <button
          v-if="isImage(item)"
          type="button"
          class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-200 transition hover:ring-teal-400 dark:bg-zinc-900 dark:ring-zinc-700"
          :aria-label="`${props.editImageLabel}: ${item.file.name}`"
          @click="emit('annotate', item)"
        >
          <img :src="item.annotatedUrl || item.url" :alt="item.file.name" class="size-full object-cover">
        </button>
        <span v-else class="grid size-11 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <UIcon name="i-lucide-file" class="size-5" />
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ item.file.name }}</p>
          <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ formatSize(item.file.size) }}</p>
        </div>

        <div class="flex shrink-0 items-center">
          <UButton
            v-if="isImage(item)"
            type="button"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-paintbrush"
            :aria-label="`${props.editImageLabel}: ${item.file.name}`"
            :title="props.editImageLabel"
            @click="emit('annotate', item)"
          />
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-x"
            :aria-label="`${props.removeLabel}: ${item.file.name}`"
            :title="props.removeLabel"
            @click="emit('remove', item)"
          />
        </div>
      </div>
    </div>
  </section>
</template>
