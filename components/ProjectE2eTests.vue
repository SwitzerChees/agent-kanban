<script setup lang="ts">
type Locale = 'en' | 'de';
type RunStatus = 'queued' | 'running' | 'passed' | 'warning' | 'failed' | 'cancelled';
type ExecutionMode = 'browser_harness' | 'project_command';
type AgentHarness = 'codex' | 'opencode' | 'prime-agent';
type ReasoningEffort = 'low' | 'medium' | 'xhigh';

interface E2eProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
  e2eConcurrencyLimit: number;
}

interface E2eSuite {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  position: number;
  enabled: boolean;
  updatedAt: string;
}

interface E2eAsset {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
}

interface E2eArtifact extends E2eAsset {}

interface E2eRun {
  id: string;
  batchId: string;
  projectId: string;
  suiteId: string | null;
  caseId: string | null;
  caseTitle: string;
  triggerType: 'manual' | 'task_status' | 'api';
  triggerTaskId: string | null;
  targetRevision: string | null;
  status: RunStatus;
  summary: string | null;
  output: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  artifacts: E2eArtifact[];
}

interface E2eCase {
  id: string;
  projectId: string;
  suiteId: string;
  title: string;
  scenario: string;
  preconditions: string;
  expectedResult: string;
  roles: string[];
  targetUrl: string | null;
  executionMode: ExecutionMode;
  agentHarness: AgentHarness;
  reasoningEffort: ReasoningEffort;
  runnerCommand: string;
  timeoutSeconds: number;
  triggerColumnKey: string | null;
  triggerOberthemaId: string | null;
  triggerUnterthemaId: string | null;
  enabled: boolean;
  position: number;
  assets: E2eAsset[];
  latestRun: E2eRun | null;
  updatedAt: string;
}

interface BoardColumn { id: string; key: string; nameEn: string; nameDe: string }
interface Topic { id: string; name: string }
interface Subtopic { id: string; name: string; oberthemaId: string }

const props = defineProps<{
  project: E2eProject;
  locale: Locale;
  isMobileViewport: boolean;
  sidebarCollapsed: boolean;
  columns: BoardColumn[];
  oberthemen: Topic[];
  unterthemen: Subtopic[];
}>();

const emit = defineEmits<{ showBoard: []; showWiki: []; openSidebar: [] }>();

