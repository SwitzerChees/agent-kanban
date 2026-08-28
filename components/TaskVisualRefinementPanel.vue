<script setup lang="ts">
type VisualRefinementState = 'start' | 'running' | 'review';
type FeedbackScope = 'view' | 'all';

interface VisualArtifact {
  id: string;
  title: string;
  context: string;
  viewport: string;
  src: string;
}

interface VisualComment {
  id: number;
  author: string;
  body: string;
  resolved: boolean;
  scope: FeedbackScope;
  artifactId: string | null;
  x: number | null;
  y: number | null;
}

const props = withDefaults(defineProps<{
  locale?: 'de' | 'en';
  initialBrief?: string;
  initialState?: 'start' | 'review';
}>(), {
  locale: 'de',
  initialBrief: '',
  initialState: 'start',
});

const emit = defineEmits<{
  apply: [];
}>();

const copy = computed(() => props.locale === 'de' ? {
  title: 'Visueller Entwurf',
  intro: 'Beschreibe die gewünschte UI-Änderung und wähle die relevanten Ansichten.',
  briefLabel: 'UI-Ziel',
  briefPlaceholder: 'Was soll neu entstehen oder sich verändern?',
  screens: 'Ansichten',
  desktop: 'Desktop',
  mobile: 'Mobil',
  states: 'Leer- und Fehlerzustände',
  start: 'Entwurf starten',
  runningTitle: 'UI-Entwurf wird gerendert',
  runningDescription: 'Die echte Anwendung läuft im isolierten Task-Worktree.',
  runningSteps: ['Ausgangsstand prüfen', 'UI umsetzen', 'Screens rendern'],
  status: 'Bereit für Review',
  resultTitle: 'Visueller Entwurf',
  compare: 'Vergleichen',
  stopCompare: 'Vergleich schliessen',
  open: 'Original öffnen',
  previous: 'Vorheriger Screen',
  next: 'Nächster Screen',
  screensLabel: 'Ansichten',
  reviewTitle: 'Feedback',
  openComments: 'offen',
  resolved: 'Erledigt',
  resolve: 'Erledigen',
  reopen: 'Wieder öffnen',
  feedbackPlaceholder: 'Änderungswunsch beschreiben …',
  addFeedback: 'Hinzufügen',
  iterate: 'Neue Iteration',
  iterateWith: 'Neue Iteration · {count}',
  apply: 'In Task übernehmen',
  addPin: 'Pin setzen',
  removePin: 'Ohne Pin',
  placePin: 'Position im Screenshot anklicken',
  thisView: 'Diese Ansicht',
  allViews: 'Alle Ansichten',
  global: 'Alle Ansichten',
  route: 'Agent Kanban · Task-Dialog',
} : {
  title: 'Visual proposal',
  intro: 'Describe the UI change and choose the relevant views.',
  briefLabel: 'UI goal',
  briefPlaceholder: 'What should be created or changed?',
  screens: 'Views',
  desktop: 'Desktop',
  mobile: 'Mobile',
  states: 'Empty and error states',
  start: 'Start proposal',
  runningTitle: 'Rendering UI proposal',
  runningDescription: 'The real application is running in the isolated task worktree.',
  runningSteps: ['Inspect baseline', 'Implement UI', 'Render screens'],
  status: 'Ready for review',
  resultTitle: 'Visual proposal',
  compare: 'Compare',
  stopCompare: 'Close comparison',
  open: 'Open original',
  previous: 'Previous screen',
  next: 'Next screen',
  screensLabel: 'Views',
  reviewTitle: 'Feedback',
  openComments: 'open',
  resolved: 'Resolved',
  resolve: 'Resolve',
  reopen: 'Reopen',
  feedbackPlaceholder: 'Describe the change …',
  addFeedback: 'Add',
  iterate: 'New iteration',
  iterateWith: 'New iteration · {count}',
  apply: 'Add to task',
  addPin: 'Add pin',
  removePin: 'Without pin',
  placePin: 'Click a position in the screenshot',
  thisView: 'This view',
  allViews: 'All views',
  global: 'All views',
  route: 'Agent Kanban · Task dialog',
});

