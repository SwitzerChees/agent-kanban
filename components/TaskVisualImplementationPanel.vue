<script setup lang="ts">
withDefaults(defineProps<{
  locale?: 'de' | 'en';
}>(), {
  locale: 'de',
});

const emit = defineEmits<{
  resume: [];
}>();

const screens = [
  { id: 'entry', src: '/prototypes/visual-refinement-start.png', nameDe: 'Einstieg im Task', nameEn: 'Task entry' },
  { id: 'review', src: '/prototypes/visual-refinement-current.png', nameDe: 'Review & Feedback', nameEn: 'Review & feedback' },
  { id: 'mobile', src: '/prototypes/visual-refinement-mobile.png', nameDe: 'Mobile Ansicht', nameEn: 'Mobile view' },
];
</script>

<template>
  <section
    id="task-description-panel-visual"
    role="tabpanel"
    aria-labelledby="task-description-tab-visual"
    class="overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800"
  >
    <header class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-zinc-800">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ locale === 'de' ? 'Freigegebene UI-Richtung' : 'Approved UI direction' }}</h3>
          <UBadge color="neutral" variant="soft" size="sm">V2</UBadge>
          <UBadge color="success" variant="soft" size="sm" icon="i-lucide-check">{{ locale === 'de' ? 'Übernommen' : 'Applied' }}</UBadge>
        </div>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {{ locale === 'de' ? 'Visueller Entwurf mit Feedback pro Ansicht und optionalen Pins.' : 'Visual proposal with per-view feedback and optional pins.' }}
        </p>
      </div>
      <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-rotate-ccw" @click="emit('resume')">
        {{ locale === 'de' ? 'Entwurf wieder aufnehmen' : 'Resume proposal' }}
      </UButton>
    </header>

    <div class="grid gap-5 p-4 sm:p-5">
      <div class="grid gap-2 text-sm text-zinc-700 sm:grid-cols-3 dark:text-zinc-300">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-teal-600" />
          <span>{{ locale === 'de' ? 'Start über den Auftrag' : 'Start from the task brief' }}</span>
        </div>
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-teal-600" />
          <span>{{ locale === 'de' ? 'Feedback je Ansicht oder global' : 'Per-view or global feedback' }}</span>
        </div>
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-teal-600" />
          <span>{{ locale === 'de' ? 'Screens als Task-Dateien' : 'Screens as task files' }}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <a
          v-for="screen in screens"
          :key="screen.id"
          :href="screen.src"
          target="_blank"
          rel="noopener noreferrer"
          class="min-w-0 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 transition hover:ring-teal-400 dark:bg-zinc-950 dark:ring-zinc-700"
        >
          <span class="block aspect-[16/7] overflow-hidden bg-zinc-900"><img :src="screen.src" alt="" class="h-full w-full object-cover object-top" /></span>
          <span class="block truncate px-2.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">{{ locale === 'de' ? screen.nameDe : screen.nameEn }}</span>
        </a>
      </div>
    </div>
  </section>
</template>