const copy = computed(() => props.locale === 'de' ? {
  board: 'Board', wiki: 'Wiki', e2e: 'E2E-Tests', suites: 'Test-Suites', search: 'Testfälle durchsuchen …',
  newSuite: 'Neue Suite', newCase: 'Neuer Testfall', runSuite: 'Suite starten', runCase: 'Test starten',
  edit: 'Bearbeiten', save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', enabled: 'Aktiv', disabled: 'Deaktiviert',
  emptyTitle: 'E2E-Regressionswissen, das ausführbar bleibt',
  emptyBody: 'Lege eine Suite an und beschreibe Testfälle zentral. Die eigentlichen Smoke- oder Browser-Runner dürfen weiterhin im Projekt liegen.',
  suiteName: 'Name der Suite', suiteDescription: 'Zweck und Abdeckung', createSuite: 'Suite anlegen',
  caseTitle: 'Titel des Testfalls', chooseSuite: 'Suite', createCase: 'Testfall anlegen',
  scenario: 'Aufgabenkarte / Szenario', scenarioHint: 'Beschreibe das fachliche Ziel, ohne fragile Klickanweisungen vorzugeben.',
  preconditions: 'Ausgangslage und Guidance', expected: 'Überprüfbares Ergebnis', roles: 'Testpersonen und Rollen', rolesHint: 'Kommagetrennt, z. B. CEO, Personalverwaltung, Mitarbeitende',
  targetUrl: 'Zielsystem', command: 'Runner-Kommando im Projekt', commandHint: 'Wird im konfigurierten Projektordner ausgeführt. Der Runner erhält Testfall, Dateien und Artefaktpfad über AGENT_KANBAN_E2E_*.',
  executionMode: 'Ausführungsart', browserHarness: 'Agentischer Browser-Harness', projectCommand: 'Projekt-Smoke-Command', harness: 'Browser-Agent', effort: 'Reasoning',
  browserHint: 'Der Agent spielt das Szenario wie eine echte Testperson direkt im Zielsystem durch. Rollen, Guidance, Dateien und Erfolgskriterien werden als unveränderlicher Run-Snapshot übergeben.',
  credentialsHint: 'Testzugänge bleiben im Zielprojekt bzw. Testsystem. Agent Kanban speichert keine Passwörter im Testfall.',
  timeout: 'Timeout in Sekunden', trigger: 'Automatischer Trigger', manualOnly: 'Nur manuell', topic: 'Oberthema eingrenzen', allTopics: 'Alle Oberthemen', subtopic: 'Unterthema eingrenzen', allSubtopics: 'Alle Unterthemen',
  assets: 'Testdateien', addFiles: 'Dateien hinzufügen', noAssets: 'Noch keine Dateien hinterlegt.', execution: 'Ausführung', setup: 'Szenariokontext', successContract: 'Erwartetes Ergebnis',
  recentRuns: 'Letzte Läufe', noRuns: 'Dieser Testfall wurde noch nicht ausgeführt.', output: 'Runner-Ausgabe', artifacts: 'Artefakte',
  loading: 'E2E-Testfälle werden geladen …', retry: 'Erneut versuchen', genericError: 'Die E2E-Aktion konnte nicht abgeschlossen werden.',
  deleteCaseConfirm: 'Diesen Testfall und seine Dateien wirklich löschen?', deleteSuiteConfirm: 'Diese leere Suite wirklich löschen?',
  suiteNotEmpty: 'Die Suite enthält noch Testfälle. Lösche oder verschiebe diese zuerst.', stale: 'Der Testfall wurde zwischenzeitlich geändert. Lade ihn neu und prüfe deine Eingaben.',
  commandAdmin: 'Projekt-Smoke-Commands dürfen aus Sicherheitsgründen nur Administratoren konfigurieren.',
  queued: 'Eingereiht', running: 'Läuft', passed: 'Bestanden', warning: 'Hinweis', failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen',
  manual: 'Manuell', taskStatus: 'Task-Status', api: 'API', cancelRun: 'Lauf abbrechen', concurrency: 'parallele Läufe',
  selectCase: 'Wähle links einen Testfall aus.', runnerContract: 'Runner-Vertrag', runnerContractText: 'Exit-Code 0 bedeutet bestanden. Optional kann der Runner mit AGENT_KANBAN_RESULT={"status":"warning","summary":"…"} eine genauere Bewertung zurückgeben.',
  browserContract: 'Der Harness steuert einen isolierten Browser, prüft das erwartete Ergebnis und legt bei Warnungen oder Fehlern Screenshots als Artefakte ab.',
} : {
  board: 'Board', wiki: 'Wiki', e2e: 'E2E tests', suites: 'Test suites', search: 'Search test cases …',
  newSuite: 'New suite', newCase: 'New test case', runSuite: 'Run suite', runCase: 'Run test',
  edit: 'Edit', save: 'Save', cancel: 'Cancel', delete: 'Delete', enabled: 'Enabled', disabled: 'Disabled',
  emptyTitle: 'Executable E2E regression knowledge',
  emptyBody: 'Create a suite and keep the test cases central. Existing smoke or browser runners can stay inside the project.',
  suiteName: 'Suite name', suiteDescription: 'Purpose and coverage', createSuite: 'Create suite',
  caseTitle: 'Test case title', chooseSuite: 'Suite', createCase: 'Create test case',
  scenario: 'Task card / scenario', scenarioHint: 'Describe the business goal without prescribing brittle click instructions.',
  preconditions: 'Initial state and guidance', expected: 'Verifiable outcome', roles: 'Test actors and roles', rolesHint: 'Comma-separated, e.g. CEO, HR, Employee',
  targetUrl: 'Target system', command: 'Project runner command', commandHint: 'Runs in the configured project folder. The runner receives the case, files, and artifact path through AGENT_KANBAN_E2E_*.',
  executionMode: 'Execution mode', browserHarness: 'Agentic browser harness', projectCommand: 'Project smoke command', harness: 'Browser agent', effort: 'Reasoning',
  browserHint: 'The agent plays through the scenario like a real test person in the target system. Roles, guidance, files, and success criteria are passed as an immutable run snapshot.',
  credentialsHint: 'Test accounts stay in the target project or test environment. Agent Kanban does not store passwords in the test case.',
  timeout: 'Timeout in seconds', trigger: 'Automatic trigger', manualOnly: 'Manual only', topic: 'Limit to topic', allTopics: 'All topics', subtopic: 'Limit to subtopic', allSubtopics: 'All subtopics',
  assets: 'Test files', addFiles: 'Add files', noAssets: 'No files attached yet.', execution: 'Execution', setup: 'Scenario context', successContract: 'Expected outcome',
  recentRuns: 'Recent runs', noRuns: 'This test case has not run yet.', output: 'Runner output', artifacts: 'Artifacts',
  loading: 'Loading E2E tests …', retry: 'Try again', genericError: 'The E2E action could not be completed.',
  deleteCaseConfirm: 'Delete this test case and its files?', deleteSuiteConfirm: 'Delete this empty suite?',
  suiteNotEmpty: 'This suite still contains test cases. Delete or move them first.', stale: 'This test case changed in the meantime. Reload it and review your input.',
  commandAdmin: 'For security, only administrators may configure project smoke commands.',
  queued: 'Queued', running: 'Running', passed: 'Passed', warning: 'Warning', failed: 'Failed', cancelled: 'Cancelled',
  manual: 'Manual', taskStatus: 'Task status', api: 'API', cancelRun: 'Cancel run', concurrency: 'parallel runs',
  selectCase: 'Select a test case on the left.', runnerContract: 'Runner contract', runnerContractText: 'Exit code 0 means passed. The runner may optionally return AGENT_KANBAN_RESULT={"status":"warning","summary":"…"} for a more precise result.',
  browserContract: 'The harness controls an isolated browser, verifies the expected result, and stores screenshots as artifacts for warnings or failures.',
});

const suites = ref<E2eSuite[]>([]);
const cases = ref<E2eCase[]>([]);
const runs = ref<E2eRun[]>([]);
const selectedCaseId = ref<string | null>(null);
const searchQuery = ref('');
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const errorMessage = ref<string | null>(null);
const suiteModalOpen = ref(false);
const caseModalOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const suiteForm = reactive({ name: '', description: '' });
const caseForm = reactive({ suiteId: '', title: '' });
const draft = reactive(emptyDraft());
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function emptyDraft() {
  return {
    suiteId: '', title: '', scenario: '', preconditions: '', expectedResult: '', roles: '', targetUrl: '',
    executionMode: 'browser_harness' as ExecutionMode, agentHarness: 'codex' as AgentHarness, reasoningEffort: 'xhigh' as ReasoningEffort,
    runnerCommand: '', timeoutSeconds: 900, triggerColumnKey: '__manual__', triggerOberthemaId: '__all__',
    triggerUnterthemaId: '__all__', enabled: true,
  };
}