const state = ref<VisualRefinementState>(props.initialState);
const brief = ref(props.initialBrief || 'Das visuelle Refinement soll direkt im Task funktionieren. Screens müssen sich kommentieren, iterieren und in den Task übernehmen lassen.');
const targets = reactive({ desktop: true, mobile: true, states: false });
const activeArtifactIndex = ref(0);
const compareMode = ref(false);
const comparePosition = ref(48);
const feedbackDraft = ref('');
const feedbackScope = ref<FeedbackScope>('view');
const pinMode = ref(false);
const draftPin = ref<{ x: number; y: number } | null>(null);
const version = ref(2);
let renderTimer: ReturnType<typeof setTimeout> | null = null;

const artifacts: VisualArtifact[] = [
  {
    id: 'task-entry',
    title: props.locale === 'de' ? 'Einstieg im Task' : 'Task entry',
    context: copy.value.route,
    viewport: '1440 × 900',
    src: '/prototypes/visual-refinement-start.png',
  },
  {
    id: 'review',
    title: props.locale === 'de' ? 'Review & Feedback' : 'Review & feedback',
    context: copy.value.route,
    viewport: '1440 × 900',
    src: '/prototypes/visual-refinement-current.png',
  },
  {
    id: 'mobile',
    title: props.locale === 'de' ? 'Mobile Ansicht' : 'Mobile view',
    context: copy.value.route,
    viewport: '390 × 844',
    src: '/prototypes/visual-refinement-mobile.png',
  },
];

const comments = ref<VisualComment[]>([
  {
    id: 1,
    author: 'Patrick Michel',
    body: props.locale === 'de'
      ? 'Die Auswahl zwischen Refinement und visuellem Entwurf soll hier ruhiger wirken.'
      : 'Make the choice between refinement and visual proposal feel calmer here.',
    resolved: false,
    scope: 'view',
    artifactId: 'task-entry',
    x: 62,
    y: 67,
  },
  {
    id: 2,
    author: 'Patrick Michel',
    body: props.locale === 'de'
      ? 'Beschreibende Texte in allen Ansichten weiter reduzieren.'
      : 'Reduce explanatory copy across all views.',
    resolved: false,
    scope: 'all',
    artifactId: null,
    x: null,
    y: null,
  },
]);

const activeArtifact = computed(() => artifacts[activeArtifactIndex.value] || artifacts[0]!);
const visibleComments = computed(() => comments.value.filter((comment) => comment.scope === 'all' || comment.artifactId === activeArtifact.value.id));
const visiblePins = computed(() => visibleComments.value.filter((comment) => comment.artifactId === activeArtifact.value.id && comment.x !== null && comment.y !== null));
const openCommentCount = computed(() => comments.value.filter((comment) => !comment.resolved).length);
const iterateLabel = computed(() => openCommentCount.value
  ? copy.value.iterateWith.replace('{count}', String(openCommentCount.value))
  : copy.value.iterate);

function startRun() {
  if (!brief.value.trim()) return;
  state.value = 'running';
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    state.value = 'review';
  }, 900);
}

function startIteration() {
  state.value = 'running';
  compareMode.value = false;
  resetPin();
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    version.value += 1;
    comments.value = comments.value.map((comment) => ({ ...comment, resolved: true }));
    state.value = 'review';
  }, 900);
}

function addFeedback() {
  const body = feedbackDraft.value.trim();
  if (!body) return;
  const nextId = Math.max(0, ...comments.value.map((comment) => comment.id)) + 1;
  const viewScoped = feedbackScope.value === 'view';
  comments.value.push({
    id: nextId,
    author: 'Patrick Michel',
    body,
    resolved: false,
    scope: feedbackScope.value,
    artifactId: viewScoped ? activeArtifact.value.id : null,
    x: viewScoped ? draftPin.value?.x ?? null : null,
    y: viewScoped ? draftPin.value?.y ?? null : null,
  });
  feedbackDraft.value = '';
  resetPin();
}

function setFeedbackScope(scope: FeedbackScope) {
  feedbackScope.value = scope;
  if (scope === 'all') resetPin();
}

function togglePinMode() {
  if (draftPin.value) {
    resetPin();
    return;
  }
  pinMode.value = !pinMode.value;
}

