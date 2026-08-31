<script setup lang="ts">
type FeedbackScope = 'view' | 'all';

export interface VisualRefinementArtifact {
  id: string;
  title: string;
  caption?: string | null;
  route?: string | null;
  viewport?: string | null;
  url: string;
  baselineUrl?: string | null;
}

export interface VisualRefinementComment {
  id: string;
  authorName?: string | null;
  body: string;
  scope: FeedbackScope;
  artifactId: string | null;
  x: number | null;
  y: number | null;
  resolvedAt?: string | null;
  incorporatedByRefinementId?: string | null;
}

export interface VisualRefinementRun {
  id: string;
  version: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_input';
  brief?: string | null;
  resultMarkdown?: string | null;
  appliedAt?: string | null;
  error?: string | null;
  createdAt: string;
  visualSettings?: { desktop: boolean; mobile: boolean; states: boolean };
  artifacts: VisualRefinementArtifact[];
  comments: VisualRefinementComment[];
}

const props = withDefaults(defineProps<{
  locale?: 'de' | 'en';
  runs?: VisualRefinementRun[];
  currentRun?: VisualRefinementRun | null;
  initialBrief?: string;
  busy?: boolean;
  taskReady?: boolean;
  canComment?: boolean;
}>(), {
  locale: 'de',
  runs: () => [],
  currentRun: null,
  initialBrief: '',
  busy: false,
  taskReady: true,
  canComment: true,
});

const emit = defineEmits<{
  start: [payload: { brief: string; visualSettings: { desktop: boolean; mobile: boolean; states: boolean } }];
  apply: [runId: string];
  iterate: [runId: string];
  selectRun: [runId: string];
  addComment: [runId: string, payload: { scope: FeedbackScope; artifactId: string | null; x: number | null; y: number | null; body: string }];
  updateComment: [runId: string, payload: { commentId: string; resolved: boolean }];
  requestTaskDetails: [];
} >();

const copy = computed(() => props.locale === 'de' ? {
  title: 'Visueller Entwurf', briefLabel: 'UI-Ziel', briefPlaceholder: 'Was soll neu entstehen oder sich verändern?', screens: 'Ansichten',
  desktop: 'Desktop', mobile: 'Mobil', states: 'Sonderzustände', start: 'Entwurf starten', titleRequired: 'Gib der Aufgabe zuerst einen Titel.',
  queued: 'Entwurf ist vorgemerkt', running: 'UI-Entwurf wird gerendert', runningHint: 'Die echte Anwendung läuft im isolierten Task-Worktree.',
  status: 'Bereit für Review', compare: 'Vergleichen', stopCompare: 'Vergleich schliessen', open: 'Original öffnen', previous: 'Vorherige Ansicht', next: 'Nächste Ansicht',
  screensLabel: 'Ansichten', feedback: 'Feedback', openComments: 'offen', resolved: 'Erledigt', resolve: 'Erledigen', reopen: 'Wieder öffnen',
  placeholder: 'Änderungswunsch beschreiben …', add: 'Hinzufügen', iterate: 'Neue Iteration', iterateWith: 'Neue Iteration · {count}', apply: 'In Task übernehmen', applied: 'Übernommen',
  addPin: 'Pin setzen', removePin: 'Ohne Pin', placePin: 'Position im Screenshot anklicken', thisView: 'Diese Ansicht', allViews: 'Alle Ansichten',
  noScreens: 'Der Lauf ist abgeschlossen, hat aber keine Screens geliefert.', failed: 'Der visuelle Entwurf konnte nicht abgeschlossen werden.', newAttempt: 'Neuen Entwurf starten', history: 'Version wählen',
} : {
  title: 'Visual proposal', briefLabel: 'UI goal', briefPlaceholder: 'What should be created or changed?', screens: 'Views',
  desktop: 'Desktop', mobile: 'Mobile', states: 'Edge states', start: 'Start proposal', titleRequired: 'Add a task title first.',
  queued: 'Proposal is queued', running: 'Rendering UI proposal', runningHint: 'The real application is running in the isolated task worktree.',
  status: 'Ready for review', compare: 'Compare', stopCompare: 'Close comparison', open: 'Open original', previous: 'Previous view', next: 'Next view',
  screensLabel: 'Views', feedback: 'Feedback', openComments: 'open', resolved: 'Resolved', resolve: 'Resolve', reopen: 'Reopen',
  placeholder: 'Describe the change …', add: 'Add', iterate: 'New iteration', iterateWith: 'New iteration · {count}', apply: 'Add to task', applied: 'Applied',
  addPin: 'Add pin', removePin: 'Without pin', placePin: 'Click a position in the screenshot', thisView: 'This view', allViews: 'All views',
  noScreens: 'The run completed without screenshots.', failed: 'The visual proposal could not be completed.', newAttempt: 'Start a new proposal', history: 'Choose version',
});

