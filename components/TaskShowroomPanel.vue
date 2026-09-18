<script setup lang="ts">
import type { ShowroomFeedback, ShowroomLibrary, ShowroomView, TaskShowroomData, TaskShowroomLink } from '../shared/showroom';

const props = defineProps<{ taskId: string; locale: 'de' | 'en'; initialBrief?: string }>();
const say = (german: string, english: string) => props.locale === 'de' ? german : english;
const data = ref<TaskShowroomData | null>(null);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const panel = ref<'create' | 'link' | 'spec' | null>(null);
const brief = ref(props.initialBrief?.trim() || '');
const desktop = ref(true);
const mobile = ref(true);
const states = ref(false);
const linkKind = ref<'category' | 'view'>('category');
const search = ref('');
const selectedTargets = ref<string[]>([]);
const specPaths = ref<string[]>([]);
const specNotes = ref('');
const selectedView = ref<ShowroomView | null>(null);
const viewerLibrary = ref<ShowroomLibrary | null>(null);
const focusFeedback = ref<ShowroomFeedback | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

const active = computed(() => data.value?.activeRun && ['queued', 'running', 'awaiting_input'].includes(data.value.activeRun.status));
const endpoint = computed(() => data.value ? `/api/projects/${data.value.library.project.id}/showroom` : '');
const linkedPaths = computed(() => new Set(data.value?.links.map(link => `${link.kind}:${link.targetPath}`) ?? []));
const linkOptions = computed(() => {
  const query = search.value.trim().toLowerCase();
  const values = linkKind.value === 'category'
    ? (data.value?.library.categories ?? []).map(value => ({ value, title: value, subtitle: say('Ganzer Ordner', 'Entire folder') }))
    : (data.value?.library.views ?? []).map(view => ({ value: view.path, title: view.title, subtitle: view.path }));
  return values.filter(item => !query || `${item.title} ${item.subtitle}`.toLowerCase().includes(query));
});
const groups = computed(() => {
  const result = new Map<string, ShowroomView[]>();
  for (const view of data.value?.linkedViews ?? []) {
    const items = result.get(view.category) ?? [];
    items.push(view);
    result.set(view.category, items);
  }
  return [...result.entries()].map(([category, views]) => ({ category, views }));
});
const latestSpec = computed(() => data.value?.specs.find(spec => spec.active) ?? null);
const previewUrl = (view: ShowroomView) => `/showroom-preview/${data.value!.library.previewToken}/${view.path.split('/').map(encodeURIComponent).join('/')}`;
const date = (value: string) => new Date(value).toLocaleString(props.locale === 'de' ? 'de-CH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function errorText(cause: any) {
  const key = cause?.data?.statusMessage || cause?.statusMessage || cause?.message;
  const known: Record<string, string> = {
    refinement_already_active: say('Für diese Aufgabe läuft bereits eine KI-Ausarbeitung.', 'An AI refinement is already running for this task.'),
    visual_refinement_requires_idle_task: say('Der Showroom-Entwurf kann starten, sobald die laufende Aufgabenbearbeitung beendet ist.', 'The Showroom draft can start after the current task run finishes.'),
    showroom_viewport_required: say('Wähle Desktop oder Mobil aus.', 'Select desktop or mobile.'),
    showroom_category_missing: say('Dieser Ordner existiert nicht mehr. Bitte aktualisieren.', 'This folder no longer exists. Refresh and try again.'),
    showroom_view_missing: say('Diese Ansicht existiert nicht mehr. Bitte aktualisieren.', 'This view no longer exists. Refresh and try again.'),
    task_showroom_spec_changed: say('Eine Ansicht hat sich geändert. Bitte aktualisieren und erneut festhalten.', 'A view changed. Refresh and save the reference again.'),
  };
  return known[key] || say('Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.', 'Could not complete this action. Please try again.');
}