function placePin(event: MouseEvent) {
  if (!pinMode.value || compareMode.value || feedbackScope.value !== 'view') return;
  const target = event.currentTarget as HTMLElement;
  const bounds = target.getBoundingClientRect();
  draftPin.value = {
    x: Math.min(96, Math.max(4, ((event.clientX - bounds.left) / bounds.width) * 100)),
    y: Math.min(94, Math.max(6, ((event.clientY - bounds.top) / bounds.height) * 100)),
  };
  pinMode.value = false;
}

function resetPin() {
  pinMode.value = false;
  draftPin.value = null;
}

function toggleComment(comment: VisualComment) {
  comment.resolved = !comment.resolved;
}

function selectArtifact(index: number) {
  activeArtifactIndex.value = index;
  compareMode.value = false;
  resetPin();
}

function stepArtifact(direction: -1 | 1) {
  selectArtifact((activeArtifactIndex.value + direction + artifacts.length) % artifacts.length);
}

function commentContext(comment: VisualComment) {
  if (comment.scope === 'all') return copy.value.global;
  return artifacts.find((artifact) => artifact.id === comment.artifactId)?.title || copy.value.thisView;
}

watch(() => props.initialState, (nextState) => {
  if (nextState === 'review') state.value = 'review';
});

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer);
});
</script>