const initialRun = props.currentRun ?? props.runs[0] ?? null;
const brief = ref(initialRun?.brief?.trim() || props.initialBrief);
const targets = reactive({ ...(initialRun?.visualSettings ?? { desktop: true, mobile: true, states: false }) });
const activeArtifactIndex = ref(0);
const compareMode = ref(false);
const comparePosition = ref(48);
const feedbackDraft = ref('');
const feedbackScope = ref<FeedbackScope>('view');
const pinMode = ref(false);
const draftPin = ref<{ x: number; y: number } | null>(null);

const activeRun = computed(() => props.currentRun ?? props.runs[0] ?? null);
const state = computed(() => {
  if (!activeRun.value || ['failed', 'cancelled'].includes(activeRun.value.status)) return 'start';
  if (['queued', 'running', 'awaiting_input'].includes(activeRun.value.status)) return 'running';
  return 'review';
});
const artifacts = computed(() => activeRun.value?.artifacts ?? []);
const activeArtifact = computed(() => artifacts.value[activeArtifactIndex.value] ?? null);
const comments = computed(() => activeRun.value?.comments ?? []);
const openComments = computed(() => comments.value.filter((comment) => !comment.resolvedAt && !comment.incorporatedByRefinementId));
const visibleComments = computed(() => comments.value.filter((comment) => comment.scope === 'all' || comment.artifactId === activeArtifact.value?.id));
const visiblePins = computed(() => visibleComments.value.filter((comment) => comment.x !== null && comment.y !== null));
const canIterate = computed(() => Boolean(activeRun.value && openComments.value.length && !props.busy));
const iterateLabel = computed(() => openComments.value.length
  ? copy.value.iterateWith.replace('{count}', String(openComments.value.length))
  : copy.value.iterate);
const failureDescription = computed(() => {
  const code = activeRun.value?.error;
  if (!code || code === 'refinement_failed') return props.locale === 'de'
    ? 'Du kannst den Entwurf mit denselben Angaben erneut starten.'
    : 'You can start the proposal again with the same settings.';
  if (code === 'refinement_capacity') return props.locale === 'de'
    ? 'Das KI-Modell war vorübergehend ausgelastet. Du kannst den Entwurf erneut starten.'
    : 'The AI model was temporarily at capacity. You can start the proposal again.';
  if (code === 'refinement_timeout') return props.locale === 'de' ? 'Der Render-Lauf hat zu lange gedauert.' : 'The render run took too long.';
  if (code === 'refinement_master_sync_failed') return props.locale === 'de' ? 'Der Task-Worktree konnte nicht vorbereitet werden.' : 'The task worktree could not be prepared.';
  return props.locale === 'de' ? 'Der Render-Lauf wurde sicher beendet.' : 'The render run was stopped safely.';
});

watch(() => props.initialBrief, (value) => { if (!brief.value.trim()) brief.value = value; });
watch(() => activeRun.value?.id, () => {
  brief.value = activeRun.value?.brief?.trim() || props.initialBrief;
  Object.assign(targets, activeRun.value?.visualSettings ?? { desktop: true, mobile: true, states: false });
  activeArtifactIndex.value = 0;
  compareMode.value = false;
  resetPin();
});

function startRun() {
  if (!props.taskReady) { emit('requestTaskDetails'); return; }
  if (!brief.value.trim() || props.busy) return;
  emit('start', { brief: brief.value.trim(), visualSettings: { ...targets } });
}

function selectArtifact(index: number) {
  activeArtifactIndex.value = index;
  compareMode.value = false;
  resetPin();
}

function stepArtifact(direction: -1 | 1) {
  if (!artifacts.value.length) return;
  selectArtifact((activeArtifactIndex.value + direction + artifacts.value.length) % artifacts.value.length);
}

function setFeedbackScope(scope: FeedbackScope) {
  feedbackScope.value = scope;
  resetPin();
}

function togglePinMode() {
  if (draftPin.value) { resetPin(); return; }
  pinMode.value = !pinMode.value;
}

function placePin(event: MouseEvent) {
  if (!pinMode.value || compareMode.value || !activeArtifact.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  draftPin.value = {
    x: Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)) * 100),
    y: Math.round(Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)) * 100),
  };
  pinMode.value = false;
}