const selectedCase = computed(() => cases.value.find((item) => item.id === selectedCaseId.value) ?? null);
const selectedSuite = computed(() => suites.value.find((item) => item.id === selectedCase.value?.suiteId) ?? null);
const filteredCases = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase(props.locale === 'de' ? 'de-CH' : 'en');
  if (!query) return cases.value;
  return cases.value.filter((item) => `${item.title}\n${item.scenario}\n${item.roles.join(' ')}`.toLocaleLowerCase().includes(query));
});
const suiteRows = computed(() => suites.value.map((suite) => ({
  suite,
  cases: filteredCases.value.filter((item) => item.suiteId === suite.id),
})));
const selectedRuns = computed(() => runs.value.filter((run) => run.caseId === selectedCaseId.value).slice(0, 20));
const hasActiveRuns = computed(() => runs.value.some((run) => ['queued', 'running'].includes(run.status)));
const triggerColumnItems = computed(() => [
  { label: copy.value.manualOnly, value: '__manual__' },
  ...props.columns.map((column) => ({ label: props.locale === 'de' ? column.nameDe : column.nameEn, value: column.key })),
]);
const suiteItems = computed(() => suites.value.map((suite) => ({ label: suite.name, value: suite.id })));
const executionModeItems = computed(() => [
  { label: copy.value.browserHarness, value: 'browser_harness' },
  { label: copy.value.projectCommand, value: 'project_command' },
]);
const harnessItems = [
  { label: 'Codex', value: 'codex' },
  { label: 'OpenCode', value: 'opencode' },
  { label: 'Prime Agent', value: 'prime-agent' },
];
const effortItems = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'XHigh', value: 'xhigh' },
];
const caseItems = computed(() => cases.value.map((testCase) => ({
  label: `${suites.value.find((suite) => suite.id === testCase.suiteId)?.name ?? ''} · ${testCase.title}`,
  value: testCase.id,
})));
const topicItems = computed(() => [{ label: copy.value.allTopics, value: '__all__' }, ...props.oberthemen.map((topic) => ({ label: topic.name, value: topic.id }))]);
const subtopicItems = computed(() => [{ label: copy.value.allSubtopics, value: '__all__' }, ...props.unterthemen
  .filter((subtopic) => draft.triggerOberthemaId === '__all__' || subtopic.oberthemaId === draft.triggerOberthemaId)
  .map((subtopic) => ({ label: subtopic.name, value: subtopic.id }))]);

watch(() => props.project.id, () => void loadData());
watch(selectedCase, resetDraft);
watch(hasActiveRuns, () => schedulePoll());
watch(() => draft.triggerOberthemaId, (topicId) => {
  if (topicId === '__all__' || !props.unterthemen.some((item) => item.id === draft.triggerUnterthemaId && item.oberthemaId === topicId)) {
    draft.triggerUnterthemaId = '__all__';
  }
});

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  void loadData();
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (pollTimer) clearTimeout(pollTimer);
});

async function loadData(silent = false) {
  if (!silent) loading.value = true;
  if (!silent) errorMessage.value = null;
  try {
    const response = await $fetch<{ suites: E2eSuite[]; cases: E2eCase[]; runs: E2eRun[] }>(`/api/projects/${props.project.id}/e2e`);
    suites.value = response.suites;
    cases.value = response.cases;
    runs.value = response.runs;
    const routeCaseId = caseIdFromHash();
    selectedCaseId.value = cases.value.some((item) => item.id === routeCaseId)
      ? routeCaseId
      : cases.value.some((item) => item.id === selectedCaseId.value) ? selectedCaseId.value : cases.value[0]?.id ?? null;
    syncHash();
    resetDraft();
    schedulePoll();
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    loading.value = false;
  }
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  if (!import.meta.client || document.hidden) return;
  pollTimer = setTimeout(() => void loadData(true), hasActiveRuns.value ? 2500 : 10_000);
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    return;
  }
  void loadData(true);
}

function selectCase(caseId: string) {
  if (editing.value && !confirm(props.locale === 'de' ? 'Ungespeicherte Änderungen verwerfen?' : 'Discard unsaved changes?')) return;
  editing.value = false;
  selectedCaseId.value = caseId;
  syncHash();
}

function resetDraft() {
  const testCase = selectedCase.value;
  Object.assign(draft, testCase ? {
    suiteId: testCase.suiteId,
    title: testCase.title,
    scenario: testCase.scenario,
    preconditions: testCase.preconditions,
    expectedResult: testCase.expectedResult,
    roles: testCase.roles.join(', '),
    targetUrl: testCase.targetUrl ?? '',
    executionMode: testCase.executionMode,
    agentHarness: testCase.agentHarness,
    reasoningEffort: testCase.reasoningEffort,
    runnerCommand: testCase.runnerCommand,
    timeoutSeconds: testCase.timeoutSeconds,
    triggerColumnKey: testCase.triggerColumnKey ?? '__manual__',
    triggerOberthemaId: testCase.triggerOberthemaId ?? '__all__',
    triggerUnterthemaId: testCase.triggerUnterthemaId ?? '__all__',
    enabled: testCase.enabled,
  } : emptyDraft());
}

async function createSuite() {
  if (!suiteForm.name.trim() || saving.value) return;
  saving.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ suite: E2eSuite }>(`/api/projects/${props.project.id}/e2e/suites`, {
      method: 'POST', body: { name: suiteForm.name, description: suiteForm.description || null },
    });
    suiteModalOpen.value = false;
    Object.assign(suiteForm, { name: '', description: '' });
    await loadData(true);
    caseForm.suiteId = response.suite.id;
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

function openCaseModal(suiteId?: string) {
  caseForm.suiteId = suiteId ?? selectedSuite.value?.id ?? suites.value[0]?.id ?? '';
  caseForm.title = '';
  caseModalOpen.value = true;
}

async function createCase() {
  if (!caseForm.suiteId || !caseForm.title.trim() || saving.value) return;
  saving.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ case: E2eCase }>(`/api/projects/${props.project.id}/e2e/cases`, {
      method: 'POST', body: { suiteId: caseForm.suiteId, title: caseForm.title },
    });
    caseModalOpen.value = false;
    await loadData(true);
    selectedCaseId.value = response.case.id;
    syncHash();
    editing.value = true;
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

async function saveCase() {
  if (!selectedCase.value || !draft.title.trim() || saving.value) return;
  saving.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ case: E2eCase }>(`/api/e2e-cases/${selectedCase.value.id}`, {
      method: 'PATCH',
      body: {
        suiteId: draft.suiteId,
        title: draft.title,
        scenario: draft.scenario,
        preconditions: draft.preconditions,
        expectedResult: draft.expectedResult,
        roles: draft.roles.split(',').map((role) => role.trim()).filter(Boolean),
        targetUrl: draft.targetUrl || null,
        executionMode: draft.executionMode,
        agentHarness: draft.agentHarness,
        reasoningEffort: draft.reasoningEffort,
        runnerCommand: draft.runnerCommand,
        timeoutSeconds: Number(draft.timeoutSeconds),
        triggerColumnKey: draft.triggerColumnKey === '__manual__' ? null : draft.triggerColumnKey,
        triggerOberthemaId: draft.triggerColumnKey === '__manual__' || draft.triggerOberthemaId === '__all__' ? null : draft.triggerOberthemaId,
        triggerUnterthemaId: draft.triggerColumnKey === '__manual__' || draft.triggerUnterthemaId === '__all__' ? null : draft.triggerUnterthemaId,
        enabled: draft.enabled,
        expectedUpdatedAt: selectedCase.value.updatedAt,
      },
    });
    cases.value = cases.value.map((item) => item.id === response.case.id ? response.case : item);
    editing.value = false;
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

