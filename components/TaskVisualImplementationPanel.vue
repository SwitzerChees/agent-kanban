<script setup lang="ts">
import type { VisualRefinementRun } from './TaskVisualRefinementPanel.vue';

withDefaults(defineProps<{
  locale?: 'de' | 'en';
  run: VisualRefinementRun;
}>(), { locale: 'de' });

const emit = defineEmits<{ resume: [runId: string] }>();
</script>

<template>
  <section id="task-description-panel-visual" role="tabpanel" aria-labelledby="task-description-tab-visual" class="overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
    <header class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-zinc-800">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ locale === 'de' ? 'Visuelle Umsetzung' : 'Visual implementation' }}</h3><UBadge color="neutral" variant="soft" size="sm">V{{ run.version }}</UBadge><UBadge color="success" variant="soft" size="sm" icon="i-lucide-check">{{ locale === 'de' ? 'Übernommen' : 'Applied' }}</UBadge></div>
      </div>
      <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-rotate-ccw" @click="emit('resume', run.id)">{{ locale === 'de' ? 'Entwurf wieder aufnehmen' : 'Resume proposal' }}</UButton>
    </header>
    <div class="grid gap-5 p-4 sm:p-5">
      <UEditor v-if="run.resultMarkdown" :model-value="run.resultMarkdown" content-type="markdown" :editable="false" :image="false" :mention="false" class="ak-markdown-readonly text-sm leading-6 text-zinc-700 dark:text-zinc-300" :ui="{ content: 'px-0 py-0', base: 'px-0 text-sm' }" />
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <a v-for="artifact in run.artifacts" :key="artifact.id" :href="artifact.url" target="_blank" rel="noopener noreferrer" class="min-w-0 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 transition hover:ring-teal-400 dark:bg-zinc-950 dark:ring-zinc-700">
          <span class="block aspect-[16/8] overflow-hidden bg-zinc-900"><img :src="artifact.url" :alt="artifact.title" class="h-full w-full object-cover object-top" /></span>
          <span class="block px-2.5 py-2"><span class="block truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{{ artifact.title }}</span><span v-if="artifact.viewport" class="mt-0.5 block truncate text-[11px] text-zinc-500">{{ artifact.viewport }}</span></span>
        </a>
      </div>
    </div>
  </section>
</template>