function resetPin() { pinMode.value = false; draftPin.value = null; }

function addFeedback() {
  if (!activeRun.value || !feedbackDraft.value.trim() || !props.canComment) return;
  emit('addComment', activeRun.value.id, {
    scope: feedbackScope.value,
    artifactId: feedbackScope.value === 'view' ? activeArtifact.value?.id ?? null : null,
    x: feedbackScope.value === 'view' ? draftPin.value?.x ?? null : null,
    y: feedbackScope.value === 'view' ? draftPin.value?.y ?? null : null,
    body: feedbackDraft.value.trim(),
  });
  feedbackDraft.value = '';
  resetPin();
}

function toggleComment(comment: VisualRefinementComment) {
  if (!activeRun.value || comment.incorporatedByRefinementId) return;
  emit('updateComment', activeRun.value.id, { commentId: comment.id, resolved: !comment.resolvedAt });
}
</script>

<template>
  <section class="min-w-0" aria-labelledby="visual-refinement-title">
    <form v-if="state === 'start'" class="mx-auto max-w-3xl p-5 sm:p-8" @submit.prevent="startRun">
      <div class="flex items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-teal-700 dark:bg-zinc-900 dark:text-teal-300"><UIcon name="i-lucide-panels-top-left" class="size-4.5" /></span>
          <h2 id="visual-refinement-title" class="text-base font-semibold text-zinc-950 dark:text-white">{{ copy.title }}</h2>
        </div>
        <select v-if="runs.length > 1" class="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200" :aria-label="copy.history" :value="activeRun?.id" @change="emit('selectRun', ($event.target as HTMLSelectElement).value)"><option v-for="run in runs" :key="run.id" :value="run.id">V{{ run.version }}</option></select>
        <UBadge v-else-if="activeRun" color="neutral" variant="soft" size="sm">V{{ activeRun.version }}</UBadge>
      </div>
      <UAlert v-if="activeRun?.status === 'failed'" class="mt-5" color="error" variant="soft" icon="i-lucide-circle-alert" :title="copy.failed" :description="failureDescription" />
      <UAlert v-if="!taskReady" class="mt-5" color="warning" variant="soft" icon="i-lucide-heading-1" :description="copy.titleRequired" />
      <div class="grid gap-5 pt-5">
        <UFormField :label="copy.briefLabel" required size="lg">
          <UTextarea v-model="brief" class="w-full" :rows="4" :placeholder="copy.briefPlaceholder" size="xl" autoresize :disabled="busy" />
        </UFormField>
        <fieldset>
          <legend class="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ copy.screens }}</legend>
          <div class="flex flex-wrap gap-2">
            <button v-for="target in [{ key: 'desktop', label: copy.desktop, icon: 'i-lucide-monitor' }, { key: 'mobile', label: copy.mobile, icon: 'i-lucide-smartphone' }, { key: 'states', label: copy.states, icon: 'i-lucide-gallery-vertical-end' }]" :key="target.key" type="button" class="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition" :class="targets[target.key as keyof typeof targets] ? 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/35 dark:text-teal-200 dark:ring-teal-800' : 'bg-white text-zinc-600 ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-700'" :aria-pressed="targets[target.key as keyof typeof targets]" @click="targets[target.key as keyof typeof targets] = !targets[target.key as keyof typeof targets]">
              <UIcon :name="target.icon" class="size-4" />{{ target.label }}<UIcon v-if="targets[target.key as keyof typeof targets]" name="i-lucide-check" class="size-3.5" />
            </button>
          </div>
        </fieldset>
        <div class="flex justify-end border-t border-zinc-200 pt-5 dark:border-zinc-800"><UButton type="submit" size="lg" icon="i-lucide-sparkles" class="!bg-teal-700 !text-white hover:!bg-teal-800" :loading="busy" :disabled="!brief.trim()">{{ activeRun?.status === 'failed' ? copy.newAttempt : copy.start }}</UButton></div>
      </div>
    </form>

    <div v-else-if="state === 'running'" class="mx-auto max-w-2xl px-5 py-14 text-center" role="status" aria-live="polite">
      <span class="relative mx-auto grid size-12 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"><span class="absolute inset-0 rounded-xl ring-1 ring-teal-500/25 ak-visual-pulse" /><UIcon name="i-lucide-panels-top-left" class="size-5" /></span>
      <h2 id="visual-refinement-title" class="mt-4 text-base font-semibold text-zinc-950 dark:text-white">{{ activeRun?.status === 'queued' ? copy.queued : copy.running }}</h2>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ copy.runningHint }}</p>
      <div class="mx-auto mt-7 h-1.5 max-w-md overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><span class="ak-visual-progress block h-full w-1/3 rounded-full bg-teal-600" /></div>
    </div>

    <div v-else class="min-w-0">
      <header class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-zinc-800">
        <div class="flex min-w-0 flex-wrap items-center gap-2"><h2 id="visual-refinement-title" class="text-base font-semibold text-zinc-950 dark:text-white">{{ copy.title }}</h2><select v-if="runs.length > 1" class="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200" :aria-label="copy.history" :value="activeRun?.id" @change="emit('selectRun', ($event.target as HTMLSelectElement).value)"><option v-for="run in runs" :key="run.id" :value="run.id">V{{ run.version }}</option></select><UBadge v-else color="neutral" variant="soft" size="sm">V{{ activeRun?.version }}</UBadge><UBadge :color="activeRun?.appliedAt ? 'success' : 'primary'" variant="soft" size="sm" :icon="activeRun?.appliedAt ? 'i-lucide-check' : 'i-lucide-eye'">{{ activeRun?.appliedAt ? copy.applied : copy.status }}</UBadge></div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton v-if="activeArtifact?.baselineUrl" color="neutral" variant="soft" icon="i-lucide-git-compare-arrows" :label="compareMode ? copy.stopCompare : copy.compare" @click="compareMode = !compareMode; resetPin()" />
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :label="iterateLabel" :disabled="!canIterate" :loading="busy" @click="activeRun && emit('iterate', activeRun.id)" />
          <UButton v-if="!activeRun?.appliedAt" icon="i-lucide-clipboard-check" class="!bg-teal-700 !text-white hover:!bg-teal-800" :label="copy.apply" :loading="busy" @click="activeRun && emit('apply', activeRun.id)" />
        </div>
      </header>

      <div v-if="activeArtifact" class="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 bg-zinc-100/70 p-3 sm:p-4 dark:bg-zinc-900/50">
          <div class="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-300 dark:ring-zinc-700">
            <div class="flex min-h-10 items-center justify-between gap-3 border-b border-white/10 px-3 text-zinc-300"><div class="min-w-0"><p class="truncate text-xs font-semibold text-white">{{ activeArtifact.title }}</p><p class="truncate text-[11px] text-zinc-400">{{ activeArtifact.route }}<template v-if="activeArtifact.viewport"> · {{ activeArtifact.viewport }}</template></p></div><div class="flex shrink-0 items-center gap-1"><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-left" :aria-label="copy.previous" @click="stepArtifact(-1)" /><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-right" :aria-label="copy.next" @click="stepArtifact(1)" /><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-external-link" :aria-label="copy.open" :to="activeArtifact.url" target="_blank" /></div></div>
            <div class="relative flex aspect-[16/9] min-h-72 items-center justify-center overflow-hidden bg-zinc-900" :class="pinMode ? 'cursor-crosshair ring-2 ring-inset ring-amber-400' : ''" @click="placePin">
              <img :src="activeArtifact.url" :alt="activeArtifact.title" class="h-full w-full object-contain" />
              <button v-for="(comment, index) in visiblePins" :key="comment.id" class="ak-visual-pin" :class="comment.resolvedAt ? 'opacity-55 grayscale' : ''" :style="{ left: `${(comment.x || 0) / 100}%`, top: `${(comment.y || 0) / 100}%` }" type="button">{{ index + 1 }}</button>
              <span v-if="draftPin" class="ak-visual-pin ak-visual-pin-draft" :style="{ left: `${draftPin.x / 100}%`, top: `${draftPin.y / 100}%` }">+</span>
              <span v-if="pinMode" class="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-zinc-950/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">{{ copy.placePin }}</span>
              <template v-if="compareMode && activeArtifact.baselineUrl"><div class="pointer-events-none absolute inset-0 overflow-hidden" :style="{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }"><img :src="activeArtifact.baselineUrl" alt="" class="h-full w-full object-contain" /></div><div class="pointer-events-none absolute inset-y-0 w-px bg-white" :style="{ left: `${comparePosition}%` }" /><input v-model.number="comparePosition" class="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" type="range" min="12" max="88" :aria-label="copy.compare" /></template>
            </div>
          </div>
          <div v-if="artifacts.length > 1" class="mt-3"><p class="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{{ copy.screensLabel }}</p><div class="grid grid-cols-2 gap-2 sm:grid-cols-3"><button v-for="(artifact, index) in artifacts" :key="artifact.id" type="button" class="min-w-0 overflow-hidden rounded-lg bg-white text-left ring-1 transition dark:bg-zinc-950" :class="activeArtifactIndex === index ? 'ring-2 ring-teal-600' : 'ring-zinc-300 dark:ring-zinc-700'" @click="selectArtifact(index)"><span class="block aspect-[16/6.5] overflow-hidden bg-zinc-900"><img :src="artifact.url" alt="" class="h-full w-full object-cover object-top" /></span><span class="flex min-w-0 items-center gap-1.5 px-2.5 py-2"><span class="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{{ artifact.title }}</span><span v-if="comments.some((comment) => !comment.resolvedAt && comment.artifactId === artifact.id)" class="ml-auto size-1.5 rounded-full bg-amber-400" /></span></button></div></div>
        </div>

        <aside class="min-w-0 border-t border-zinc-200 bg-white lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"><h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ copy.feedback }}</h3><UBadge color="warning" variant="soft" size="sm">{{ openComments.length }} {{ copy.openComments }}</UBadge></div>
          <div v-if="visibleComments.length" class="max-h-[19rem] divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800"><article v-for="(comment, index) in visibleComments" :key="comment.id" class="px-4 py-3.5"><div class="flex items-start gap-2.5"><span class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold" :class="comment.x !== null && !comment.resolvedAt ? 'bg-amber-400 text-amber-950' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"><template v-if="comment.x !== null">{{ index + 1 }}</template><UIcon v-else name="i-lucide-message-square" class="size-3.5" /></span><div class="min-w-0 flex-1"><div class="flex justify-between gap-2"><p class="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{{ comment.authorName || 'Team' }}</p><span v-if="comment.resolvedAt" class="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{{ copy.resolved }}</span></div><p class="mt-1.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ comment.body }}</p><button v-if="!comment.incorporatedByRefinementId && canComment" type="button" class="mt-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300" @click="toggleComment(comment)">{{ comment.resolvedAt ? copy.reopen : copy.resolve }}</button></div></div></article></div>
          <form v-if="canComment" class="border-t border-zinc-200 p-4 dark:border-zinc-800" @submit.prevent="addFeedback"><div class="mb-2 inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900" role="group"><button type="button" class="min-h-7 rounded-md px-2.5 text-xs font-semibold" :class="feedbackScope === 'view' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-600'" @click="setFeedbackScope('view')">{{ copy.thisView }}</button><button type="button" class="min-h-7 rounded-md px-2.5 text-xs font-semibold" :class="feedbackScope === 'all' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-600'" @click="setFeedbackScope('all')">{{ copy.allViews }}</button></div><UTextarea v-model="feedbackDraft" class="w-full" :rows="2" :placeholder="copy.placeholder" autoresize /><div class="mt-2 flex items-center justify-between gap-2"><UButton v-if="feedbackScope === 'view'" type="button" color="neutral" :variant="pinMode || draftPin ? 'soft' : 'ghost'" size="sm" :icon="draftPin ? 'i-lucide-map-pin-check' : 'i-lucide-map-pin-plus'" :label="draftPin ? copy.removePin : copy.addPin" @click="togglePinMode" /><span v-else /><UButton type="submit" size="sm" icon="i-lucide-send" class="!bg-teal-700 !text-white" :loading="busy" :disabled="!feedbackDraft.trim()">{{ copy.add }}</UButton></div></form>
        </aside>
      </div>
      <p v-else class="p-8 text-center text-sm text-zinc-500">{{ copy.noScreens }}</p>
    </div>
  </section>
</template>

<style scoped>
.ak-visual-pin { position:absolute;display:grid;width:1.7rem;height:1.7rem;transform:translate(-50%,-50%);place-items:center;border:2px solid white;border-radius:999px;background:rgb(251 191 36);color:rgb(66 32 6);font-size:.75rem;font-weight:800;box-shadow:0 2px 6px rgb(0 0 0/.35) }
.ak-visual-pin-draft { border-style:dashed;background:rgb(254 243 199) }
.ak-visual-pulse { animation:ak-visual-pulse 1.8s cubic-bezier(.22,1,.36,1) infinite }
.ak-visual-progress { animation:ak-visual-progress 1.8s ease-in-out infinite }
@keyframes ak-visual-pulse { 0%,100%{transform:scale(1);opacity:.25}50%{transform:scale(1.16);opacity:0} }
@keyframes ak-visual-progress { 0%{transform:translateX(-120%)}100%{transform:translateX(420%)} }
@media (prefers-reduced-motion:reduce){.ak-visual-pulse,.ak-visual-progress{animation:none}}
</style>