async function refresh(options: { quiet?: boolean } = {}) {
  try {
    if (!options.quiet) error.value = '';
    data.value = await $fetch<TaskShowroomData>(`/api/tasks/${props.taskId}/showroom`);
    if (!specPaths.value.length) specPaths.value = data.value.linkedViews.map(view => view.path);
  } catch (cause) {
    if (!options.quiet) error.value = errorText(cause);
  } finally {
    loading.value = false;
  }
}

async function act(action: () => Promise<void>, message = '') {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await action();
    if (message) notice.value = message;
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}

function openCreate(prefill = false) {
  if (prefill && !brief.value.trim()) brief.value = say('Überarbeite die bestehenden Ansichten anhand des offenen Feedbacks.', 'Improve the existing views using the open feedback.');
  panel.value = 'create';
  notice.value = '';
}

async function startRun() {
  await act(async () => {
    await $fetch(`/api/tasks/${props.taskId}/showroom/runs`, {
      method: 'POST',
      body: { brief: brief.value, desktop: desktop.value, mobile: mobile.value, states: states.value },
    });
    panel.value = null;
    await refresh({ quiet: true });
  }, say('Der KI-Entwurf wurde gestartet. Ordner und Ansichten entstehen automatisch.', 'The AI draft has started. Its folder and views are created automatically.'));
}

function toggleTarget(value: string, checked: boolean) {
  selectedTargets.value = checked
    ? [...new Set([...selectedTargets.value, value])]
    : selectedTargets.value.filter(item => item !== value);
}

async function saveLinks() {
  await act(async () => {
    for (const targetPath of selectedTargets.value.slice(0, 12)) {
      if (linkedPaths.value.has(`${linkKind.value}:${targetPath}`)) continue;
      await $fetch(`/api/tasks/${props.taskId}/showroom/links`, {
        method: 'POST', body: { kind: linkKind.value, targetPath, mode: 'follow' },
      });
    }
    selectedTargets.value = [];
    panel.value = null;
    await refresh({ quiet: true });
    specPaths.value = data.value?.linkedViews.map(view => view.path) ?? [];
  }, say('Showroom-Inhalte wurden mit der Aufgabe verknüpft.', 'Showroom content was linked to the task.'));
}

async function removeLink(link: TaskShowroomLink) {
  await act(async () => {
    await $fetch(`/api/tasks/${props.taskId}/showroom/links/${link.id}`, { method: 'DELETE', body: {} });
    await refresh({ quiet: true });
  }, say('Verknüpfung entfernt.', 'Link removed.'));
}

function categoryLink(category: string) {
  return data.value?.links.find(link => link.kind === 'category' && link.targetPath === category) ?? null;
}

function viewLink(view: ShowroomView) {
  return data.value?.links.find(link => link.kind === 'view' && link.targetPath === view.path) ?? null;
}

function openView(view: ShowroomView) {
  viewerLibrary.value = data.value?.library ?? null;
  focusFeedback.value = null;
  selectedView.value = view;
}

async function openFeedback(row: ShowroomFeedback) {
  await act(async () => {
    const library = row.snapshotId === data.value?.library.snapshotId
      ? data.value.library
      : await $fetch<ShowroomLibrary>(endpoint.value, { query: { snapshot: row.snapshotId } });
    const view = library.views.find(item => item.path === row.viewPath);
    if (!view) throw new Error('showroom_view_missing');
    viewerLibrary.value = library;
    focusFeedback.value = row;
    selectedView.value = view;
  });
}

async function resolveFeedback(row: ShowroomFeedback) {
  await act(async () => {
    await $fetch(`${endpoint.value}/feedback/${row.id}`, { method: 'PATCH', body: { status: 'resolved' } });
    await refresh({ quiet: true });
  }, say('Feedback als erledigt markiert.', 'Feedback marked as resolved.'));
}

function toggleSpecPath(path: string, checked: boolean) {
  specPaths.value = checked ? [...new Set([...specPaths.value, path])] : specPaths.value.filter(item => item !== path);
}

