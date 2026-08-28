<script setup lang="ts">
type VisualRefinementState = 'start' | 'running' | 'review' | 'approved';

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
}

const props = withDefaults(defineProps<{
  locale?: 'de' | 'en';
  initialBrief?: string;
}>(), {
  locale: 'de',
  initialBrief: '',
});

const copy = computed(() => props.locale === 'de' ? {
  title: 'Visueller Entwurf',
  intro: 'Codex öffnet die echte Anwendung, setzt die Idee in einem isolierten Worktree um und rendert daraus überprüfbare UI-Screenshots.',
  briefLabel: 'Was soll sich im UI ändern?',
  briefHint: 'Beschreibe Ziel, wichtigste Interaktion und was im bestehenden Interface erhalten bleiben soll.',
  briefPlaceholder: 'Zum Beispiel: Das visuelle Refinement soll direkt im Task funktionieren und Feedback an einzelnen Screens erlauben …',
  screens: 'Zielansichten',
  desktop: 'Desktop',
  mobile: 'Mobil',
  states: 'Leer- und Fehlerzustände',
  start: 'Visuellen Entwurf starten',
  startHint: 'Der Task bleibt geöffnet. Rendering und Iterationen laufen im Hintergrund weiter.',
  processTitle: 'Was der Lauf liefert',
  process: [
    ['Echte App', 'Die bestehende Anwendung wird im Task-Worktree gestartet.'],
    ['Mehrere Screens', 'Relevante Ansichten und Viewports werden als Artefakte festgehalten.'],
    ['Review im Task', 'Feedback, Varianten und die freigegebene Richtung bleiben versioniert.'],
  ],
  runningTitle: 'Die Anwendung wird visuell ausgearbeitet',
  runningDescription: 'Codex setzt den Vorschlag im isolierten Worktree um und rendert die vereinbarten Zustände.',
  runningSteps: ['App und Ausgangsstand prüfen', 'UI-Vorschlag umsetzen', 'Desktop und Mobile rendern', 'Artefakte für das Review ordnen'],
  version: 'Version 2',
  status: 'Bereit für Review',
  resultTitle: 'Visueller Vorschlag',
  resultDescription: 'Prüfe die echten App-Screens, setze Feedback direkt auf die Ansicht und starte daraus die nächste Iteration.',
  compare: 'Mit Ausgangsstand vergleichen',
  stopCompare: 'Vergleich schliessen',
  open: 'Original öffnen',
  previous: 'Vorheriger Screen',
  next: 'Nächster Screen',
  screensLabel: 'Gerenderte Screens',
  reviewTitle: 'Feedback',
  reviewHint: 'Pins beziehen sich auf den ausgewählten Screen.',
  openComments: 'offen',
  resolved: 'Erledigt',
  resolve: 'Erledigen',
  reopen: 'Wieder öffnen',
  feedbackPlaceholder: 'Was soll sich in der nächsten Version ändern?',
  addFeedback: 'Feedback hinzufügen',
  iterate: 'Neue Iteration',
  iterateWith: 'Neue Iteration mit {count} Feedbacks',
  apply: 'In Task übernehmen',
  applied: 'In Task übernommen',
  applyHint: 'Übernimmt freigegebene Screens, Review-Entscheidungen und Akzeptanzkriterien als versionierte Task-Artefakte.',
  acceptedTitle: 'Visueller Vorschlag übernommen',
  acceptedDescription: 'Die ausgewählten Screens und offenen Umsetzungshinweise sind jetzt Teil des aktiven Tasks.',
  addPin: 'Pin auf Screenshot setzen',
  route: 'Agent Kanban · Task-Dialog',
} : {
  title: 'Visual proposal',
  intro: 'Codex opens the real application, implements the idea in an isolated worktree, and renders reviewable UI screenshots.',
  briefLabel: 'What should change in the UI?',
  briefHint: 'Describe the goal, key interaction, and what should remain consistent with the current interface.',
  briefPlaceholder: 'For example: Keep visual refinement inside the task and allow feedback on individual screens …',
  screens: 'Target views',
  desktop: 'Desktop',
  mobile: 'Mobile',
  states: 'Empty and error states',
  start: 'Start visual proposal',
  startHint: 'The task stays open. Rendering and iterations continue in the background.',
  processTitle: 'What this run delivers',
  process: [
    ['Real app', 'The current application runs inside the task worktree.'],
    ['Multiple screens', 'Relevant views and viewports are captured as artifacts.'],
    ['Review in task', 'Feedback, variants, and the approved direction stay versioned.'],
  ],
  runningTitle: 'The application is being worked through visually',
  runningDescription: 'Codex is implementing the proposal in the isolated worktree and rendering the agreed states.',
  runningSteps: ['Inspect app and baseline', 'Implement UI proposal', 'Render desktop and mobile', 'Prepare review artifacts'],
  version: 'Version 2',
  status: 'Ready for review',
  resultTitle: 'Visual proposal',
  resultDescription: 'Review real app screens, pin feedback to the view, and start the next iteration from it.',
  compare: 'Compare with baseline',
  stopCompare: 'Close comparison',
  open: 'Open original',
  previous: 'Previous screen',
  next: 'Next screen',
  screensLabel: 'Rendered screens',
  reviewTitle: 'Feedback',
  reviewHint: 'Pins refer to the selected screen.',
  openComments: 'open',
  resolved: 'Resolved',
  resolve: 'Resolve',
  reopen: 'Reopen',
  feedbackPlaceholder: 'What should change in the next version?',
  addFeedback: 'Add feedback',
  iterate: 'New iteration',
  iterateWith: 'New iteration with {count} feedback items',
  apply: 'Add to task',
  applied: 'Added to task',
  applyHint: 'Adds approved screens, review decisions, and acceptance criteria to the task as versioned artifacts.',
  acceptedTitle: 'Visual proposal added to task',
  acceptedDescription: 'The selected screens and open implementation notes are now part of the active task.',
  addPin: 'Add pin to screenshot',
  route: 'Agent Kanban · Task dialog',
});