<template>
  <section class="min-w-0" aria-labelledby="visual-refinement-title">
    <form v-if="state === 'start'" class="mx-auto max-w-3xl p-5 sm:p-8" @submit.prevent="startRun">
      <div class="flex min-w-0 items-start gap-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-teal-700 dark:bg-zinc-900 dark:text-teal-300">
          <UIcon name="i-lucide-panels-top-left" class="size-4.5" />
        </span>
        <div class="min-w-0">
          <h2 id="visual-refinement-title" class="text-base font-semibold text-zinc-950 dark:text-white">{{ copy.title }}</h2>
          <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ copy.intro }}</p>
        </div>
      </div>

      <div class="grid gap-5 pt-5">
        <UFormField :label="copy.briefLabel" required size="lg">
          <UTextarea v-model="brief" class="w-full" :rows="4" :placeholder="copy.briefPlaceholder" size="xl" autoresize />
        </UFormField>

        <fieldset>
          <legend class="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ copy.screens }}</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="target in [
                { key: 'desktop', label: copy.desktop, icon: 'i-lucide-monitor' },
                { key: 'mobile', label: copy.mobile, icon: 'i-lucide-smartphone' },
                { key: 'states', label: copy.states, icon: 'i-lucide-gallery-vertical-end' },
              ]"
              :key="target.key"
              type="button"
              class="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition"
              :class="targets[target.key as keyof typeof targets]
                ? 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/35 dark:text-teal-200 dark:ring-teal-800'
                : 'bg-white text-zinc-600 ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-900'"
              :aria-pressed="targets[target.key as keyof typeof targets]"
              @click="targets[target.key as keyof typeof targets] = !targets[target.key as keyof typeof targets]"
            >
              <UIcon :name="target.icon" class="size-4" />
              {{ target.label }}
              <UIcon v-if="targets[target.key as keyof typeof targets]" name="i-lucide-check" class="size-3.5" />
            </button>
          </div>
        </fieldset>

        <div class="flex justify-end border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <UButton type="submit" size="lg" icon="i-lucide-sparkles" class="!bg-teal-700 !text-white hover:!bg-teal-800" :disabled="!brief.trim()">{{ copy.start }}</UButton>
        </div>
      </div>
    </form>

    <div v-else-if="state === 'running'" class="mx-auto max-w-2xl px-5 py-12 sm:py-16" role="status" aria-live="polite">
      <div class="flex flex-col items-center text-center">
        <span class="relative grid size-12 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
          <span class="absolute inset-0 rounded-xl ring-1 ring-teal-500/25 ak-visual-pulse" aria-hidden="true" />
          <UIcon name="i-lucide-panels-top-left" class="size-5" />
        </span>
        <h2 id="visual-refinement-title" class="mt-4 text-base font-semibold text-zinc-950 dark:text-white">{{ copy.runningTitle }}</h2>
        <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ copy.runningDescription }}</p>
      </div>
      <ol class="mx-auto mt-7 max-w-lg divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <li v-for="(step, index) in copy.runningSteps" :key="step" class="flex min-h-11 items-center gap-3 py-2.5 text-sm">
          <span class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold" :class="index < 2 ? 'bg-teal-600 text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'">
            <UIcon v-if="index < 2" name="i-lucide-check" class="size-3.5" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span :class="index < 2 ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'">{{ step }}</span>
          <UIcon v-if="index === 1" name="i-lucide-loader-circle" class="ml-auto size-4 animate-spin text-teal-600" />
        </li>
      </ol>
    </div>

    <div v-else class="min-w-0">
      <header class="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-zinc-800">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id="visual-refinement-title" class="text-base font-semibold text-zinc-950 dark:text-white">{{ copy.resultTitle }}</h2>
          <UBadge color="neutral" variant="soft" size="sm">V{{ version }}</UBadge>
          <UBadge color="primary" variant="soft" size="sm" icon="i-lucide-eye" class="!text-teal-800 dark:!text-teal-200">{{ copy.status }}</UBadge>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton color="neutral" variant="soft" icon="i-lucide-git-compare-arrows" :label="compareMode ? copy.stopCompare : copy.compare" @click="compareMode = !compareMode; resetPin()" />
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :label="iterateLabel" @click="startIteration" />
          <UButton icon="i-lucide-clipboard-check" class="!bg-teal-700 !text-white hover:!bg-teal-800" :label="copy.apply" @click="emit('apply')" />
        </div>
      </header>

      <div class="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 bg-zinc-100/70 p-3 sm:p-4 dark:bg-zinc-900/50">
          <div class="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-300 dark:ring-zinc-700">
            <div class="flex min-h-10 items-center justify-between gap-3 border-b border-white/10 px-3 text-zinc-300">
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold text-white">{{ activeArtifact.title }}</p>
                <p class="truncate text-[11px] text-zinc-400">{{ activeArtifact.context }} · {{ activeArtifact.viewport }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-left" :aria-label="copy.previous" @click="stepArtifact(-1)" />
                <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-chevron-right" :aria-label="copy.next" @click="stepArtifact(1)" />
                <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-external-link" :aria-label="copy.open" :to="activeArtifact.src" target="_blank" />
              </div>
            </div>

            <div
              class="relative flex aspect-[16/8.9] min-h-72 items-center justify-center overflow-hidden bg-zinc-900"
              :class="pinMode ? 'cursor-crosshair ring-2 ring-inset ring-amber-400' : ''"
              @click="placePin"
            >
              <img :src="activeArtifact.src" :alt="activeArtifact.title" class="h-full w-full object-contain" />
              <button
                v-for="comment in visiblePins"
                :key="comment.id"
                class="ak-visual-pin"
                :class="comment.resolved ? 'opacity-55 grayscale' : ''"
                :style="{ left: `${comment.x}%`, top: `${comment.y}%` }"
                type="button"
                :aria-label="`${copy.reviewTitle} ${comment.id}`"
              >{{ comment.id }}</button>
              <span
                v-if="draftPin"
                class="ak-visual-pin ak-visual-pin-draft"
                :style="{ left: `${draftPin.x}%`, top: `${draftPin.y}%` }"
                aria-hidden="true"
              >+</span>
              <span v-if="pinMode" class="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-zinc-950/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">{{ copy.placePin }}</span>

              <template v-if="compareMode">
                <div class="pointer-events-none absolute inset-0 overflow-hidden" :style="{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }">
                  <img src="/prototypes/visual-refinement-current.png" alt="" class="h-full w-full object-contain" />
                </div>
                <div class="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]" :style="{ left: `${comparePosition}%` }">
                  <span class="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-zinc-900 shadow-md"><UIcon name="i-lucide-chevrons-left-right" class="size-4" /></span>
                </div>
                <input v-model.number="comparePosition" class="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" type="range" min="12" max="88" :aria-label="copy.compare" />
              </template>
            </div>
          </div>

          <div class="mt-3">
            <p class="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{{ copy.screensLabel }}</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="(artifact, index) in artifacts"
                :key="artifact.id"
                type="button"
                class="min-w-0 overflow-hidden rounded-lg bg-white text-left ring-1 transition dark:bg-zinc-950"
                :class="activeArtifactIndex === index ? 'ring-2 ring-teal-600' : 'ring-zinc-300 hover:ring-zinc-400 dark:ring-zinc-700'"
                @click="selectArtifact(index)"
              >
                <span class="block aspect-[16/6.5] overflow-hidden bg-zinc-900"><img :src="artifact.src" alt="" class="h-full w-full object-cover object-top" /></span>
                <span class="flex min-w-0 items-center gap-1.5 px-2.5 py-2">
                  <span class="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{{ artifact.title }}</span>
                  <span v-if="comments.some((comment) => !comment.resolved && comment.artifactId === artifact.id)" class="ml-auto size-1.5 shrink-0 rounded-full bg-amber-400" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <aside class="min-w-0 border-t border-zinc-200 bg-white lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ copy.reviewTitle }}</h3>
            <UBadge color="warning" variant="soft" size="sm" class="!text-amber-800 dark:!text-amber-200">{{ openCommentCount }} {{ copy.openComments }}</UBadge>
          </div>

          <div class="max-h-[19rem] divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            <article v-for="comment in visibleComments" :key="comment.id" class="px-4 py-3.5">
              <div class="flex items-start gap-2.5">
                <span v-if="comment.x !== null" class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold" :class="comment.resolved ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-amber-400 text-amber-950'">{{ comment.id }}</span>
                <span v-else class="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"><UIcon name="i-lucide-message-square" class="size-3.5" /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{{ comment.author }}</p>
                      <p class="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ commentContext(comment) }}<template v-if="comment.x !== null"> · Pin {{ comment.id }}</template></p>
                    </div>
                    <span v-if="comment.resolved" class="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><UIcon name="i-lucide-check" class="size-3" />{{ copy.resolved }}</span>
                  </div>
                  <p class="mt-1.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ comment.body }}</p>
                  <button type="button" class="mt-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-200" @click="toggleComment(comment)">{{ comment.resolved ? copy.reopen : copy.resolve }}</button>
                </div>
              </div>
            </article>
          </div>

          <form class="border-t border-zinc-200 p-4 dark:border-zinc-800" @submit.prevent="addFeedback">
            <div class="mb-2 inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900" role="group" :aria-label="copy.reviewTitle">
              <button type="button" class="min-h-7 rounded-md px-2.5 text-xs font-semibold transition" :class="feedbackScope === 'view' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'" @click="setFeedbackScope('view')">{{ copy.thisView }}</button>
              <button type="button" class="min-h-7 rounded-md px-2.5 text-xs font-semibold transition" :class="feedbackScope === 'all' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'" @click="setFeedbackScope('all')">{{ copy.allViews }}</button>
            </div>
            <UTextarea v-model="feedbackDraft" class="w-full" :rows="2" :placeholder="copy.feedbackPlaceholder" autoresize />
            <div class="mt-2 flex items-center justify-between gap-2">
              <UButton
                v-if="feedbackScope === 'view'"
                type="button"
                color="neutral"
                :variant="pinMode || draftPin ? 'soft' : 'ghost'"
                size="sm"
                :icon="draftPin ? 'i-lucide-map-pin-check' : 'i-lucide-map-pin-plus'"
                :label="draftPin ? copy.removePin : copy.addPin"
                @click="togglePinMode"
              />
              <span v-else class="text-[11px] text-zinc-400">{{ copy.allViews }}</span>
              <UButton type="submit" size="sm" icon="i-lucide-send" class="!bg-teal-700 !text-white hover:!bg-teal-800" :disabled="!feedbackDraft.trim()">{{ copy.addFeedback }}</UButton>
            </div>
          </form>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ak-visual-pin {
  position: absolute;
  display: grid;
  width: 1.7rem;
  height: 1.7rem;
  transform: translate(-50%, -50%);
  place-items: center;
  border: 2px solid white;
  border-radius: 999px;
  background: rgb(251 191 36);
  color: rgb(66 32 6);
  font-size: 0.75rem;
  font-weight: 800;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
}

.ak-visual-pin-draft {
  border-style: dashed;
  background: rgb(254 243 199);
}

.ak-visual-pulse {
  animation: ak-visual-pulse 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

@keyframes ak-visual-pulse {
  0%, 100% { transform: scale(1); opacity: 0.25; }
  50% { transform: scale(1.16); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ak-visual-pulse { animation: none; }
}
</style>