async function saveSpec() {
  await act(async () => {
    await $fetch(`/api/tasks/${props.taskId}/showroom/specs`, {
      method: 'POST', body: { paths: specPaths.value, notes: specNotes.value },
    });
    panel.value = null;
    specNotes.value = '';
    await refresh({ quiet: true });
  }, say('Referenzstand gespeichert.', 'Reference version saved.'));
}

onMounted(() => {
  void refresh();
  timer = setInterval(() => {
    if (!document.hidden && !busy.value) void refresh({ quiet: true });
  }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
watch(() => props.taskId, () => { loading.value = true; data.value = null; void refresh(); });
</script>

<template>
  <section class="min-w-0 p-4 sm:p-6" aria-labelledby="task-showroom-title">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900">
            <UIcon name="i-lucide-panels-top-left" class="size-4.5" />
          </span>
          <div>
            <h2 id="task-showroom-title" class="text-base font-semibold text-zinc-950 dark:text-white">Showroom</h2>
            <p class="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{{ say('Visuelle Entwürfe, Feedback und freigegebene Referenzstände dieser Aufgabe.', 'Visual drafts, feedback, and approved reference versions for this task.') }}</p>
          </div>
        </div>
      </div>
      <div v-if="data" class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-link" :label="say('Bestehendes verknüpfen', 'Link existing')" @click="panel = panel === 'link' ? null : 'link'" />
        <UButton icon="i-lucide-sparkles" class="!bg-teal-700 !text-white hover:!bg-teal-800" :label="say('Im Showroom entwerfen', 'Design in Showroom')" :disabled="Boolean(active)" @click="openCreate(Boolean(data.linkedViews.length))" />
      </div>
    </div>

    <div v-if="loading" class="mt-8 grid place-items-center rounded-2xl border border-dashed border-zinc-200 py-16 dark:border-zinc-800">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-teal-600" />
    </div>

    <template v-else-if="data">
      <UAlert v-if="error" class="mt-5" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
      <UAlert v-if="notice" class="mt-5" color="success" variant="soft" icon="i-lucide-circle-check" :description="notice" />

      <div v-if="active" class="mt-5 flex items-start gap-3 rounded-xl bg-teal-50 px-4 py-3 ring-1 ring-teal-100 dark:bg-teal-950/30 dark:ring-teal-900/70">
        <UIcon name="i-lucide-loader-circle" class="mt-0.5 size-5 shrink-0 animate-spin text-teal-700 dark:text-teal-300" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-teal-950 dark:text-teal-100">{{ data.activeRun?.status === 'queued' ? say('Entwurf ist vorgemerkt', 'Draft is queued') : say('KI erstellt den Showroom-Entwurf', 'AI is creating the Showroom draft') }}</p>
          <p class="mt-1 text-sm text-teal-800/80 dark:text-teal-200/80">{{ say('Ordner, Ansichten und responsive Zustände werden aus dem Auftrag abgeleitet. Die fertigen Ansichten erscheinen automatisch hier.', 'Folder, views, and responsive states are inferred from the brief. Finished views will appear here automatically.') }}</p>
        </div>
      </div>

      <form v-if="panel === 'create'" class="mt-5 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 sm:p-5 dark:bg-zinc-900/60 dark:ring-zinc-800" @submit.prevent="startRun">
        <div class="flex items-start justify-between gap-3">
          <div><h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ say('Mit KI im Showroom entwerfen', 'Design with AI in Showroom') }}</h3><p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ say('Ordner und Ansichten werden automatisch passend zum Auftrag angelegt.', 'Folder and views are created automatically from the task.') }}</p></div>
          <button type="button" class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800" :aria-label="say('Schließen', 'Close')" @click="panel = null"><UIcon name="i-lucide-x" /></button>
        </div>
        <label class="mt-4 block"><span class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{{ say('Was soll sichtbar und ausprobierbar werden?', 'What should be visible and testable?') }}</span><textarea v-model="brief" rows="5" maxlength="20000" required class="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" :placeholder="say('Beschreibe Ziel, Nutzerablauf und wichtige Inhalte …', 'Describe the goal, user flow, and important content …')" /></label>
        <div class="mt-4 flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <label class="inline-flex items-center gap-2"><input v-model="desktop" type="checkbox" class="size-4 accent-teal-700">Desktop</label>
          <label class="inline-flex items-center gap-2"><input v-model="mobile" type="checkbox" class="size-4 accent-teal-700">{{ say('Mobil', 'Mobile') }}</label>
          <label class="inline-flex items-center gap-2"><input v-model="states" type="checkbox" class="size-4 accent-teal-700">{{ say('Sonderzustände', 'Special states') }}</label>
        </div>
        <div class="mt-5 flex justify-end"><UButton type="submit" size="lg" icon="i-lucide-sparkles" class="!bg-teal-700 !text-white hover:!bg-teal-800" :loading="busy" :disabled="!brief.trim() || (!desktop && !mobile)" :label="say('Entwurf starten', 'Start draft')" /></div>
      </form>

      <div v-else-if="panel === 'link'" class="mt-5 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 sm:p-5 dark:bg-zinc-900/60 dark:ring-zinc-800">
        <div class="flex items-start justify-between gap-3"><div><h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ say('Bestehenden Showroom verknüpfen', 'Link existing Showroom content') }}</h3><p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ say('Verbinde einen ganzen Ordner oder einzelne Ansichten mit dieser Aufgabe.', 'Connect an entire folder or individual views to this task.') }}</p></div><button type="button" class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800" :aria-label="say('Schließen', 'Close')" @click="panel = null"><UIcon name="i-lucide-x" /></button></div>
        <div class="mt-4 flex gap-1 rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-800"><button v-for="item in [{ value: 'category', label: say('Ordner', 'Folders') }, { value: 'view', label: say('Ansichten', 'Views') }]" :key="item.value" type="button" class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition" :class="linkKind === item.value ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'" @click="linkKind = item.value as 'category' | 'view'; selectedTargets = []">{{ item.label }}</button></div>
        <label class="relative mt-3 block"><UIcon name="i-lucide-search" class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" /><input v-model="search" type="search" class="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950" :placeholder="say('Showroom durchsuchen …', 'Search Showroom …')"></label>
        <div class="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          <label v-for="item in linkOptions" :key="item.value" class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white dark:hover:bg-zinc-950"><input type="checkbox" class="size-4 accent-teal-700" :checked="selectedTargets.includes(item.value) || linkedPaths.has(`${linkKind}:${item.value}`)" :disabled="linkedPaths.has(`${linkKind}:${item.value}`)" @change="toggleTarget(item.value, ($event.target as HTMLInputElement).checked)"><span class="min-w-0"><strong class="block truncate text-sm text-zinc-900 dark:text-zinc-100">{{ item.title }}</strong><small class="block truncate text-zinc-500">{{ item.subtitle }}</small></span><UBadge v-if="linkedPaths.has(`${linkKind}:${item.value}`)" class="ml-auto" color="neutral" variant="soft">{{ say('Verknüpft', 'Linked') }}</UBadge></label>
          <p v-if="!linkOptions.length" class="py-8 text-center text-sm text-zinc-500">{{ say('Keine passenden Inhalte gefunden.', 'No matching content found.') }}</p>
        </div>
        <div class="mt-4 flex justify-end"><UButton icon="i-lucide-link" class="!bg-teal-700 !text-white hover:!bg-teal-800" :loading="busy" :disabled="!selectedTargets.length" :label="say('Verknüpfen', 'Link selected')" @click="saveLinks" /></div>
      </div>

      <div v-else-if="panel === 'spec'" class="mt-5 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 sm:p-5 dark:bg-zinc-900/60 dark:ring-zinc-800">
        <div class="flex items-start justify-between gap-3"><div><h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ say('Referenzstand festhalten', 'Save reference version') }}</h3><p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ say('Diese Auswahl bleibt als unveränderlicher Stand an der Aufgabe nachvollziehbar.', 'This selection remains traceable on the task as an immutable version.') }}</p></div><button type="button" class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800" :aria-label="say('Schließen', 'Close')" @click="panel = null"><UIcon name="i-lucide-x" /></button></div>
        <div class="mt-4 space-y-1"><label v-for="view in data.linkedViews" :key="view.path" class="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white dark:hover:bg-zinc-950"><input type="checkbox" class="size-4 accent-teal-700" :checked="specPaths.includes(view.path)" @change="toggleSpecPath(view.path, ($event.target as HTMLInputElement).checked)"><span class="min-w-0"><strong class="block truncate text-sm text-zinc-900 dark:text-zinc-100">{{ view.title }}</strong><small class="block truncate text-zinc-500">{{ view.path }}</small></span></label></div>
        <label class="mt-4 block"><span class="text-sm font-medium text-zinc-800 dark:text-zinc-200">{{ say('Notiz', 'Note') }} <span class="font-normal text-zinc-500">({{ say('optional', 'optional') }})</span></span><textarea v-model="specNotes" rows="3" maxlength="20000" class="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <div class="mt-4 flex justify-end"><UButton icon="i-lucide-bookmark-check" class="!bg-teal-700 !text-white hover:!bg-teal-800" :loading="busy" :disabled="!specPaths.length" :label="say('Stand speichern', 'Save version')" @click="saveSpec" /></div>
      </div>

      <div v-if="latestSpec" class="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
        <UIcon name="i-lucide-bookmark-check" class="size-4 text-teal-700 dark:text-teal-300" /><strong class="text-zinc-900 dark:text-zinc-100">{{ say('Referenzstand', 'Reference version') }} V{{ latestSpec.version }}</strong><span class="text-zinc-500">{{ latestSpec.entries.length }} {{ say('Ansichten', 'views') }} · {{ date(latestSpec.createdAt) }}</span><span class="ml-auto font-mono text-[11px] text-zinc-400">{{ latestSpec.snapshotId.slice(0, 8) }}</span>
      </div>

      <div v-if="!data.linkedViews.length && !active" class="mt-6 grid place-items-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
        <span class="grid size-12 place-items-center rounded-xl bg-white text-teal-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-teal-300 dark:ring-zinc-800"><UIcon name="i-lucide-panels-top-left" class="size-5" /></span>
        <h3 class="mt-5 text-lg font-semibold text-zinc-950 dark:text-white">{{ say('Ein Platz für den visuellen Teil.', 'A place for the visual work.') }}</h3>
        <p class="mt-2 max-w-lg text-sm leading-6 text-zinc-500 dark:text-zinc-400">{{ say('Entwirf die Oberfläche im Showroom oder verknüpfe Ansichten, die es bereits gibt.', 'Design the interface in the Showroom or link views that already exist.') }}</p>
        <div class="mt-5 flex flex-wrap justify-center gap-2"><UButton icon="i-lucide-sparkles" class="!bg-teal-700 !text-white hover:!bg-teal-800" :label="say('Im Showroom entwerfen', 'Design in Showroom')" @click="openCreate()" /><UButton color="neutral" variant="outline" icon="i-lucide-link" :label="say('Bestehendes verknüpfen', 'Link existing')" @click="panel = 'link'" /></div>
      </div>

      <div v-else-if="data.linkedViews.length" class="mt-6 space-y-8">
        <section v-for="group in groups" :key="group.category">
          <div class="mb-3 flex items-center gap-2"><UIcon name="i-lucide-folder" class="size-4 text-zinc-400" /><h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ group.category }}</h3><UBadge color="neutral" variant="soft" size="sm">{{ group.views.length }}</UBadge><UButton v-if="categoryLink(group.category)" class="ml-auto" color="neutral" variant="ghost" size="xs" icon="i-lucide-unlink" :label="say('Ordner lösen', 'Unlink folder')" :loading="busy" @click="removeLink(categoryLink(group.category)!)" /></div>
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article v-for="view in group.views" :key="view.path" class="group overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-teal-300 dark:bg-zinc-950 dark:ring-zinc-800 dark:hover:ring-teal-800">
              <button type="button" class="block aspect-[16/10] w-full overflow-hidden bg-zinc-100 text-left dark:bg-zinc-900" @click="openView(view)"><iframe :src="previewUrl(view)" :title="view.title" tabindex="-1" sandbox="allow-scripts" class="h-[160%] w-[160%] origin-top-left scale-[.625] pointer-events-none" /></button>
              <div class="p-3.5"><div class="flex items-start gap-2"><button type="button" class="min-w-0 flex-1 text-left" @click="openView(view)"><strong class="block truncate text-sm text-zinc-950 dark:text-white">{{ view.title }}</strong><span class="mt-1 block truncate font-mono text-[11px] text-zinc-500">{{ view.path }}</span></button><button v-if="viewLink(view) && !categoryLink(group.category)" type="button" class="rounded-md p-1.5 text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" :aria-label="say('Verknüpfung entfernen', 'Remove link')" @click="removeLink(viewLink(view)!)"><UIcon name="i-lucide-unlink" class="size-4" /></button></div></div>
            </article>
          </div>
        </section>
        <section v-if="data.feedback.length" class="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><h3 class="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white"><UIcon name="i-lucide-message-square" class="size-4 text-teal-700 dark:text-teal-300" />Feedback <UBadge color="neutral" variant="soft" size="sm">{{ data.feedback.filter(item => item.status !== 'resolved').length }}</UBadge></h3><p class="mt-1 text-xs text-zinc-500">{{ say('Rückmeldungen aus den verknüpften Ansichten bleiben bei dieser Aufgabe.', 'Comments from linked views stay with this task.') }}</p></div>
            <UButton v-if="data.feedback.some(item => item.status !== 'resolved')" color="neutral" variant="outline" size="sm" icon="i-lucide-refresh-cw" :label="say('Mit Feedback überarbeiten', 'Revise with feedback')" :disabled="Boolean(active)" @click="openCreate(true)" />
          </div>
          <div class="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            <article v-for="row in data.feedback" :key="row.id" class="flex flex-col gap-2 py-3 first:pt-1 sm:flex-row sm:items-start">
              <button type="button" class="min-w-0 flex-1 text-left" @click="openFeedback(row)"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ row.authorName }}</strong><UBadge :color="row.status === 'resolved' ? 'success' : row.status === 'in_progress' ? 'warning' : 'primary'" variant="soft" size="sm">{{ row.status === 'resolved' ? say('Erledigt', 'Resolved') : row.status === 'in_progress' ? say('In Überarbeitung', 'In progress') : say('Offen', 'Open') }}</UBadge><span class="font-mono text-[11px] text-zinc-400">{{ row.viewPath }}</span></div><p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ row.body }}</p></button>
              <UButton v-if="row.status !== 'resolved'" color="neutral" variant="ghost" size="xs" icon="i-lucide-check" :label="say('Erledigt', 'Resolve')" :loading="busy" @click="resolveFeedback(row)" />
            </article>
          </div>
        </section>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800"><p class="text-xs text-zinc-500">{{ say('Feedback aus der Vorschau bleibt direkt mit dieser Aufgabe verbunden.', 'Feedback from the preview stays connected to this task.') }}</p><UButton color="neutral" variant="outline" icon="i-lucide-bookmark-check" :label="say('Referenzstand festhalten', 'Save reference version')" @click="specPaths = data.linkedViews.map(view => view.path); panel = 'spec'" /></div>
      </div>

      <ShowroomViewer v-if="selectedView && viewerLibrary" :key="selectedView.path + viewerLibrary.snapshotId" :initial-view="selectedView" :library="viewerLibrary" :endpoint="endpoint" :locale="locale" :task-id="taskId" :focus-feedback="focusFeedback" @close="selectedView = null; focusFeedback = null; refresh({ quiet: true })" @saved="refresh({ quiet: true })" />
    </template>
  </section>
</template>