async function deleteCase() {
  if (!selectedCase.value || !confirm(copy.value.deleteCaseConfirm)) return;
  saving.value = true;
  try {
    await $fetch(`/api/e2e-cases/${selectedCase.value.id}`, { method: 'DELETE' });
    selectedCaseId.value = null;
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

async function deleteSuite(suite: E2eSuite) {
  if (!confirm(copy.value.deleteSuiteConfirm)) return;
  saving.value = true;
  try {
    await $fetch(`/api/e2e-suites/${suite.id}`, { method: 'DELETE' });
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

async function runCase(testCase: E2eCase) {
  saving.value = true;
  errorMessage.value = null;
  try {
    await $fetch(`/api/e2e-cases/${testCase.id}/runs`, { method: 'POST', body: {} });
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

async function runSuite(suite: E2eSuite) {
  saving.value = true;
  errorMessage.value = null;
  try {
    await $fetch(`/api/e2e-suites/${suite.id}/runs`, { method: 'POST', body: {} });
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); } finally { saving.value = false; }
}

async function cancelRun(run: E2eRun) {
  try {
    await $fetch(`/api/e2e-runs/${run.id}/cancel`, { method: 'POST' });
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); }
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!selectedCase.value || !input.files?.length) return;
  const form = new FormData();
  for (const file of input.files) form.append('files', file, file.name);
  saving.value = true;
  try {
    await $fetch(`/api/e2e-cases/${selectedCase.value.id}/assets`, { method: 'POST', body: form });
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); } finally {
    saving.value = false;
    input.value = '';
  }
}

async function deleteAsset(asset: E2eAsset) {
  try {
    await $fetch(`/api/e2e-assets/${asset.id}`, { method: 'DELETE' });
    await loadData(true);
  } catch (error) { errorMessage.value = humanError(error); }
}

function suiteStatus(suiteId: string): RunStatus | null {
  const suiteCases = cases.value.filter((item) => item.suiteId === suiteId);
  const statuses = suiteCases.map((item) => item.latestRun?.status).filter((status): status is RunStatus => Boolean(status));
  return ['running', 'queued', 'failed', 'warning', 'cancelled', 'passed'].find((status) => statuses.includes(status as RunStatus)) as RunStatus | undefined ?? null;
}

function statusLabel(status: RunStatus) { return copy.value[status]; }
function statusColor(status: RunStatus) {
  return ({ passed: 'success', warning: 'warning', failed: 'error', running: 'primary', queued: 'neutral', cancelled: 'neutral' } as const)[status];
}
function statusIcon(status: RunStatus) {
  return ({ passed: 'i-lucide-circle-check', warning: 'i-lucide-triangle-alert', failed: 'i-lucide-circle-x', running: 'i-lucide-loader-circle', queued: 'i-lucide-clock-3', cancelled: 'i-lucide-ban' } as const)[status];
}
function canRunCase(testCase: E2eCase) {
  if (!testCase.enabled || ['queued', 'running'].includes(testCase.latestRun?.status ?? '')) return false;
  return testCase.executionMode === 'project_command'
    ? Boolean(testCase.runnerCommand.trim())
    : Boolean(testCase.targetUrl && testCase.scenario.trim() && testCase.expectedResult.trim());
}
function triggerLabel(run: E2eRun) { return run.triggerType === 'task_status' ? copy.value.taskStatus : run.triggerType === 'api' ? copy.value.api : copy.value.manual; }
function caseTriggerLabel(testCase: E2eCase) {
  return testCase.triggerColumnKey
    ? triggerColumnItems.value.find((item) => item.value === testCase.triggerColumnKey)?.label ?? testCase.triggerColumnKey
    : copy.value.manualOnly;
}
function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-CH' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function syncHash() {
  if (!import.meta.client) return;
  const base = `${window.location.pathname}${window.location.search}`;
  const suffix = selectedCaseId.value ? `/${encodeURIComponent(props.project.id)}/${encodeURIComponent(selectedCaseId.value)}` : `/${encodeURIComponent(props.project.id)}`;
  window.history.replaceState(window.history.state, '', `${base}#e2e${suffix}`);
}
function caseIdFromHash() {
  if (!import.meta.client) return null;
  const match = window.location.hash.match(/^#e2e\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]!) === props.project.id ? decodeURIComponent(match[2]!) : null; } catch { return null; }
}
function humanError(error: unknown) {
  const value = error as { data?: { statusMessage?: string }; statusMessage?: string; message?: string };
  const code = value.data?.statusMessage ?? value.statusMessage ?? value.message ?? '';
  if (code.includes('e2e_suite_not_empty')) return copy.value.suiteNotEmpty;
  if (code.includes('e2e_record_stale')) return copy.value.stale;
  if (code.includes('e2e_project_command_admin_required')) return copy.value.commandAdmin;
  return code || copy.value.genericError;
}

defineExpose({ refreshTests: () => loadData(true) });
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <UButton class="shrink-0 md:hidden" data-mobile-sidebar-trigger color="neutral" variant="soft" size="sm" icon="i-lucide-menu" :aria-label="copy.e2e" @click="emit('openSidebar')" />
      <div class="hidden min-w-0 shrink-0 items-center gap-2 sm:flex sm:max-w-40 xl:max-w-52" :title="project.description ?? project.name">
        <span class="hidden shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold tracking-wide text-zinc-600 xl:inline-flex dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{{ project.key }}</span>
        <h1 class="ak-display truncate text-base font-semibold tracking-tight text-zinc-950 dark:text-white">{{ project.name }}</h1>
      </div>
      <div class="ak-surface-switch" role="tablist" :aria-label="project.name">
        <button type="button" role="tab" class="ak-surface-switch-button" :aria-label="copy.board" :aria-selected="false" @click="emit('showBoard')"><UIcon name="i-lucide-columns-3" class="size-3.5" /><span class="hidden sm:inline">{{ copy.board }}</span></button>
        <button type="button" role="tab" class="ak-surface-switch-button" :aria-label="copy.wiki" :aria-selected="false" @click="emit('showWiki')"><UIcon name="i-lucide-notebook-tabs" class="size-3.5" /><span class="hidden sm:inline">{{ copy.wiki }}</span></button>
        <button type="button" role="tab" class="ak-surface-switch-button is-active" :aria-label="copy.e2e" :aria-selected="true"><UIcon name="i-lucide-flask-conical" class="size-3.5" /><span class="hidden sm:inline">{{ copy.e2e }}</span></button>
      </div>
      <USelect :model-value="selectedCaseId ?? undefined" class="min-w-0 flex-1 md:hidden" :items="caseItems" size="sm" icon="i-lucide-flask-conical" :aria-label="copy.selectCase" @update:model-value="(value) => value && selectCase(String(value))" />
      <span class="ml-auto hidden items-center gap-1.5 text-xs text-zinc-500 lg:flex"><UIcon name="i-lucide-layers-3" class="size-3.5" />{{ project.e2eConcurrencyLimit }} {{ copy.concurrency }}</span>
      <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-folder-plus" :aria-label="copy.newSuite" @click="suiteModalOpen = true"><span class="hidden sm:inline">{{ copy.newSuite }}</span></UButton>
      <UButton class="ak-e2e-primary-action" :disabled="!suites.length" size="sm" icon="i-lucide-file-plus-2" :aria-label="copy.newCase" @click="openCaseModal()"><span class="hidden sm:inline">{{ copy.newCase }}</span></UButton>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" :actions="loading ? [{ label: copy.retry, onClick: () => loadData() }] : undefined" />

    <div v-if="loading" class="grid min-h-0 flex-1 place-items-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div class="grid justify-items-center gap-3 text-sm text-zinc-500"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-teal-600" /><span>{{ copy.loading }}</span></div>
    </div>

    <div v-else-if="!suites.length" class="grid min-h-0 flex-1 place-items-center overflow-y-auto rounded-xl border border-zinc-200 bg-white px-6 py-12 dark:border-zinc-800 dark:bg-zinc-950">
      <div class="max-w-2xl text-center">
        <span class="mx-auto grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-900"><UIcon name="i-lucide-flask-conical" class="size-6" /></span>
        <h2 class="ak-display mt-5 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">{{ copy.emptyTitle }}</h2>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">{{ copy.emptyBody }}</p>
        <UButton class="ak-e2e-primary-action mt-6" icon="i-lucide-folder-plus" @click="suiteModalOpen = true">{{ copy.newSuite }}</UButton>
      </div>
    </div>

    <div v-else class="ak-e2e-frame min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <aside class="hidden w-[290px] shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/55 md:flex" :aria-label="copy.suites">
        <div class="border-b border-zinc-200 p-3 dark:border-zinc-800"><UInput v-model="searchQuery" class="w-full" size="sm" icon="i-lucide-search" :placeholder="copy.search" :aria-label="copy.search" /></div>
        <nav class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <section v-for="row in suiteRows" :key="row.suite.id" class="mb-4">
            <div class="group flex items-center gap-1 px-2 pb-1.5">
              <span class="ak-e2e-status-dot" :class="suiteStatus(row.suite.id) ? `is-${suiteStatus(row.suite.id)}` : 'is-empty'" />
              <span class="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-600 dark:text-zinc-400">{{ row.suite.name }}</span>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-play" :aria-label="copy.runSuite" @click="runSuite(row.suite)" />
              <UButton v-if="!row.cases.length" size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="copy.delete" @click="deleteSuite(row.suite)" />
            </div>
            <button v-for="testCase in row.cases" :key="testCase.id" type="button" class="ak-e2e-case-row" :class="selectedCaseId === testCase.id ? 'is-active' : ''" @click="selectCase(testCase.id)">
              <span class="ak-e2e-status-rail" :class="testCase.latestRun ? `is-${testCase.latestRun.status}` : 'is-empty'" />
              <span class="min-w-0 flex-1"><strong>{{ testCase.title }}</strong><small>{{ testCase.roles.join(' · ') || copy.manualOnly }}</small></span>
              <UIcon v-if="testCase.latestRun?.status === 'running'" name="i-lucide-loader-circle" class="size-3.5 animate-spin text-teal-600" />
            </button>
            <button v-if="!row.cases.length" type="button" class="mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-left text-xs text-zinc-500 hover:border-teal-400 hover:text-teal-700 dark:border-zinc-700" @click="openCaseModal(row.suite.id)"><UIcon name="i-lucide-plus" />{{ copy.newCase }}</button>
          </section>
        </nav>
      </aside>

      <div class="min-w-0 flex-1 overflow-y-auto">
        <div v-if="!selectedCase" class="grid min-h-full place-items-center p-8 text-sm text-zinc-500">{{ copy.selectCase }}</div>
        <template v-else>
          <header class="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:px-6">
            <span class="grid size-9 shrink-0 place-items-center rounded-xl" :class="selectedCase.latestRun?.status === 'passed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : selectedCase.latestRun?.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'"><UIcon :name="selectedCase.latestRun ? statusIcon(selectedCase.latestRun.status) : 'i-lucide-flask-conical'" :class="selectedCase.latestRun?.status === 'running' ? 'animate-spin' : ''" /></span>
            <div class="min-w-0 flex-1"><p class="truncate text-[11px] font-bold uppercase tracking-[0.1em] text-teal-700 dark:text-teal-400">{{ selectedSuite?.name }}</p><h2 class="ak-display truncate text-lg font-semibold text-zinc-950 dark:text-white">{{ selectedCase.title }}</h2></div>
            <UBadge v-if="selectedCase.latestRun" :color="statusColor(selectedCase.latestRun.status)" variant="soft" :icon="statusIcon(selectedCase.latestRun.status)" class="ak-e2e-status-badge" :class="`is-${selectedCase.latestRun.status}`">{{ statusLabel(selectedCase.latestRun.status) }}</UBadge>
            <template v-if="editing">
              <UButton color="neutral" variant="ghost" icon="i-lucide-x" :disabled="saving" @click="editing = false; resetDraft()">{{ copy.cancel }}</UButton>
              <UButton class="ak-e2e-primary-action" icon="i-lucide-check" :loading="saving" @click="saveCase">{{ copy.save }}</UButton>
            </template>
            <template v-else>
              <UButton color="neutral" variant="soft" icon="i-lucide-pencil-line" @click="editing = true">{{ copy.edit }}</UButton>
              <UButton class="ak-e2e-primary-action" icon="i-lucide-play" :loading="saving" :disabled="!canRunCase(selectedCase)" @click="runCase(selectedCase)">{{ copy.runCase }}</UButton>
            </template>
          </header>

          <form v-if="editing" class="ak-e2e-case-content mx-auto grid max-w-5xl gap-6 p-4 sm:p-6" @submit.prevent="saveCase">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="copy.caseTitle" required><UInput v-model="draft.title" class="w-full" size="lg" /></UFormField>
              <UFormField :label="copy.chooseSuite" required><USelect v-model="draft.suiteId" class="w-full" :items="suiteItems" size="lg" /></UFormField>
            </div>
            <UFormField :label="copy.scenario" :description="copy.scenarioHint"><UTextarea v-model="draft.scenario" class="w-full" :rows="7" autoresize /></UFormField>
            <div class="grid gap-5 lg:grid-cols-2">
              <UFormField :label="copy.preconditions"><UTextarea v-model="draft.preconditions" class="w-full" :rows="6" autoresize /></UFormField>
              <UFormField :label="copy.expected"><UTextarea v-model="draft.expectedResult" class="w-full" :rows="6" autoresize /></UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="copy.roles" :description="copy.rolesHint"><UInput v-model="draft.roles" class="w-full" icon="i-lucide-users" /></UFormField>
              <UFormField :label="copy.targetUrl"><UInput v-model="draft.targetUrl" class="w-full" type="url" icon="i-lucide-globe-2" placeholder="https://test.example.com" /></UFormField>
            </div>
            <section class="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/45">
              <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <UFormField :label="copy.executionMode"><USelect v-model="draft.executionMode" class="w-full" :items="executionModeItems" /></UFormField>
                <UFormField :label="copy.timeout"><UInput v-model.number="draft.timeoutSeconds" class="w-full" type="number" min="10" max="7200" /></UFormField>
              </div>
              <template v-if="draft.executionMode === 'browser_harness'">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField :label="copy.harness"><USelect v-model="draft.agentHarness" class="w-full" :items="harnessItems" /></UFormField>
                  <UFormField :label="copy.effort"><USelect v-model="draft.reasoningEffort" class="w-full" :items="effortItems" /></UFormField>
                </div>
                <p class="text-xs leading-5 text-zinc-600 dark:text-zinc-400">{{ copy.browserHint }} {{ copy.credentialsHint }}</p>
              </template>
              <UFormField v-else :label="copy.command" :description="copy.commandHint"><UTextarea v-model="draft.runnerCommand" class="w-full font-mono text-xs" :rows="4" /></UFormField>
            </section>
            <section class="grid gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-3">
              <UFormField :label="copy.trigger"><USelect v-model="draft.triggerColumnKey" class="w-full" :items="triggerColumnItems" /></UFormField>
              <UFormField :label="copy.topic"><USelect v-model="draft.triggerOberthemaId" class="w-full" :items="topicItems" :disabled="draft.triggerColumnKey === '__manual__'" /></UFormField>
              <UFormField :label="copy.subtopic"><USelect v-model="draft.triggerUnterthemaId" class="w-full" :items="subtopicItems" :disabled="draft.triggerColumnKey === '__manual__' || draft.triggerOberthemaId === '__all__'" /></UFormField>
            </section>
            <div class="flex items-center justify-between border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <UButton color="error" variant="soft" type="button" icon="i-lucide-trash-2" @click="deleteCase">{{ copy.delete }}</UButton>
              <USwitch v-model="draft.enabled" :label="draft.enabled ? copy.enabled : copy.disabled" />
            </div>
          </form>

          <div v-else class="ak-e2e-case-content mx-auto grid max-w-5xl gap-6 p-4 sm:p-6">
            <section class="ak-e2e-task-card"><span class="ak-e2e-card-label"><UIcon name="i-lucide-clipboard-list" />{{ copy.scenario }}</span><p>{{ selectedCase.scenario || '—' }}</p></section>
            <div class="grid gap-5 lg:grid-cols-2">
              <section class="ak-e2e-detail-card"><h3><UIcon name="i-lucide-map" />{{ copy.setup }}</h3><p class="whitespace-pre-wrap">{{ selectedCase.preconditions || '—' }}</p></section>
              <section class="ak-e2e-detail-card is-success"><h3><UIcon name="i-lucide-badge-check" />{{ copy.successContract }}</h3><p class="whitespace-pre-wrap">{{ selectedCase.expectedResult || '—' }}</p></section>
            </div>
            <div class="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <section class="ak-e2e-detail-card">
                <h3><UIcon name="i-lucide-users" />{{ copy.roles }}</h3>
                <div class="mt-3 flex flex-wrap gap-2"><UBadge v-for="role in selectedCase.roles" :key="role" color="primary" variant="soft" icon="i-lucide-user-round" class="ak-e2e-role-badge">{{ role }}</UBadge><span v-if="!selectedCase.roles.length" class="text-sm text-zinc-500">—</span></div>
                <dl class="mt-5 grid gap-3 text-sm"><div><dt>{{ copy.targetUrl }}</dt><dd><a v-if="selectedCase.targetUrl" :href="selectedCase.targetUrl" target="_blank" rel="noreferrer">{{ selectedCase.targetUrl }}</a><span v-else>—</span></dd></div><div><dt>{{ copy.trigger }}</dt><dd>{{ caseTriggerLabel(selectedCase) }}</dd></div><div><dt>{{ copy.timeout }}</dt><dd>{{ selectedCase.timeoutSeconds }} s</dd></div></dl>
              </section>
              <section class="ak-e2e-detail-card">
                <h3><UIcon :name="selectedCase.executionMode === 'browser_harness' ? 'i-lucide-bot' : 'i-lucide-terminal-square'" />{{ copy.execution }}</h3>
                <template v-if="selectedCase.executionMode === 'browser_harness'">
                  <div class="mt-3 flex flex-wrap gap-2"><UBadge color="primary" variant="soft" class="ak-e2e-role-badge">{{ copy.browserHarness }}</UBadge><UBadge color="neutral" variant="soft">{{ selectedCase.agentHarness }}</UBadge><UBadge color="neutral" variant="soft">{{ selectedCase.reasoningEffort }}</UBadge></div>
                  <p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{{ copy.browserContract }}</p>
                  <p class="mt-2 text-xs leading-5 text-zinc-500">{{ copy.credentialsHint }}</p>
                </template>
                <template v-else>
                  <pre class="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-5 text-zinc-100"><code>{{ selectedCase.runnerCommand || '—' }}</code></pre>
                  <details class="mt-3 text-xs text-zinc-500"><summary class="cursor-pointer font-semibold text-zinc-700 dark:text-zinc-300">{{ copy.runnerContract }}</summary><p class="mt-2 leading-5">{{ copy.runnerContractText }}</p></details>
                </template>
              </section>
            </div>
            <section class="ak-e2e-detail-card">
              <div class="flex items-center justify-between gap-3"><h3><UIcon name="i-lucide-paperclip" />{{ copy.assets }}</h3><UButton color="neutral" variant="soft" size="sm" icon="i-lucide-upload" :loading="saving" @click="fileInput?.click()">{{ copy.addFiles }}</UButton><input ref="fileInput" class="hidden" type="file" multiple :aria-label="copy.addFiles" @change="uploadFiles" /></div>
              <div v-if="selectedCase.assets.length" class="mt-3 grid gap-2 sm:grid-cols-2"><div v-for="asset in selectedCase.assets" :key="asset.id" class="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"><span class="grid size-8 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-900"><UIcon name="i-lucide-file" /></span><a :href="`${asset.url}?download=1`" class="min-w-0 flex-1"><strong class="block truncate text-sm">{{ asset.fileName }}</strong><small class="text-zinc-500">{{ formatBytes(asset.size) }}</small></a><UButton color="error" variant="ghost" size="xs" icon="i-lucide-x" :aria-label="copy.delete" @click="deleteAsset(asset)" /></div></div>
              <p v-else class="mt-3 text-sm text-zinc-500">{{ copy.noAssets }}</p>
            </section>
            <section class="ak-e2e-detail-card">
              <h3><UIcon name="i-lucide-history" />{{ copy.recentRuns }}</h3>
              <div v-if="selectedRuns.length" class="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                <article v-for="run in selectedRuns" :key="run.id" class="py-4 first:pt-1 last:pb-0">
                  <div class="flex flex-wrap items-center gap-2"><UBadge :color="statusColor(run.status)" variant="soft" :icon="statusIcon(run.status)" class="ak-e2e-status-badge" :class="`is-${run.status}`">{{ statusLabel(run.status) }}</UBadge><span class="text-xs font-medium text-zinc-500">{{ triggerLabel(run) }} · {{ formatDate(run.createdAt) }}</span><code v-if="run.targetRevision" class="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] dark:bg-zinc-900">{{ run.targetRevision.slice(0, 12) }}</code><UButton v-if="['queued', 'running'].includes(run.status)" class="ml-auto" color="neutral" variant="ghost" size="xs" icon="i-lucide-square" @click="cancelRun(run)">{{ copy.cancelRun }}</UButton></div>
                  <p v-if="run.summary" class="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{{ run.summary }}</p>
                  <div v-if="run.artifacts.length" class="mt-2 flex flex-wrap gap-2"><a v-for="artifact in run.artifacts" :key="artifact.id" :href="artifact.url" target="_blank" class="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-teal-50 hover:text-teal-800 dark:bg-zinc-900 dark:text-zinc-300"><UIcon name="i-lucide-image" />{{ artifact.fileName }}</a></div>
                  <details v-if="run.output" class="mt-2"><summary class="cursor-pointer text-xs font-semibold text-zinc-500">{{ copy.output }}</summary><pre class="mt-2 max-h-64 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-200"><code>{{ run.output }}</code></pre></details>
                </article>
              </div>
              <p v-else class="mt-3 text-sm text-zinc-500">{{ copy.noRuns }}</p>
            </section>
          </div>
        </template>
      </div>
    </div>

    <UModal v-model:open="suiteModalOpen" :title="copy.newSuite" :description="copy.suiteDescription">
      <template #body><form class="grid gap-4" @submit.prevent="createSuite"><UFormField :label="copy.suiteName" required><UInput v-model="suiteForm.name" class="w-full" autofocus /></UFormField><UFormField :label="copy.suiteDescription"><UTextarea v-model="suiteForm.description" class="w-full" :rows="4" /></UFormField><div class="flex justify-end gap-2"><UButton color="neutral" variant="ghost" type="button" @click="suiteModalOpen = false">{{ copy.cancel }}</UButton><UButton class="ak-e2e-primary-action" type="submit" icon="i-lucide-folder-plus" :loading="saving">{{ copy.createSuite }}</UButton></div></form></template>
    </UModal>
    <UModal v-model:open="caseModalOpen" :title="copy.newCase" :description="copy.scenarioHint">
      <template #body><form class="grid gap-4" @submit.prevent="createCase"><UFormField :label="copy.chooseSuite" required><USelect v-model="caseForm.suiteId" class="w-full" :items="suiteItems" /></UFormField><UFormField :label="copy.caseTitle" required><UInput v-model="caseForm.title" class="w-full" autofocus /></UFormField><div class="flex justify-end gap-2"><UButton color="neutral" variant="ghost" type="button" @click="caseModalOpen = false">{{ copy.cancel }}</UButton><UButton class="ak-e2e-primary-action" type="submit" icon="i-lucide-file-plus-2" :loading="saving">{{ copy.createCase }}</UButton></div></form></template>
    </UModal>
  </section>
</template>

<style scoped>
.ak-e2e-frame { display: flex; }
.ak-e2e-case-content { width: 100%; grid-template-columns: minmax(0, 1fr); }
.ak-e2e-case-content > * { min-width: 0; }
.ak-e2e-status-dot { width: .5rem; height: .5rem; flex: none; border-radius: 9999px; background: rgb(212 212 216); }
.ak-e2e-status-dot.is-passed, .ak-e2e-status-rail.is-passed { background: rgb(16 185 129); }
.ak-e2e-status-dot.is-warning, .ak-e2e-status-rail.is-warning { background: rgb(245 158 11); }
.ak-e2e-status-dot.is-failed, .ak-e2e-status-rail.is-failed { background: rgb(239 68 68); }
.ak-e2e-status-dot.is-running, .ak-e2e-status-rail.is-running { background: rgb(13 148 136); }
.ak-e2e-status-dot.is-queued, .ak-e2e-status-rail.is-queued { background: rgb(59 130 246); }
.ak-e2e-primary-action { background-color: rgb(15 118 110) !important; color: white !important; }
.ak-e2e-primary-action:hover { background-color: rgb(17 94 89) !important; }
.ak-e2e-role-badge { background-color: rgb(204 251 241) !important; color: rgb(17 94 89) !important; }
.ak-e2e-status-badge.is-passed { background-color: rgb(209 250 229) !important; color: rgb(6 95 70) !important; }
.ak-e2e-status-badge.is-warning { background-color: rgb(254 243 199) !important; color: rgb(120 53 15) !important; }
.ak-e2e-status-badge.is-failed { background-color: rgb(254 226 226) !important; color: rgb(153 27 27) !important; }
.ak-e2e-status-badge.is-running { background-color: rgb(204 251 241) !important; color: rgb(17 94 89) !important; }
.ak-e2e-status-badge.is-queued { background-color: rgb(219 234 254) !important; color: rgb(30 58 138) !important; }
.ak-e2e-status-badge.is-cancelled { background-color: rgb(228 228 231) !important; color: rgb(63 63 70) !important; }
.ak-e2e-case-row { display: flex; width: 100%; min-width: 0; align-items: stretch; gap: .625rem; overflow: hidden; border-radius: .6rem; padding: .45rem .55rem .45rem .25rem; text-align: left; color: rgb(63 63 70); transition: background-color .15s, color .15s; }
.ak-e2e-case-row:hover { background: rgb(244 244 245); }
.ak-e2e-case-row.is-active { background: rgb(240 253 250); color: rgb(15 118 110); box-shadow: inset 0 0 0 1px rgb(153 246 228); }
.ak-e2e-status-rail { width: .22rem; min-height: 2.25rem; flex: none; border-radius: 9999px; background: rgb(212 212 216); }
.ak-e2e-case-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8125rem; font-weight: 650; }
.ak-e2e-case-row small { display: block; overflow: hidden; margin-top: .1rem; color: rgb(113 113 122); font-size: .6875rem; text-overflow: ellipsis; white-space: nowrap; }
.ak-e2e-task-card { position: relative; overflow: hidden; border: 1px solid rgb(153 246 228); border-radius: 1rem; background: linear-gradient(135deg, rgb(240 253 250), rgb(255 255 255) 65%); padding: 1.35rem; }
.ak-e2e-task-card::before { position: absolute; inset: 0 auto 0 0; width: .3rem; background: rgb(13 148 136); content: ''; }
.ak-e2e-card-label { display: flex; align-items: center; gap: .45rem; color: rgb(15 118 110); font-size: .6875rem; font-weight: 750; letter-spacing: .09em; text-transform: uppercase; }
.ak-e2e-task-card p { margin-top: .75rem; white-space: pre-wrap; color: rgb(39 39 42); font-size: 1rem; line-height: 1.75; }
.ak-e2e-detail-card { border: 1px solid rgb(228 228 231); border-radius: .9rem; background: rgb(255 255 255); padding: 1rem; }
.ak-e2e-detail-card.is-success { border-color: rgb(187 247 208); background: rgb(240 253 244 / .38); }
.ak-e2e-detail-card h3 { display: flex; align-items: center; gap: .5rem; color: rgb(39 39 42); font-size: .75rem; font-weight: 750; letter-spacing: .055em; text-transform: uppercase; }
.ak-e2e-detail-card > p { margin-top: .75rem; color: rgb(82 82 91); font-size: .875rem; line-height: 1.65; }
.ak-e2e-detail-card dt { color: rgb(113 113 122); font-size: .6875rem; font-weight: 650; text-transform: uppercase; }
.ak-e2e-detail-card dd { margin-top: .15rem; overflow-wrap: anywhere; color: rgb(39 39 42); }
.ak-e2e-detail-card dd a { color: rgb(17 94 89); text-decoration: underline; text-underline-offset: 2px; }
:global(.dark) .ak-e2e-case-row { color: rgb(212 212 216); }
:global(.dark) .ak-e2e-case-row:hover { background: rgb(39 39 42); }
:global(.dark) .ak-e2e-case-row.is-active { background: rgb(19 78 74 / .5); color: rgb(153 246 228); box-shadow: inset 0 0 0 1px rgb(19 78 74); }
:global(.dark) .ak-e2e-task-card { border-color: rgb(19 78 74); background: linear-gradient(135deg, rgb(19 78 74 / .4), rgb(9 9 11) 70%); }
:global(.dark) .ak-e2e-task-card p { color: rgb(228 228 231); }
:global(.dark) .ak-e2e-detail-card { border-color: rgb(63 63 70); background: rgb(24 24 27); }
:global(.dark) .ak-e2e-detail-card.is-success { border-color: rgb(20 83 45); background: rgb(5 46 22 / .24); }
:global(.dark) .ak-e2e-detail-card h3, :global(.dark) .ak-e2e-detail-card dd { color: rgb(228 228 231); }
:global(.dark) .ak-e2e-detail-card > p { color: rgb(161 161 170); }
:global(.dark) .ak-e2e-detail-card dd a { color: rgb(94 234 212); }
:global(.dark) .ak-e2e-role-badge { background-color: rgb(19 78 74) !important; color: rgb(204 251 241) !important; }
@media (max-width: 767px) { .ak-e2e-frame { display: block; overflow-y: auto; } }
</style>
