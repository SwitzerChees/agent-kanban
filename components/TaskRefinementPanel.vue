<script setup lang="ts">
export type TaskRefinementStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'awaiting_questions'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskRefinementQuestion {
  id: string;
  prompt: string;
  context?: string | null;
  required?: boolean;
  placeholder?: string | null;
  answer?: string | null;
}

export interface TaskRefinementVisual {
  id: string;
  url: string;
  title?: string | null;
  description?: string | null;
  alt?: string | null;
  downloadUrl?: string | null;
}

export interface TaskRefinementRun {
  id: string;
  version?: number | null;
  parentRefinementId?: string | null;
  status: TaskRefinementStatus | (string & {});
  createdAt?: string | null;
  updatedAt?: string | null;
  sourceDescription?: string | null;
  sourceCodeRevision?: string | null;
  resultCodeRevision?: string | null;
  summary?: string | null;
  questions?: TaskRefinementQuestion[];
  resultMarkdown?: string | null;
  visuals?: TaskRefinementVisual[];
  errorMessage?: string | null;
  appliedAt?: string | null;
  comments?: Array<{
    id: string;
    authorId: string;
    authorName?: string | null;
    quote: string;
    prefix: string;
    suffix: string;
    startOffset: number;
    endOffset: number;
    body: string;
    incorporatedByRefinementId?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface TaskRefinementLabels {
  title: string;
  description: string;
  intro: string;
  briefLabel: string;
  briefPlaceholder: string;
  briefHint: string;
  start: string;
  createAndStart: string;
  createOnStartHint: string;
  saveOnStartHint: string;
  titleRequired: string;
  queuedTitle: string;
  queuedDescription: string;
  runningTitle: string;
  runningDescription: string;
  backgroundHint: string;
  questionsTitle: string;
  questionsDescription: string;
  required: string;
  optional: string;
  answerPlaceholder: string;
  submitAnswers: string;
  cancelQuestions: string;
  resultTitle: string;
  resultDescription: string;
  descriptionChangedTitle: string;
  descriptionChangedHint: string;
  apply: string;
  applied: string;
  discardResult: string;
  newRun: string;
  cancelNew: string;
  visualsTitle: string;
  visualsDescription: string;
  openVisual: string;
  history: string;
  latest: string;
  runFrom: string;
  failedTitle: string;
  failedDescription: string;
  retry: string;
  cancelledTitle: string;
  cancelledDescription: string;
  statusIdle: string;
  statusQueued: string;
  statusRunning: string;
  statusQuestions: string;
  statusCompleted: string;
  statusFailed: string;
  statusCancelled: string;
  unknownDate: string;
  shortcutHint: string;
  sourceRevision: string;
  resultRevision: string;
}

const defaultLabels: TaskRefinementLabels = {
  title: 'Task-Refinement',
  description: 'Codex prüft die Idee im aktuellen Projektkontext und arbeitet sie zu einem belastbaren Auftrag aus.',
  intro: 'Codex gleicht deine Idee mit der bestehenden Anwendung ab, benennt Integrationsweg, Auswirkungen, Risiken und offene Entscheidungen. Visualisierungen entstehen nur, wenn sie einen echten Mehrwert liefern.',
  briefLabel: 'Was soll genauer untersucht werden?',
  briefPlaceholder: 'Zum Beispiel: Die Projektübersicht um eine kompakte Zeitplanung erweitern …',
  briefHint: 'Ein bis zwei Sätze reichen. Codex berücksichtigt Code, Projektstruktur und vorhandene Anhänge.',
  start: 'Refinement starten',
  createAndStart: 'Aufgabe erstellen und Refinement starten',
  createOnStartHint: 'Beim Start wird die Aufgabe gespeichert und bleibt geöffnet.',
  saveOnStartHint: 'Offene Aufgabenänderungen werden vor dem Refinement automatisch gespeichert.',
  titleRequired: 'Gib der Aufgabe im Reiter „Auftrag“ zuerst einen Titel. Dein Refinement-Text bleibt erhalten.',
  queuedTitle: 'Refinement ist vorgemerkt',
  queuedDescription: 'Der Lauf startet, sobald ein Agent verfügbar ist.',
  runningTitle: 'Codex untersucht den Task',
  runningDescription: 'Code, Auswirkungen, Integrationsweg und Risiken werden gerade geprüft.',
  backgroundHint: 'Du kannst die Aufgabe schließen. Das Refinement läuft im Hintergrund weiter.',
  questionsTitle: 'Codex braucht deine Einschätzung',
  questionsDescription: 'Beantworte die Challenge-Fragen, damit das Refinement mit den richtigen Annahmen weiterläuft.',
  required: 'Erforderlich',
  optional: 'Optional',
  answerPlaceholder: 'Antwort eingeben …',
  submitAnswers: 'Antworten senden und fortfahren',
  cancelQuestions: 'Refinement abbrechen',
  resultTitle: 'Refinement abgeschlossen',
  resultDescription: 'Das Ergebnis ist versioniert und kann getrennt von der Originalbeschreibung übernommen werden.',
  descriptionChangedTitle: 'Beschreibung wurde inzwischen geändert',
  descriptionChangedHint: 'Dieses Refinement basiert auf einem früheren aktiven Text. Du kannst es trotzdem als neue Refinement-Fassung übernehmen; die Originalbeschreibung bleibt erhalten.',
  apply: 'Als Refinement übernehmen',
  applied: 'Als Refinement übernommen',
  discardResult: 'Nicht übernehmen',
  newRun: 'Neues Refinement',
  cancelNew: 'Zurück zum Ergebnis',
  visualsTitle: 'Designvorschläge',
  visualsDescription: 'Codex hat Visualisierungen erzeugt, weil sie die vorgeschlagene Umsetzung verständlicher machen.',
  openVisual: 'Visualisierung öffnen',
  history: 'Versionen',
  latest: 'Aktuell',
  runFrom: 'Lauf vom',
  failedTitle: 'Refinement konnte nicht abgeschlossen werden',
  failedDescription: 'Der bestehende Task wurde nicht verändert. Du kannst den Lauf erneut starten.',
  retry: 'Erneut versuchen',
  cancelledTitle: 'Refinement wurde beendet',
  cancelledDescription: 'Du kannst jederzeit einen neuen Lauf starten.',
  statusIdle: 'Noch nicht gestartet',
  statusQueued: 'Vorgemerkt',
  statusRunning: 'In Arbeit',
  statusQuestions: 'Rückfragen',
  statusCompleted: 'Abgeschlossen',
  statusFailed: 'Fehlgeschlagen',
  statusCancelled: 'Beendet',
  unknownDate: 'Datum unbekannt',
  shortcutHint: 'Schnell starten mit ⌘/Ctrl + Enter',
  sourceRevision: 'Ausgangsstand',
  resultRevision: 'Stand bei Abschluss',
};

const englishLabels: TaskRefinementLabels = {
  title: 'Task refinement',
  description: 'Codex reviews the idea in the current project context and turns it into an implementation-ready brief.',
  intro: 'Codex compares your idea with the existing application and identifies the integration path, impact, risks, and open decisions. Visuals are created only when they add real value.',
  briefLabel: 'What should Codex investigate?',
  briefPlaceholder: 'For example: Add a compact timeline to the project overview …',
  briefHint: 'One or two sentences are enough. Codex considers the code, project structure, and existing attachments.',
  start: 'Start refinement',
  createAndStart: 'Create task and start refinement',
  createOnStartHint: 'Starting creates the task and keeps it open.',
  saveOnStartHint: 'Unsaved task changes are saved automatically before refinement starts.',
  titleRequired: 'Add a title in the Task brief tab first. Your refinement text will be kept.',
  queuedTitle: 'Refinement is queued',
  queuedDescription: 'The run starts as soon as an agent is available.',
  runningTitle: 'Codex is investigating the task',
  runningDescription: 'Code, impact, integration path, and risks are being reviewed.',
  backgroundHint: 'You can close the task. Refinement continues in the background.',
  questionsTitle: 'Codex needs your input',
  questionsDescription: 'Answer these challenge questions so refinement can continue with the right assumptions.',
  required: 'Required',
  optional: 'Optional',
  answerPlaceholder: 'Enter an answer …',
  submitAnswers: 'Send answers and continue',
  cancelQuestions: 'Cancel refinement',
  resultTitle: 'Refinement completed',
  resultDescription: 'The result is versioned and can be applied separately from the original description.',
  descriptionChangedTitle: 'The description has changed',
  descriptionChangedHint: 'This refinement is based on an earlier active text. You can still apply it as the new refined version; the original description stays intact.',
  apply: 'Apply as refinement',
  applied: 'Applied as refinement',
  discardResult: 'Do not apply',
  newRun: 'New refinement',
  cancelNew: 'Back to result',
  visualsTitle: 'Design concepts',
  visualsDescription: 'Codex created visuals because they make the proposed implementation easier to understand.',
  openVisual: 'Open visual',
  history: 'Versions',
  latest: 'Latest',
  runFrom: 'Run from',
  failedTitle: 'Refinement could not be completed',
  failedDescription: 'The task was not changed. You can start another run.',
  retry: 'Try again',
  cancelledTitle: 'Refinement was stopped',
  cancelledDescription: 'You can start a new run at any time.',
  statusIdle: 'Not started',
  statusQueued: 'Queued',
  statusRunning: 'In progress',
  statusQuestions: 'Questions',
  statusCompleted: 'Completed',
  statusFailed: 'Failed',
  statusCancelled: 'Stopped',
  unknownDate: 'Unknown date',
  shortcutHint: 'Quick start with ⌘/Ctrl + Enter',
  sourceRevision: 'Source revision',
  resultRevision: 'Revision at completion',
};

const props = withDefaults(defineProps<{
  runs?: TaskRefinementRun[];
  latest?: TaskRefinementRun | null;
  currentRun?: TaskRefinementRun | null;
  status?: TaskRefinementStatus | (string & {}) | null;
  questions?: TaskRefinementQuestion[];
  result?: string | null;
  visuals?: TaskRefinementVisual[];
  errorMessage?: string | null;
  actionError?: string | null;
  busy?: boolean;
  createOnStart?: boolean;
  taskReady?: boolean;
  descriptionChanged?: boolean;
  initialBrief?: string;
  labels?: Partial<TaskRefinementLabels>;
  locale?: string;
  embedded?: boolean;
}>(), {
  runs: () => [],
  latest: null,
  currentRun: null,
  status: null,
  questions: undefined,
  result: null,
  visuals: undefined,
  errorMessage: null,
  actionError: null,
  busy: false,
  createOnStart: false,
  taskReady: true,
  descriptionChanged: false,
  initialBrief: '',
  labels: () => ({}),
  locale: 'de-CH',
  embedded: false,
});

const emit = defineEmits<{
  start: [payload: { brief: string; visualMode: 'auto' }];
  submitAnswers: [payload: { runId: string; answers: Record<string, string> }];
  apply: [runId: string];
  cancel: [runId: string];
  retry: [runId: string];
  selectRun: [runId: string];
  dirtyChange: [dirty: boolean];
  requestTaskDetails: [];
}>();

const t = computed<TaskRefinementLabels>(() => ({
  ...(props.locale.toLowerCase().startsWith('de') ? defaultLabels : englishLabels),
  ...props.labels,
}));
const brief = ref(props.initialBrief);
const answers = reactive<Record<string, string>>({});
const newRunOpen = ref(false);
const pendingStartFromRunId = ref<string | null>(null);
const startRequestPending = ref(false);
const createRequestPending = ref(false);

const activeRun = computed(() => props.currentRun || props.latest || props.runs[0] || null);
const activeStatus = computed(() => props.status || activeRun.value?.status || 'idle');
const activeQuestions = computed(() => props.questions ?? activeRun.value?.questions ?? []);
const activeResult = computed(() => props.result ?? activeRun.value?.resultMarkdown ?? '');
const activeVisuals = computed(() => props.visuals ?? activeRun.value?.visuals ?? []);
const activeError = computed(() => props.errorMessage || activeRun.value?.errorMessage || '');
const localizedFailureMessage = computed(() => {
  const messages = props.locale.toLowerCase().startsWith('de')
    ? {
        refinement_timeout: 'Der gewählte KI-Harness hat für dieses Refinement zu lange benötigt. Du kannst es erneut versuchen.',
        refinement_capacity: 'Das KI-Modell war vorübergehend ausgelastet. Du kannst das Refinement erneut starten.',
        refinement_invalid_output: 'Der gewählte KI-Harness hat ein unvollständiges Refinement geliefert. Du kannst es erneut versuchen.',
        refinement_master_sync_failed: 'Der Projekt-Master konnte vor dem Refinement nicht aktualisiert werden. Prüfe Branch, Remote und mögliche Pull-Konflikte und versuche es erneut.',
        refinement_security_policy: 'Das Refinement wurde gestoppt, weil eine Regel für den Projektzugriff nicht erfüllt war.',
        refinement_question_limit: 'Die maximale Anzahl Challenge-Runden wurde erreicht. Starte mit den gesammelten Antworten einen neuen Lauf.',
        refinement_failed: 'Das Refinement konnte nicht abgeschlossen werden. Die Aufgabe wurde nicht verändert.',
      }
    : {
        refinement_timeout: 'The selected AI harness took too long to finish this refinement. You can try again.',
        refinement_capacity: 'The AI model was temporarily at capacity. You can start the refinement again.',
        refinement_invalid_output: 'The selected AI harness returned an incomplete refinement. You can try again.',
        refinement_master_sync_failed: 'The project master branch could not be updated before refinement. Check the branch, remote, and possible pull conflicts, then try again.',
        refinement_security_policy: 'The refinement stopped because a project access rule was not satisfied.',
        refinement_question_limit: 'The maximum number of challenge rounds was reached. Start a new run with the gathered answers.',
        refinement_failed: 'The refinement could not be completed. The task was not changed.',
      };
  return messages[activeError.value as keyof typeof messages] || t.value.failedDescription;
});

const normalizedStatus = computed<TaskRefinementStatus>(() => {
  if (newRunOpen.value) return 'idle';
  const status = activeStatus.value;
  if (status === 'waiting_for_answers' || status === 'awaiting_input' || status === 'needs_input') return 'awaiting_questions';
  if (status === 'done' || status === 'succeeded') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'pending') return 'queued';
  return ['idle', 'queued', 'running', 'awaiting_questions', 'completed', 'failed', 'cancelled'].includes(status)
    ? status as TaskRefinementStatus
    : 'running';
});

const statusMeta = computed(() => {
  const statuses = {
    idle: { label: t.value.statusIdle, icon: 'i-lucide-sparkles', color: 'neutral' as const },
    queued: { label: t.value.statusQueued, icon: 'i-lucide-clock-3', color: 'neutral' as const },
    running: { label: t.value.statusRunning, icon: 'i-lucide-loader-circle', color: 'primary' as const },
    awaiting_questions: { label: t.value.statusQuestions, icon: 'i-lucide-message-circle-question', color: 'warning' as const },
    completed: { label: t.value.statusCompleted, icon: 'i-lucide-circle-check', color: 'success' as const },
    failed: { label: t.value.statusFailed, icon: 'i-lucide-circle-alert', color: 'error' as const },
    cancelled: { label: t.value.statusCancelled, icon: 'i-lucide-circle-stop', color: 'neutral' as const },
  };
  return statuses[normalizedStatus.value];
});

const sortedRuns = computed(() => [...props.runs].sort((a, b) => {
  const aTime = Date.parse(a.createdAt || a.updatedAt || '') || 0;
  const bTime = Date.parse(b.createdAt || b.updatedAt || '') || 0;
  return bTime - aTime;
}));
const hasActiveRun = computed(() => props.runs.some((run) => (
  ['queued', 'running', 'awaiting_questions', 'waiting_for_answers', 'awaiting_input', 'needs_input', 'pending'].includes(run.status)
)));

const unansweredRequiredQuestions = computed(() => activeQuestions.value.filter((question) => {
  if (!question.required) return false;
  return !(answers[question.id] || '').trim();
}));

const canSubmitAnswers = computed(() => Boolean(activeRun.value?.id)
  && activeQuestions.value.length > 0
  && unansweredRequiredQuestions.value.length === 0
  && !props.busy);

const draftDirty = computed(() => {
  if (normalizedStatus.value === 'idle' || newRunOpen.value) {
    return brief.value !== props.initialBrief;
  }
  if (normalizedStatus.value !== 'awaiting_questions') return false;
  return activeQuestions.value.some((question) => (
    (answers[question.id] || '') !== (question.answer || '')
  ));
});

watch(activeQuestions, (questions) => {
  const ids = new Set(questions.map((question) => question.id));
  for (const answerId of Object.keys(answers)) {
    if (!ids.has(answerId)) delete answers[answerId];
  }
  for (const question of questions) {
    answers[question.id] = question.answer || '';
  }
}, { immediate: true });

watch(() => props.initialBrief, (value) => {
  if (!brief.value.trim()) brief.value = value;
});

watch(draftDirty, (dirty) => emit('dirtyChange', dirty), { immediate: true });

watch(() => activeRun.value?.id ?? null, (runId) => {
  if (!startRequestPending.value || runId === pendingStartFromRunId.value) return;
  startRequestPending.value = false;
  createRequestPending.value = false;
  pendingStartFromRunId.value = null;
  newRunOpen.value = false;
});

watch(() => props.busy, (busy, previousBusy) => {
  if (!startRequestPending.value || busy || !previousBusy) return;
  // A failed request keeps the brief and form open. A successful request is
  // closed by the active-run watcher above.
  startRequestPending.value = false;
  createRequestPending.value = false;
  pendingStartFromRunId.value = null;
});

onBeforeUnmount(() => emit('dirtyChange', false));

const startRefinement = () => {
  const value = brief.value.trim();
  if (!value || props.busy) return;
  if (!props.taskReady) {
    emit('requestTaskDetails');
    return;
  }
  pendingStartFromRunId.value = activeRun.value?.id ?? null;
  startRequestPending.value = true;
  createRequestPending.value = props.createOnStart;
  emit('start', { brief: value, visualMode: 'auto' });
};

const submitAnswers = () => {
  const runId = activeRun.value?.id;
  if (!runId || !canSubmitAnswers.value) return;
  emit('submitAnswers', {
    runId,
    answers: Object.fromEntries(activeQuestions.value.map((question) => [question.id, (answers[question.id] || '').trim()])),
  });
};

const selectRun = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  if (value && value !== activeRun.value?.id) emit('selectRun', value);
};