const state = ref<VisualRefinementState>('start');
const brief = ref(props.initialBrief || 'Das visuelle Refinement soll als eigener, klarer Arbeitsmodus direkt im Task funktionieren. Screenshots müssen sich vergleichen, kommentieren, iterieren und anschliessend in den Task übernehmen lassen.');
const targets = reactive({ desktop: true, mobile: true, states: false });
const activeArtifactIndex = ref(0);
const compareMode = ref(false);
const comparePosition = ref(48);
const feedbackDraft = ref('');
const version = ref(2);
let renderTimer: ReturnType<typeof setTimeout> | null = null;

const artifacts: VisualArtifact[] = [
  {
    id: 'task-entry',
    title: props.locale === 'de' ? 'Start im Task' : 'Task entry',
    context: copy.value.route,
    viewport: '1440 × 900',
    src: '/prototypes/visual-refinement-start.png',
  },
  {
    id: 'baseline',
    title: props.locale === 'de' ? 'Ausgangsstand' : 'Baseline',
    context: copy.value.route,
    viewport: '1264 × 577',
    src: '/prototypes/visual-refinement-current.png',
  },
  {
    id: 'mobile',
    title: props.locale === 'de' ? 'Mobile Einstieg' : 'Mobile entry',
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
      ? 'Der visuelle Modus soll auf derselben Ebene wie der Auftrag sichtbar sein – nicht tief im Text-Refinement.'
      : 'Keep the visual mode on the same level as the task brief, not buried inside text refinement.',
    resolved: false,
  },
  {
    id: 2,
    author: 'Codex',
    body: props.locale === 'de'
      ? 'Desktop und Mobile bleiben getrennte Screens, teilen aber dieselbe Feedback-Version.'
      : 'Desktop and mobile remain separate screens while sharing the same feedback version.',
    resolved: true,
  },
]);

const activeArtifact = computed(() => artifacts[activeArtifactIndex.value] || artifacts[0]!);
const openCommentCount = computed(() => comments.value.filter((comment) => !comment.resolved).length);
const iterateLabel = computed(() => {
  if (!openCommentCount.value) return copy.value.iterate;
  if (props.locale === 'de' && openCommentCount.value === 1) return 'Neue Iteration mit 1 Feedback';
  return copy.value.iterateWith.replace('{count}', String(openCommentCount.value));
});

function startRun() {
  if (!brief.value.trim()) return;
  state.value = 'running';
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    state.value = 'review';
  }, 1100);
}

function startIteration() {
  state.value = 'running';
  compareMode.value = false;
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    version.value += 1;
    comments.value = comments.value.map((comment) => ({ ...comment, resolved: true }));
    state.value = 'review';
  }, 1100);
}

