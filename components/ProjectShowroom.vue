<script setup lang="ts">
const props = defineProps<{ project: { id: string; key: string; name: string }; locale: 'de' | 'en'; isMobileViewport: boolean; sidebarCollapsed: boolean }>();
const emit = defineEmits<{ showBoard: []; showWiki: []; showE2e: []; openSidebar: []; openTask: [id: string] }>();
</script>
<template>
  <section class="flex min-h-0 flex-1 flex-col gap-3">
    <header class="flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <UButton class="md:hidden" color="neutral" variant="soft" icon="i-lucide-menu" :aria-label="locale === 'de' ? 'Navigation öffnen' : 'Open navigation'" @click="emit('openSidebar')" />
      <span class="hidden px-2 text-xs font-semibold text-teal-700 sm:inline dark:text-teal-300">{{ project.key }}</span>
      <strong class="min-w-0 flex-1 truncate text-sm">{{ project.name }}</strong>
      <div class="ak-surface-switch" role="tablist" :aria-label="project.name">
        <button class="ak-surface-switch-button" role="tab" :aria-selected="false" aria-label="Board" @click="emit('showBoard')"><UIcon name="i-lucide-columns-3" class="size-3.5" /><span class="hidden sm:inline">Board</span></button>
        <button class="ak-surface-switch-button" role="tab" :aria-selected="false" aria-label="Wiki" @click="emit('showWiki')"><UIcon name="i-lucide-notebook-tabs" class="size-3.5" /><span class="hidden sm:inline">Wiki</span></button>
        <button class="ak-surface-switch-button" role="tab" :aria-selected="false" aria-label="E2E" @click="emit('showE2e')"><UIcon name="i-lucide-flask-conical" class="size-3.5" /><span class="hidden sm:inline">E2E</span></button>
        <button class="ak-surface-switch-button is-active" role="tab" :aria-selected="true" aria-label="Showroom"><UIcon name="i-lucide-panels-top-left" class="size-3.5" /><span class="hidden sm:inline">Showroom</span></button>
      </div>
    </header>
    <ShowroomWorkspace :key="project.id" :project-id="project.id" :locale="locale" @open-task="emit('openTask', $event)" />
  </section>
</template>