const formatDate = (value?: string | null) => {
  if (!value) return t.value.unknownDate;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.value.unknownDate;
  return new Intl.DateTimeFormat(props.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const historyLabel = (run: TaskRefinementRun, index: number) => {
  const date = formatDate(run.createdAt || run.updatedAt);
  const version = run.version ? `V${run.version} · ` : '';
  return `${version}${index === 0 ? `${t.value.latest} · ` : ''}${date} · ${statusLabel(run.status)}`;
};

const statusLabel = (status: TaskRefinementRun['status']) => {
  if (status === 'queued' || status === 'pending') return t.value.statusQueued;
  if (status === 'awaiting_questions' || status === 'waiting_for_answers' || status === 'awaiting_input' || status === 'needs_input') return t.value.statusQuestions;
  if (status === 'completed' || status === 'done' || status === 'succeeded') return t.value.statusCompleted;
  if (status === 'failed' || status === 'error') return t.value.statusFailed;
  if (status === 'cancelled') return t.value.statusCancelled;
  return t.value.statusRunning;
};
</script>

<template>
  <section class="min-w-0" :aria-labelledby="`task-refinement-title-${activeRun?.id || 'new'}`">
    <header v-if="!props.embedded" class="flex min-w-0 flex-col gap-4 border-b border-zinc-200 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 dark:border-zinc-800">
      <div class="flex min-w-0 items-start gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900/70">
          <UIcon name="i-lucide-wand-sparkles" class="size-5" />
        </span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 :id="`task-refinement-title-${activeRun?.id || 'new'}`" class="text-base font-semibold text-zinc-950 dark:text-white">
              {{ t.title }}
            </h2>
            <UBadge :color="statusMeta.color" variant="soft" size="sm">
              <UIcon
                :name="statusMeta.icon"
                class="mr-1 size-3.5"
                :class="normalizedStatus === 'running' ? 'ak-refinement-spin' : ''"
              />
              {{ statusMeta.label }}
            </UBadge>
          </div>
          <p class="mt-1 max-w-2xl text-sm leading-5 text-zinc-600 dark:text-zinc-400">{{ t.description }}</p>
        </div>
      </div>

      <label v-if="sortedRuns.length > 1" class="min-w-0 shrink-0 sm:w-64">
        <span class="sr-only">{{ t.history }}</span>
        <span class="relative block">
          <UIcon name="i-lucide-history" class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-zinc-500" />
          <select
            class="h-9 w-full appearance-none truncate rounded-lg border border-zinc-300 bg-white py-1.5 pl-9 pr-8 text-sm text-zinc-800 transition hover:border-zinc-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600"
            :value="activeRun?.id"
            @change="selectRun"
          >
            <option v-for="(run, index) in sortedRuns" :key="run.id" :value="run.id">
              {{ historyLabel(run, index) }}
            </option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        </span>
      </label>
    </header>

    <div v-else-if="sortedRuns.length > 1" class="mb-5 flex justify-end">
      <label class="min-w-0 w-full sm:w-72">
        <span class="sr-only">{{ t.history }}</span>
        <span class="relative block">
          <UIcon name="i-lucide-history" class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-zinc-500" />
          <select
            class="h-9 w-full appearance-none truncate rounded-lg border border-zinc-300 bg-white py-1.5 pl-9 pr-8 text-sm text-zinc-800 transition hover:border-zinc-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            :value="activeRun?.id"
            @change="selectRun"
          >
            <option v-for="(run, index) in sortedRuns" :key="run.id" :value="run.id">{{ historyLabel(run, index) }}</option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        </span>
      </label>
    </div>

    <div class="min-w-0" :class="props.embedded ? '' : 'p-4 sm:p-6'">
      <UAlert
        v-if="props.actionError"
        class="mx-auto mb-5 max-w-4xl"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="props.actionError"
      />

      <form v-if="normalizedStatus === 'idle' || newRunOpen" class="mx-auto max-w-3xl" @submit.prevent="startRefinement">
        <div class="mb-5 flex items-start gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800">
          <UIcon name="i-lucide-scan-search" class="mt-0.5 size-5 shrink-0 text-teal-700 dark:text-teal-300" />
          <p class="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            {{ t.intro }}
          </p>
        </div>

        <UAlert
          v-if="!props.taskReady"
          class="mb-5"
          color="warning"
          variant="soft"
          icon="i-lucide-heading-1"
          :description="t.titleRequired"
        />

        <UFormField :label="t.briefLabel" :description="t.briefHint" required size="lg">
          <UTextarea
            v-model="brief"
            class="w-full"
            :placeholder="t.briefPlaceholder"
            :rows="3"
            :maxlength="4000"
            size="xl"
            autoresize
            :disabled="props.busy"
            @keydown.meta.enter.prevent="startRefinement"
            @keydown.ctrl.enter.prevent="startRefinement"
          />
        </UFormField>

        <div class="mt-4 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <p>{{ brief.length }}/4000 · {{ t.shortcutHint }}</p>
            <p v-if="props.taskReady" class="inline-flex items-center gap-1.5">
              <UIcon name="i-lucide-save" class="size-3.5 shrink-0" />
              {{ props.createOnStart || createRequestPending ? t.createOnStartHint : t.saveOnStartHint }}
            </p>
          </div>
          <div class="flex flex-col-reverse gap-2 sm:flex-row">
            <UButton
              v-if="newRunOpen"
              type="button"
              color="neutral"
              variant="ghost"
              class="justify-center"
              @click="newRunOpen = false"
            >
              {{ t.cancelNew }}
            </UButton>
            <UButton
              type="submit"
              icon="i-lucide-wand-sparkles"
              size="lg"
              class="justify-center"
              :disabled="!brief.trim()"
              :loading="props.busy"
            >
              {{ props.createOnStart || createRequestPending ? t.createAndStart : t.start }}
            </UButton>
          </div>
        </div>
      </form>

      <div v-else-if="normalizedStatus === 'queued' || normalizedStatus === 'running'" class="mx-auto max-w-3xl py-6 sm:py-10" role="status" aria-live="polite">
        <div class="flex flex-col items-center text-center">
          <span class="relative grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
            <span v-if="normalizedStatus === 'running'" class="absolute inset-0 rounded-2xl ring-1 ring-teal-500/25 ak-refinement-pulse" aria-hidden="true" />
            <UIcon :name="normalizedStatus === 'queued' ? 'i-lucide-clock-3' : 'i-lucide-scan-search'" class="size-6" />
          </span>
          <h3 class="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">
            {{ normalizedStatus === 'queued' ? t.queuedTitle : t.runningTitle }}
          </h3>
          <p class="mt-1 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {{ normalizedStatus === 'queued' ? t.queuedDescription : t.runningDescription }}
          </p>
          <p class="mt-3 inline-flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <UIcon name="i-lucide-panel-top-close" class="size-4" />
            {{ t.backgroundHint }}
          </p>
        </div>

        <div class="mt-8 space-y-3" aria-hidden="true">
          <div class="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 ak-refinement-shimmer" />
          <div class="h-2.5 w-5/6 rounded-full bg-zinc-100 dark:bg-zinc-800 ak-refinement-shimmer" />
          <div class="h-2.5 w-3/5 rounded-full bg-zinc-100 dark:bg-zinc-800 ak-refinement-shimmer" />
        </div>
      </div>

      <form v-else-if="normalizedStatus === 'awaiting_questions'" class="mx-auto max-w-3xl" @submit.prevent="submitAnswers">
        <div class="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-100 dark:ring-amber-900/70">
          <UIcon name="i-lucide-message-circle-question" class="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <h3 class="text-sm font-semibold">{{ t.questionsTitle }}</h3>
            <p class="mt-1 text-sm leading-5 text-amber-900/80 dark:text-amber-200/80">{{ t.questionsDescription }}</p>
          </div>
        </div>

        <div class="divide-y divide-zinc-200 dark:divide-zinc-800">
          <UFormField
            v-for="(question, index) in activeQuestions"
            :key="question.id"
            class="py-5 first:pt-0"
            :required="question.required"
          >
            <template #label>
              <span class="flex min-w-0 items-start gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-zinc-100 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{{ index + 1 }}</span>
                <span>{{ question.prompt }}</span>
              </span>
            </template>
            <template #description>
              <span v-if="question.context" class="block max-w-2xl pl-7 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ question.context }}</span>
            </template>
            <div class="mt-2 pl-0 sm:pl-7">
              <UTextarea
                v-model="answers[question.id]"
                class="w-full"
                :placeholder="question.placeholder || t.answerPlaceholder"
                :rows="3"
                :maxlength="8000"
                size="lg"
                autoresize
                :required="question.required"
              />
              <p class="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{{ question.required ? t.required : t.optional }}</p>
            </div>
          </UFormField>
        </div>

        <div class="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            v-if="activeRun?.id"
            type="button"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="lg"
            :disabled="props.busy"
            @click="emit('cancel', activeRun.id)"
          >
            {{ t.cancelQuestions }}
          </UButton>
          <UButton
            type="submit"
            icon="i-lucide-send"
            size="lg"
            :loading="props.busy"
            :disabled="!canSubmitAnswers"
          >
            {{ t.submitAnswers }}
          </UButton>
        </div>
      </form>

      <div v-else-if="normalizedStatus === 'completed'" class="mx-auto max-w-4xl">
        <div class="border-b border-zinc-200 pb-5 dark:border-zinc-800">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <UIcon name="i-lucide-circle-check" class="size-5" />
                <h3 class="text-base font-semibold text-zinc-950 dark:text-white">{{ t.resultTitle }}</h3>
              </div>
              <p class="mt-1 max-w-2xl text-sm leading-5 text-zinc-600 dark:text-zinc-400">{{ t.resultDescription }}</p>
              <div v-if="activeRun?.sourceCodeRevision || activeRun?.resultCodeRevision" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                <p v-if="activeRun?.resultCodeRevision" class="inline-flex min-w-0 items-center gap-1.5">
                  <UIcon name="i-lucide-git-commit-horizontal" class="size-3.5 shrink-0" />
                  <span>{{ t.resultRevision }}:</span>
                  <span class="truncate font-mono">{{ activeRun.resultCodeRevision }}</span>
                </p>
                <p v-if="activeRun?.sourceCodeRevision && activeRun.sourceCodeRevision !== activeRun.resultCodeRevision" class="inline-flex min-w-0 items-center gap-1.5">
                  <UIcon name="i-lucide-history" class="size-3.5 shrink-0" />
                  <span>{{ t.sourceRevision }}:</span>
                  <span class="truncate font-mono">{{ activeRun.sourceCodeRevision }}</span>
                </p>
              </div>
            </div>
            <div class="flex shrink-0 flex-col gap-2 sm:items-end">
              <UButton
                :icon="activeRun?.appliedAt ? 'i-lucide-check' : 'i-lucide-file-pen-line'"
                size="lg"
                class="justify-center"
                :disabled="!activeResult || !activeRun?.id || Boolean(activeRun?.appliedAt)"
                :loading="props.busy"
                @click="activeRun?.id && emit('apply', activeRun.id)"
              >
                {{ activeRun?.appliedAt ? t.applied : t.apply }}
              </UButton>
              <UButton
                v-if="!props.embedded && !activeRun?.appliedAt"
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-x"
                :disabled="props.busy"
                @click="activeRun?.id && emit('cancel', activeRun.id)"
              >
                {{ t.discardResult }}
              </UButton>
              <UButton
                v-if="!props.embedded"
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-plus"
                :disabled="hasActiveRun"
                @click="newRunOpen = true"
              >
                {{ t.newRun }}
              </UButton>
            </div>
          </div>
          <UAlert
            v-if="props.descriptionChanged && !activeRun?.appliedAt"
            class="mt-4"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="t.descriptionChangedTitle"
            :description="t.descriptionChangedHint"
          />
        </div>

        <article class="ak-refinement-result py-6 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          <slot name="result" :markdown="activeResult" :run="activeRun">
            <div class="whitespace-pre-wrap break-words">{{ activeResult }}</div>
          </slot>
        </article>

        <section v-if="activeVisuals.length" class="border-t border-zinc-200 pt-6 dark:border-zinc-800" :aria-labelledby="`task-refinement-visuals-${activeRun?.id}`">
          <div class="mb-4">
            <h3 :id="`task-refinement-visuals-${activeRun?.id}`" class="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
              <UIcon name="i-lucide-images" class="size-4 text-teal-700 dark:text-teal-300" />
              {{ t.visualsTitle }}
            </h3>
            <p class="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ t.visualsDescription }}</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <figure v-for="visual in activeVisuals" :key="visual.id" class="min-w-0 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
              <a :href="visual.url" target="_blank" rel="noopener noreferrer" class="group block overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600" :aria-label="`${t.openVisual}: ${visual.title || visual.alt || visual.id}`">
                <img
                  :src="visual.url"
                  :alt="visual.alt || visual.title || ''"
                  class="aspect-video w-full object-cover transition duration-200 group-hover:scale-[1.015]"
                  loading="lazy"
                >
              </a>
              <figcaption v-if="visual.title || visual.description" class="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <p v-if="visual.title" class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ visual.title }}</p>
                <p v-if="visual.description" class="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ visual.description }}</p>
              </figcaption>
            </figure>
          </div>
        </section>
      </div>

      <div v-else-if="normalizedStatus === 'failed'" class="mx-auto max-w-2xl py-6 text-center sm:py-10" role="alert">
        <span class="mx-auto grid size-12 place-items-center rounded-xl bg-red-50 text-red-700 dark:bg-red-950/35 dark:text-red-300">
          <UIcon name="i-lucide-circle-alert" class="size-6" />
        </span>
        <h3 class="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">{{ t.failedTitle }}</h3>
        <p class="mx-auto mt-1 max-w-lg text-sm leading-6 text-zinc-600 dark:text-zinc-400">{{ localizedFailureMessage }}</p>
        <UButton
          v-if="activeRun?.id"
          class="mt-5"
          color="neutral"
          variant="solid"
          icon="i-lucide-rotate-ccw"
          :loading="props.busy"
          @click="emit('retry', activeRun.id)"
        >
          {{ t.retry }}
        </UButton>
      </div>

      <div v-else class="mx-auto max-w-2xl py-6 text-center sm:py-10">
        <span class="mx-auto grid size-12 place-items-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          <UIcon name="i-lucide-circle-stop" class="size-6" />
        </span>
        <h3 class="mt-4 text-lg font-semibold text-zinc-950 dark:text-white">{{ t.cancelledTitle }}</h3>
        <p class="mx-auto mt-1 max-w-lg text-sm leading-6 text-zinc-600 dark:text-zinc-400">{{ t.cancelledDescription }}</p>
        <UButton
          v-if="activeRun?.id"
          class="mt-5"
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-ccw"
          :loading="props.busy"
          @click="emit('retry', activeRun.id)"
        >
          {{ t.retry }}
        </UButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ak-refinement-spin {
  animation: ak-refinement-spin 1.6s linear infinite;
}

.ak-refinement-pulse {
  animation: ak-refinement-pulse 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.ak-refinement-shimmer {
  position: relative;
  overflow: hidden;
}

.ak-refinement-shimmer::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.74), transparent);
  content: '';
  transform: translateX(-100%);
  animation: ak-refinement-shimmer 1.7s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

:global(.dark) .ak-refinement-shimmer::after {
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.08), transparent);
}

@keyframes ak-refinement-spin {
  to { transform: rotate(360deg); }
}

@keyframes ak-refinement-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

@keyframes ak-refinement-shimmer {
  to { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .ak-refinement-spin,
  .ak-refinement-pulse,
  .ak-refinement-shimmer::after {
    animation: none;
  }

  img {
    transition: none;
  }
}
</style>