function addFeedback() {
  const body = feedbackDraft.value.trim();
  if (!body) return;
  comments.value.push({ id: comments.value.length + 1, author: 'Patrick Michel', body, resolved: false });
  feedbackDraft.value = '';
}

function toggleComment(comment: VisualComment) {
  comment.resolved = !comment.resolved;
}

function selectArtifact(index: number) {
  activeArtifactIndex.value = index;
  compareMode.value = false;
}

function stepArtifact(direction: -1 | 1) {
  selectArtifact((activeArtifactIndex.value + direction + artifacts.length) % artifacts.length);
}

onBeforeUnmount(() => {
  if (renderTimer) clearTimeout(renderTimer);
});
</script>

<template>
  <section class="min-w-0" aria-labelledby="visual-refinement-title">
    <div v-if="state === 'start'" class="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <form class="min-w-0 p-4 sm:p-6" @submit.prevent="startRun">
        <div class="flex min-w-0 items-start gap-3 border-b border-zinc-200 pb-5 dark:border-zinc-800">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900/70">
            <UIcon name="i-lucide-panels-top-left" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="visual-refinement-title" class="text-base font-semibold text-zinc-950 dark:text-white">{{ copy.title }}</h2>
              <UBadge color="neutral" variant="soft" size="sm" icon="i-lucide-flask-conical">Prototype</UBadge>
            </div>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{{ copy.intro }}</p>
          </div>
        </div>

        <div class="grid gap-6 pt-6">
          <UFormField :label="copy.briefLabel" :description="copy.briefHint" required size="lg">
            <UTextarea
              v-model="brief"
              class="w-full"
              :rows="5"
              :placeholder="copy.briefPlaceholder"
              size="xl"
              autoresize
            />
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
                class="inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium ring-1 transition"
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

          <div class="flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <p class="inline-flex max-w-md items-start gap-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              <UIcon name="i-lucide-git-branch" class="mt-0.5 size-3.5 shrink-0" />
              {{ copy.startHint }}
            </p>
            <UButton type="submit" size="lg" icon="i-lucide-panels-top-left" class="shrink-0 justify-center" :disabled="!brief.trim()">
              {{ copy.start }}
            </UButton>
          </div>
        </div>
      </form>

      <aside class="border-t border-zinc-200 bg-zinc-50/80 p-4 sm:p-6 lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-900/45">
        <h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ copy.processTitle }}</h3>
        <ol class="mt-5 space-y-5">
          <li v-for="(item, index) in copy.process" :key="item[0]" class="flex gap-3">
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold tabular-nums text-teal-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-teal-300 dark:ring-zinc-700">{{ index + 1 }}</span>
            <div>
              <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ item[0] }}</p>
              <p class="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ item[1] }}</p>
            </div>
          </li>
        </ol>
      </aside>
    </div>

    <div v-else-if="state === 'running'" class="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14" role="status" aria-live="polite">
      <div class="flex flex-col items-center text-center">
        <span class="relative grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
          <span class="absolute inset-0 rounded-2xl ring-1 ring-teal-500/25 ak-visual-pulse" aria-hidden="true" />
          <UIcon name="i-lucide-panels-top-left" class="size-6" />
        </span>
        <h2 class="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">{{ copy.runningTitle }}</h2>
        <p class="mt-1 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{{ copy.runningDescription }}</p>
      </div>
      <ol class="mx-auto mt-8 max-w-xl divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <li v-for="(step, index) in copy.runningSteps" :key="step" class="flex min-h-12 items-center gap-3 py-3 text-sm">
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
      <div v-if="state === 'approved'" class="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950 sm:px-6 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
        <UIcon name="i-lucide-circle-check" class="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
        <div>
          <p class="text-sm font-semibold">{{ copy.acceptedTitle }}</p>
          <p class="mt-0.5 text-xs leading-5 text-emerald-900/80 dark:text-emerald-200/80">{{ copy.acceptedDescription }}</p>
        </div>
      </div>

      <header class="flex flex-col gap-4 border-b border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-zinc-800">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-zinc-950 dark:text-white">{{ copy.resultTitle }}</h2>
            <UBadge color="neutral" variant="soft" size="sm">V{{ version }}</UBadge>
            <UBadge :color="state === 'approved' ? 'success' : 'primary'" variant="soft" size="sm" :icon="state === 'approved' ? 'i-lucide-check' : 'i-lucide-eye'">
              {{ state === 'approved' ? copy.applied : copy.status }}
            </UBadge>
          </div>
          <p class="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ copy.resultDescription }}</p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton color="neutral" variant="soft" icon="i-lucide-git-compare-arrows" :label="compareMode ? copy.stopCompare : copy.compare" @click="compareMode = !compareMode" />
          <UButton v-if="state !== 'approved'" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :label="iterateLabel" @click="startIteration" />
          <UButton :disabled="state === 'approved'" :icon="state === 'approved' ? 'i-lucide-check' : 'i-lucide-clipboard-check'" :label="state === 'approved' ? copy.applied : copy.apply" @click="state = 'approved'" />
        </div>
      </header>

      <div class="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 bg-zinc-100 p-3 sm:p-4 dark:bg-zinc-900/60">
          <div class="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-300 dark:ring-zinc-700">
            <div class="flex min-h-11 items-center justify-between gap-3 border-b border-white/10 px-3 text-zinc-300">
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

            <div class="relative flex aspect-[16/8.9] min-h-72 items-center justify-center overflow-hidden bg-zinc-900">
              <img :src="activeArtifact.src" :alt="activeArtifact.title" class="h-full w-full object-contain" />
              <template v-if="activeArtifact.id === 'task-entry'">
                <button class="ak-visual-pin left-[18%] top-[17%]" type="button" :aria-label="`${copy.reviewTitle} 1`">1</button>
                <button class="ak-visual-pin left-[74%] top-[69%]" type="button" :aria-label="`${copy.reviewTitle} 2`">2</button>
              </template>

              <template v-if="compareMode">
                <div class="pointer-events-none absolute inset-0 overflow-hidden" :style="{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }">
                  <img :src="'/prototypes/visual-refinement-current.png'" alt="" class="h-full w-full object-contain" />
                </div>
                <div class="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]" :style="{ left: `${comparePosition}%` }">
                  <span class="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-zinc-900 shadow-md">
                    <UIcon name="i-lucide-chevrons-left-right" class="size-4" />
                  </span>
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
                <span class="block aspect-[16/7] overflow-hidden bg-zinc-900">
                  <img :src="artifact.src" alt="" class="h-full w-full object-cover object-top" />
                </span>
                <span class="block truncate px-2.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">{{ artifact.title }}</span>
              </button>
            </div>
          </div>
        </div>

        <aside class="min-w-0 border-t border-zinc-200 bg-white lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
            <div>
              <h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ copy.reviewTitle }}</h3>
              <p class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ copy.reviewHint }}</p>
            </div>
            <UBadge color="warning" variant="soft" size="sm">{{ openCommentCount }} {{ copy.openComments }}</UBadge>
          </div>

          <div class="max-h-[22rem] divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            <article v-for="comment in comments" :key="comment.id" class="px-4 py-4">
              <div class="flex items-start gap-3">
                <span class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold" :class="comment.resolved ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-amber-400 text-amber-950'">{{ comment.id }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{{ comment.author }}</p>
                    <span v-if="comment.resolved" class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><UIcon name="i-lucide-check" class="size-3" />{{ copy.resolved }}</span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ comment.body }}</p>
                  <button type="button" class="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-200" @click="toggleComment(comment)">
                    {{ comment.resolved ? copy.reopen : copy.resolve }}
                  </button>
                </div>
              </div>
            </article>
          </div>

          <form v-if="state !== 'approved'" class="border-t border-zinc-200 p-4 dark:border-zinc-800" @submit.prevent="addFeedback">
            <UTextarea v-model="feedbackDraft" class="w-full" :rows="3" :placeholder="copy.feedbackPlaceholder" autoresize />
            <div class="mt-2 flex items-center justify-between gap-2">
              <p class="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400"><UIcon name="i-lucide-map-pin-plus" class="size-3.5" />{{ copy.addPin }}</p>
              <UButton type="submit" size="sm" icon="i-lucide-send" :disabled="!feedbackDraft.trim()">{{ copy.addFeedback }}</UButton>
            </div>
          </form>

          <div class="border-t border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p class="flex items-start gap-2 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
              <UIcon name="i-lucide-paperclip" class="mt-0.5 size-3.5 shrink-0" />
              {{ copy.applyHint }}
            </p>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ak-visual-pin {
  position: absolute;
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border: 2px solid white;
  border-radius: 999px;
  background: rgb(251 191 36);
  color: rgb(66 32 6);
  font-size: 0.75rem;
  font-weight: 800;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
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
