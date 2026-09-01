<script setup lang="ts">
type Locale = 'en' | 'de';
type AgentHarness = 'codex' | 'opencode' | 'prime-agent';
type ReasoningEffort = 'low' | 'medium' | 'xhigh';

interface ProjectChat {
  id: string;
  projectId: string;
  wikiPageId: string | null;
  title: string;
  harness: AgentHarness;
  reasoningEffort: ReasoningEffort;
  status: 'ready' | 'running' | 'failed';
  isCurrent: boolean;
  sourceRevision: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectChatHistoryItem extends ProjectChat {
  preview: string;
}

interface ProjectChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: ProjectChatAttachment[];
  state: 'complete' | 'streaming' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

interface ProjectChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

interface PendingChatFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

interface ProjectChatToolActivity {
  id: string;
  kind: 'command' | 'file' | 'web' | 'kanban' | 'tool';
  label: string;
  detail: string | null;
  status: 'running' | 'completed' | 'failed';
}

interface ChatCapabilities {
  harnesses: Array<{ value: AgentHarness; available: boolean }>;
  reasoningEfforts: ReasoningEffort[];
  defaultHarness: AgentHarness;
  defaultReasoningEffort: ReasoningEffort;
}

interface ChatPayload {
  chat: ProjectChat | null;
  messages: ProjectChatMessage[];
  latestEventId: number;
  capabilities?: ChatCapabilities;
}

const props = defineProps<{
  projectId: string;
  projectName: string;
  locale: Locale;
  wikiPageId?: string | null;
  wikiPageTitle?: string | null;
}>();

const emit = defineEmits<{
  turnCompleted: [];
}>();

const copy = {
  en: {
    open: 'Open private project chat',
    close: 'Close project chat',
    title: 'Project chat',
    private: 'Only you can see this conversation',
    newChat: 'New chat',
    history: 'Chat history',
    back: 'Back to chat',
    emptyTitle: 'Ask about this project',
    emptyCopy: 'Explore the project or manage Agent Kanban with your existing permissions.',
    promptArchitecture: 'How is this project structured?',
    promptFlow: 'Trace the main request flow.',
    promptRisk: 'Where are the most important technical risks?',
    placeholder: 'Ask a question about the source code…',
    send: 'Send message',
    stop: 'Stop response',
    harness: 'Harness',
    effort: 'Effort',
    low: 'Low',
    medium: 'Medium',
    xhigh: 'Extra high',
    preparing: 'Preparing project context',
    project: 'Searching the project',
    web: 'Researching on the web',
    tool: 'Using a research tool',
    reconnecting: 'Reconnecting…',
    noHistory: 'No earlier conversations yet.',
    source: 'Source',
    failed: 'The answer could not be completed.',
    cancelled: 'Response stopped',
    retry: 'You can send another message.',
    loading: 'Loading private conversation…',
    unavailable: 'Unavailable on this server',
    resize: 'Resize chat window',
    move: 'Drag to move chat window',
    voiceStart: 'Start voice assistant',
    activityDetails: 'Current actions',
    sourceScope: 'Project read-only · Kanban with your permissions',
    attach: 'Attach files',
    removeAttachment: 'Remove attachment',
    dropFiles: 'Drop files to attach',
    streaming: 'Agent is responding live',
  },
  de: {
    open: 'Privaten Projekt-Chat öffnen',
    close: 'Projekt-Chat schließen',
    title: 'Projekt-Chat',
    private: 'Nur du kannst diese Unterhaltung sehen',
    newChat: 'Neuer Chat',
    history: 'Chat-Verlauf',
    back: 'Zurück zum Chat',
    emptyTitle: 'Frag etwas über dieses Projekt',
    emptyCopy: 'Verstehe das Projekt oder steuere Agent Kanban mit deinen bestehenden Berechtigungen.',
    promptArchitecture: 'Wie ist dieses Projekt aufgebaut?',
    promptFlow: 'Zeige mir den wichtigsten Request-Ablauf.',
    promptRisk: 'Wo liegen die wichtigsten technischen Risiken?',
    placeholder: 'Frage zum Source Code stellen…',
    send: 'Nachricht senden',
    stop: 'Antwort stoppen',
    harness: 'Harness',
    effort: 'Aufwand',
    low: 'Niedrig',
    medium: 'Mittel',
    xhigh: 'Extra hoch',
    preparing: 'Projektkontext wird vorbereitet',
    project: 'Durchsucht das Projekt',
    web: 'Recherchiert im Web',
    tool: 'Verwendet ein Recherche-Tool',
    reconnecting: 'Verbindung wird wiederhergestellt…',
    noHistory: 'Noch keine früheren Unterhaltungen.',
    source: 'Source',
    failed: 'Die Antwort konnte nicht abgeschlossen werden.',
    cancelled: 'Antwort gestoppt',
    retry: 'Du kannst eine weitere Nachricht senden.',
    loading: 'Private Unterhaltung wird geladen…',
    unavailable: 'Auf diesem Server nicht verfügbar',
    resize: 'Chat-Fenster skalieren',
    move: 'Ziehen, um das Chat-Fenster zu verschieben',
    voiceStart: 'Sprachassistent starten',
    activityDetails: 'Aktuelle Aktionen',
    sourceScope: 'Projekt nur lesbar · Kanban mit deinen Rechten',
    attach: 'Dateien anhängen',
    removeAttachment: 'Anhang entfernen',
    dropFiles: 'Dateien zum Anhängen ablegen',
    streaming: 'Agent antwortet live',
  },
} as const;

const t = computed(() => copy[props.locale]);
const wikiContext = computed(() => Boolean(props.wikiPageId));
const contextTitle = computed(() => wikiContext.value
  ? (props.locale === 'de' ? 'Wiki-Chat' : 'Wiki chat')
  : t.value.title);
const contextSubtitle = computed(() => wikiContext.value
  ? `${props.locale === 'de' ? 'Gebunden an' : 'Bound to'} · ${props.wikiPageTitle ?? ''}`
  : t.value.private);
const contextEmptyTitle = computed(() => wikiContext.value
  ? (props.locale === 'de' ? 'Frag etwas zu dieser Seite' : 'Ask about this page')
  : t.value.emptyTitle);
const contextEmptyCopy = computed(() => wikiContext.value
  ? (props.locale === 'de'
      ? 'Lass die Seite lesen, neu strukturieren oder formatieren und erstelle daraus auf Wunsch Tasks im Kanban.'
      : 'Read, restructure, or format this page and create Kanban tasks from it when requested.')
  : t.value.emptyCopy);
const contextPrompts = computed(() => wikiContext.value
  ? (props.locale === 'de'
      ? ['Fasse diese Seite prägnant zusammen.', 'Strukturiere und formatiere diese Notizen besser.', 'Erstelle aus den nächsten Schritten passende Kanban-Tasks.']
      : ['Summarize this page concisely.', 'Restructure and format these notes.', 'Create suitable Kanban tasks from the next steps.'])
  : [t.value.promptArchitecture, t.value.promptFlow, t.value.promptRisk]);
const contextPlaceholder = computed(() => wikiContext.value
  ? (props.locale === 'de' ? 'Diese Wiki-Seite bearbeiten oder daraus Tasks erstellen …' : 'Edit this Wiki page or create tasks from it…')
  : t.value.placeholder);
const contextSourceScope = computed(() => wikiContext.value
  ? (props.locale === 'de' ? 'Aktive Wiki-Seite · Wiki & Kanban mit deinen Rechten' : 'Active Wiki page · Wiki & Kanban with your permissions')
  : t.value.sourceScope);
const isOpen = ref(false);
const view = ref<'chat' | 'history'>('chat');
const loading = ref(false);
const submitting = ref(false);
const reconnecting = ref(false);
const errorMessage = ref('');
const chat = ref<ProjectChat | null>(null);
const messages = ref<ProjectChatMessage[]>([]);
const history = ref<ProjectChatHistoryItem[]>([]);
const capabilities = ref<ChatCapabilities | null>(null);
const latestEventId = ref(0);
const composer = ref('');
const pendingFiles = ref<PendingChatFile[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const composerDragDepth = ref(0);
const composerDragging = ref(false);
const currentActivity = ref<'preparing' | 'project' | 'web' | 'tool' | null>(null);
const toolActivities = ref<ProjectChatToolActivity[]>([]);
const messageLog = ref<HTMLElement | null>(null);
const composerInput = ref<HTMLElement | null>(null);
const voiceConsole = ref<{
  startVoice: () => Promise<void>;
  handleBridgeEvent: (type: 'update' | 'progress', payload: Record<string, unknown>) => void;
} | null>(null);
const voiceActive = ref(false);
const desktopViewport = ref(false);
const resizing = ref(false);
const dragging = ref(false);
const dockSize = reactive({ width: 448, height: 736 });
const dockPosition = reactive<{ x: number | null; y: number | null }>({ x: null, y: null });
let stream: EventSource | null = null;
let streamFrame: number | null = null;
let scrollFrame: number | null = null;
let lastStreamPaint = 0;
let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
let pointerEndHandler: (() => void) | null = null;

const DOCK_SIZE_STORAGE_KEY = 'ak_project_chat_size_v1';
const DOCK_POSITION_STORAGE_KEY = 'ak_project_chat_position_v1';
const DOCK_MIN_WIDTH = 360;
const DOCK_MIN_HEIGHT = 420;
const DOCK_VIEWPORT_MARGIN = 32;
const DOCK_EDGE_GAP = 16;
const STREAM_FRAME_INTERVAL = 32;
const streamTargets = new Map<string, { content: string; state: ProjectChatMessage['state']; updatedAt: string }>();

const harnessItems = computed(() => {
  const labels: Record<AgentHarness, string> = {
    codex: 'Codex',
    opencode: 'OpenCode',
    'prime-agent': 'Prime Agent',
  };
  const configured = capabilities.value?.harnesses ?? [
    { value: 'prime-agent' as const, available: true },
    { value: 'codex' as const, available: true },
    { value: 'opencode' as const, available: true },
  ];
  return configured.map((item) => ({
    label: `${labels[item.value]}${item.available ? '' : ` · ${t.value.unavailable}`}`,
    value: item.value,
    disabled: !item.available,
  }));
});
const effortItems = computed(() => [
  { label: t.value.low, value: 'low' },
  { label: t.value.medium, value: 'medium' },
  { label: t.value.xhigh, value: 'xhigh' },
]);
const hasMessages = computed(() => messages.value.length > 0);
const running = computed(() => chat.value?.status === 'running');
const canSend = computed(() => Boolean(composer.value.trim() || pendingFiles.value.length) && !running.value && !submitting.value);
const displayTitle = computed(() => chat.value?.title || t.value.newChat);
const activityLabel = computed(() => {
  if (!currentActivity.value) return '';
  return t.value[currentActivity.value];
});
const dockStyle = computed(() => desktopViewport.value
  ? {
      width: `${dockSize.width}px`,
      height: `${dockSize.height}px`,
      left: `${dockPosition.x ?? DOCK_EDGE_GAP}px`,
      top: `${dockPosition.y ?? DOCK_EDGE_GAP}px`,
      right: 'auto',
      bottom: 'auto',
    }
  : undefined);

onMounted(() => {
  if (!import.meta.client) return;
  restoreDockSize();
  restoreDockPosition();
  updateViewport();
  window.addEventListener('resize', updateViewport);
  isOpen.value = localStorage.getItem('ak_project_chat_open') === 'true';
  if (isOpen.value) void ensureCurrentChat();
});

onBeforeUnmount(() => {
  closeStream();
  stopStreamAnimation();
  clearPointerInteraction();
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  window.removeEventListener('resize', updateViewport);
  clearPendingFiles();
});

watch(() => [props.projectId, props.wikiPageId] as const, async () => {
  closeStream();
  chat.value = null;
  messages.value = [];
  history.value = [];
  latestEventId.value = 0;
  currentActivity.value = null;
  toolActivities.value = [];
  errorMessage.value = '';
  view.value = 'chat';
  stopStreamAnimation();
  clearPendingFiles();
  if (isOpen.value) await ensureCurrentChat();
});

async function toggleDock() {
  isOpen.value = !isOpen.value;
  if (import.meta.client) localStorage.setItem('ak_project_chat_open', String(isOpen.value));
  if (!isOpen.value) return;
  await ensureCurrentChat();
  await nextTick();
  focusComposer();
}

function closeDock() {
  isOpen.value = false;
  if (import.meta.client) localStorage.setItem('ak_project_chat_open', 'false');
}

async function ensureCurrentChat() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    let payload = await $fetch<ChatPayload>(`/api/projects/${props.projectId}/chat`, {
      query: props.wikiPageId ? { wikiPageId: props.wikiPageId } : undefined,
    });
    capabilities.value = payload.capabilities ?? capabilities.value;
    if (!payload.chat) {
      payload = await $fetch<ChatPayload>(`/api/projects/${props.projectId}/chats`, {
        method: 'POST',
        body: { harness: 'prime-agent', reasoningEffort: 'low', wikiPageId: props.wikiPageId ?? null },
      });
    }
    applyPayload(payload);
  } catch (error) {
    errorMessage.value = friendlyError(error);
  } finally {
    loading.value = false;
  }
}

function applyPayload(payload: ChatPayload) {
  stopStreamAnimation();
  chat.value = payload.chat;
  messages.value = payload.messages;
  latestEventId.value = payload.latestEventId;
  currentActivity.value = chat.value?.status === 'running' ? 'project' : null;
  connectStream();
  scheduleScroll(true);
}

async function reloadChat() {
  if (!chat.value) return;
  const payload = await $fetch<ChatPayload>(`/api/project-chats/${chat.value.id}`);
  applyPayload(payload);
}

async function createNewChat() {
  if (submitting.value) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    const payload = await $fetch<ChatPayload>(`/api/projects/${props.projectId}/chats`, {
      method: 'POST',
      body: { harness: 'prime-agent', reasoningEffort: 'low', wikiPageId: props.wikiPageId ?? null },
    });
    view.value = 'chat';
    composer.value = '';
    clearPendingFiles();
    applyPayload(payload);
    await nextTick();
    focusComposer();
  } catch (error) {
    errorMessage.value = friendlyError(error);
  } finally {
    submitting.value = false;
  }
}

async function updateHarness(value: AgentHarness) {
  if (!chat.value || hasMessages.value) return;
  chat.value.harness = value;
  await persistConfig({ harness: value });
}

async function updateEffort(value: ReasoningEffort) {
  if (!chat.value || hasMessages.value) return;
  chat.value.reasoningEffort = value;
  await persistConfig({ reasoningEffort: value });
}

async function persistConfig(body: { harness?: AgentHarness; reasoningEffort?: ReasoningEffort }) {
  if (!chat.value) return;
  errorMessage.value = '';
  try {
    const payload = await $fetch<ChatPayload>(`/api/project-chats/${chat.value.id}`, {
      method: 'PATCH',
      body,
    });
    applyPayload(payload);
  } catch (error) {
    errorMessage.value = friendlyError(error);
    await reloadChat().catch(() => undefined);
  }
}

async function sendMessage() {
  if (!chat.value || !canSend.value) return;
  const message = composer.value.trim();
  composer.value = '';
  submitting.value = true;
  errorMessage.value = '';
  currentActivity.value = 'preparing';
  try {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('clientRequestId', crypto.randomUUID());
    for (const item of pendingFiles.value) formData.append('files', item.file, item.file.name);
    await $fetch(`/api/project-chats/${chat.value.id}/messages`, {
      method: 'POST',
      body: formData,
    });
    clearPendingFiles();
    await reloadChat();
  } catch (error) {
    composer.value = message;
    currentActivity.value = null;
    errorMessage.value = friendlyError(error);
  } finally {
    submitting.value = false;
  }
}

function openFileDialog() {
  if (!running.value) fileInput.value?.click();
}

function addFiles(files: File[]) {
  const next = [...pendingFiles.value];
  for (const file of files) {
    if (!file.size || file.size > 10 * 1024 * 1024) {
      errorMessage.value = errorLabel('chat_attachment_too_large');
      continue;
    }
    if (next.length >= 10) {
      errorMessage.value = errorLabel('chat_too_many_attachments');
      break;
    }
    const total = next.reduce((sum, item) => sum + item.file.size, 0) + file.size;
    if (total > 30 * 1024 * 1024) {
      errorMessage.value = errorLabel('chat_attachments_too_large');
      break;
    }
    next.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    });
  }
  pendingFiles.value = next;
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  addFiles(Array.from(input.files ?? []));
  input.value = '';
}

function handleComposerDrop(event: DragEvent) {
  composerDragDepth.value = 0;
  composerDragging.value = false;
  if (running.value) return;
  addFiles(Array.from(event.dataTransfer?.files ?? []));
}

function handleComposerDragEnter() {
  composerDragDepth.value += 1;
  composerDragging.value = true;
}

function handleComposerDragLeave() {
  composerDragDepth.value = Math.max(0, composerDragDepth.value - 1);
  if (!composerDragDepth.value) composerDragging.value = false;
}

function handleComposerPaste(event: ClipboardEvent) {
  const images = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      return new File([file], `clipboard-${Date.now()}-${index + 1}.${extension}`, { type: file.type });
    })
    .filter((file): file is File => Boolean(file));
  if (!images.length) return;
  event.preventDefault();
  addFiles(images);
}

function removePendingFile(id: string) {
  const item = pendingFiles.value.find((candidate) => candidate.id === id);
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  pendingFiles.value = pendingFiles.value.filter((candidate) => candidate.id !== id);
}

function clearPendingFiles() {
  for (const item of pendingFiles.value) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  pendingFiles.value = [];
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void sendMessage();
}

async function abortTurn() {
  if (!chat.value || !running.value) return;
  submitting.value = true;
  try {
    await $fetch(`/api/project-chats/${chat.value.id}/abort`, { method: 'POST' });
  } catch (error) {
    errorMessage.value = friendlyError(error);
  } finally {
    submitting.value = false;
  }
}

async function showHistory() {
  view.value = 'history';
  errorMessage.value = '';
  try {
    const payload = await $fetch<{ chats: ProjectChatHistoryItem[] }>(`/api/projects/${props.projectId}/chats`, {
      query: props.wikiPageId ? { wikiPageId: props.wikiPageId } : undefined,
    });
    history.value = payload.chats;
  } catch (error) {
    errorMessage.value = friendlyError(error);
  }
}

async function activateChat(item: ProjectChatHistoryItem) {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const payload = await $fetch<ChatPayload>(`/api/project-chats/${item.id}/activate`, { method: 'POST' });
    view.value = 'chat';
    applyPayload(payload);
  } catch (error) {
    errorMessage.value = friendlyError(error);
  } finally {
    submitting.value = false;
  }
}

function connectStream() {
  closeStream();
  if (!import.meta.client || !chat.value) return;
  stream = new EventSource(`/api/project-chats/${chat.value.id}/events?after=${latestEventId.value}`);
  stream.addEventListener('open', () => {
    reconnecting.value = false;
  });
  stream.addEventListener('error', () => {
    reconnecting.value = true;
  });
  stream.addEventListener('turn_started', (event) => {
    updateEventCursor(event);
    if (chat.value) chat.value.status = 'running';
    currentActivity.value = 'preparing';
    toolActivities.value = [];
  });
  stream.addEventListener('activity', (event) => {
    const payload = eventPayload(event);
    updateEventCursor(event, payload);
    const activity = payload.activity;
    currentActivity.value = payload.phase === 'preparing'
      ? 'preparing'
      : activity === 'web' || activity === 'tool' ? activity : 'project';
  });
  stream.addEventListener('tool_activity', (event) => {
    const payload = eventPayload(event as MessageEvent);
    updateEventCursor(event, payload);
    const activity = normalizeToolActivity(payload);
    if (!activity) return;
    const index = toolActivities.value.findIndex((item) => item.id === activity.id);
    if (index >= 0) toolActivities.value.splice(index, 1, activity);
    else toolActivities.value.push(activity);
    toolActivities.value = toolActivities.value.slice(-8);
    scheduleScroll(isNearLatest());
  });
  stream.addEventListener('message_updated', (event) => applyMessageEvent(event, 'streaming'));
  stream.addEventListener('message_completed', (event) => {
    applyMessageEvent(event, 'complete');
    if (chat.value) chat.value.status = 'ready';
    currentActivity.value = null;
    emit('turnCompleted');
  });
  stream.addEventListener('voice_turn_completed', (event) => {
    updateEventCursor(event, eventPayload(event as MessageEvent));
    void reloadChat();
    emit('turnCompleted');
  });
  stream.addEventListener('voice_job_update', (event) => {
    const payload = eventPayload(event as MessageEvent);
    updateEventCursor(event, payload);
    voiceConsole.value?.handleBridgeEvent('update', payload);
  });
  stream.addEventListener('voice_job_progress', (event) => {
    const payload = eventPayload(event as MessageEvent);
    updateEventCursor(event, payload);
    voiceConsole.value?.handleBridgeEvent('progress', payload);
  });
  stream.addEventListener('turn_cancelled', (event) => {
    updateEventCursor(event);
    if (chat.value) chat.value.status = 'ready';
    currentActivity.value = null;
    void reloadChat();
  });
  stream.addEventListener('error', (event) => {
    if (!(event instanceof MessageEvent)) return;
    const payload = eventPayload(event);
    updateEventCursor(event, payload);
    if (chat.value) chat.value.status = 'failed';
    currentActivity.value = null;
    errorMessage.value = errorLabel(String(payload.code ?? 'chat_harness_failed'));
    void reloadChat();
  });
}

function applyMessageEvent(event: Event, state: ProjectChatMessage['state']) {
  if (!(event instanceof MessageEvent)) return;
  const payload = eventPayload(event);
  updateEventCursor(event, payload);
  const messageId = String(payload.messageId ?? '');
  const message = messages.value.find((candidate) => candidate.id === messageId);
  if (message) {
    const target = String(payload.content ?? message.content);
    const updatedAt = new Date().toISOString();
    if (prefersReducedMotion() || !target.startsWith(message.content)) {
      message.content = target;
      message.state = state;
      message.updatedAt = updatedAt;
      scheduleScroll(isNearLatest());
      return;
    }
    message.state = 'streaming';
    streamTargets.set(messageId, { content: target, state, updatedAt });
    scheduleStreamAnimation();
  } else {
    void reloadChat();
  }
}

function scheduleStreamAnimation() {
  if (streamFrame !== null) return;
  streamFrame = requestAnimationFrame(paintStreamFrame);
}

function paintStreamFrame(timestamp: number) {
  streamFrame = null;
  if (timestamp - lastStreamPaint < STREAM_FRAME_INTERVAL) {
    scheduleStreamAnimation();
    return;
  }
  lastStreamPaint = timestamp;
  const followLatest = isNearLatest();

  for (const [messageId, target] of streamTargets) {
    const message = messages.value.find((candidate) => candidate.id === messageId);
    if (!message) {
      streamTargets.delete(messageId);
      continue;
    }
    const remaining = target.content.length - message.content.length;
    if (remaining <= 0) {
      message.state = target.state;
      message.updatedAt = target.updatedAt;
      streamTargets.delete(messageId);
      continue;
    }
    const chunkSize = Math.max(1, Math.ceil(remaining / 5));
    message.content = target.content.slice(0, message.content.length + chunkSize);
    if (message.content.length === target.content.length) {
      message.state = target.state;
      message.updatedAt = target.updatedAt;
      streamTargets.delete(messageId);
    }
  }

  scheduleScroll(followLatest);
  if (streamTargets.size) scheduleStreamAnimation();
}

function stopStreamAnimation() {
  if (streamFrame !== null) cancelAnimationFrame(streamFrame);
  streamFrame = null;
  streamTargets.clear();
}

function eventPayload(event: MessageEvent) {
  try {
    return JSON.parse(event.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function updateEventCursor(event: Event, payload?: Record<string, unknown>) {
  const id = Number((event as MessageEvent).lastEventId || payload?.eventId || 0);
  if (Number.isFinite(id)) latestEventId.value = Math.max(latestEventId.value, id);
}

function normalizeToolActivity(payload: Record<string, unknown>): ProjectChatToolActivity | null {
  const kind = String(payload.kind ?? '');
  const status = String(payload.status ?? '');
  if (!['command', 'file', 'web', 'kanban', 'tool'].includes(kind)
    || !['running', 'completed', 'failed'].includes(status)) return null;
  return {
    id: String(payload.id ?? crypto.randomUUID()),
    kind: kind as ProjectChatToolActivity['kind'],
    label: String(payload.label ?? t.value.tool),
    detail: typeof payload.detail === 'string' && payload.detail.trim() ? payload.detail : null,
    status: status as ProjectChatToolActivity['status'],
  };
}

function toolActivityIcon(activity: ProjectChatToolActivity) {
  if (activity.status === 'failed') return 'i-lucide-circle-alert';
  if (activity.kind === 'kanban') return 'i-lucide-columns-3';
  if (activity.kind === 'web') return 'i-lucide-globe-2';
  if (activity.kind === 'file') return 'i-lucide-file-pen-line';
  if (activity.kind === 'command') return 'i-lucide-terminal';
  return 'i-lucide-wrench';
}

function closeStream() {
  stream?.close();
  stream = null;
  reconnecting.value = false;
}

function focusComposer() {
  const input = composerInput.value?.querySelector('textarea');
  input?.focus();
}

function isNearLatest() {
  const log = messageLog.value;
  if (!log) return true;
  return log.scrollHeight - log.scrollTop - log.clientHeight < 96;
}

function scheduleScroll(force = false) {
  if (!force || scrollFrame !== null) return;
  void nextTick(() => {
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      const log = messageLog.value;
      if (log) log.scrollTop = log.scrollHeight;
    });
  });
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function restoreDockSize() {
  try {
    const stored = JSON.parse(localStorage.getItem(DOCK_SIZE_STORAGE_KEY) ?? '{}') as { width?: unknown; height?: unknown };
    if (typeof stored.width === 'number' && typeof stored.height === 'number') {
      dockSize.width = stored.width;
      dockSize.height = stored.height;
    }
  } catch {
    localStorage.removeItem(DOCK_SIZE_STORAGE_KEY);
  }
}

function restoreDockPosition() {
  try {
    const stored = JSON.parse(localStorage.getItem(DOCK_POSITION_STORAGE_KEY) ?? '{}') as { x?: unknown; y?: unknown };
    if (typeof stored.x === 'number' && Number.isFinite(stored.x) && typeof stored.y === 'number' && Number.isFinite(stored.y)) {
      dockPosition.x = stored.x;
      dockPosition.y = stored.y;
    }
  } catch {
    localStorage.removeItem(DOCK_POSITION_STORAGE_KEY);
  }
}

function updateViewport() {
  desktopViewport.value = window.innerWidth >= 640;
  const clamped = clampDockSize(dockSize.width, dockSize.height);
  dockSize.width = clamped.width;
  dockSize.height = clamped.height;
  const initialX = dockPosition.x ?? window.innerWidth - dockSize.width - DOCK_EDGE_GAP;
  const initialY = dockPosition.y ?? window.innerHeight - dockSize.height - DOCK_EDGE_GAP;
  const position = clampDockPosition(initialX, initialY);
  dockPosition.x = position.x;
  dockPosition.y = position.y;
}

function clampDockSize(width: number, height: number) {
  const maxWidth = Math.max(DOCK_MIN_WIDTH, window.innerWidth - DOCK_VIEWPORT_MARGIN);
  const maxHeight = Math.max(DOCK_MIN_HEIGHT, window.innerHeight - DOCK_VIEWPORT_MARGIN);
  return {
    width: Math.round(Math.min(maxWidth, Math.max(DOCK_MIN_WIDTH, width))),
    height: Math.round(Math.min(maxHeight, Math.max(DOCK_MIN_HEIGHT, height))),
  };
}

function setDockSize(width: number, height: number, persist = false) {
  const right = (dockPosition.x ?? DOCK_EDGE_GAP) + dockSize.width;
  const bottom = (dockPosition.y ?? DOCK_EDGE_GAP) + dockSize.height;
  const clamped = clampDockSize(width, height);
  dockSize.width = clamped.width;
  dockSize.height = clamped.height;
  setDockPosition(right - dockSize.width, bottom - dockSize.height);
  if (persist) localStorage.setItem(DOCK_SIZE_STORAGE_KEY, JSON.stringify(clamped));
}

function clampDockPosition(x: number, y: number) {
  return {
    x: Math.round(Math.min(window.innerWidth - dockSize.width - DOCK_EDGE_GAP, Math.max(DOCK_EDGE_GAP, x))),
    y: Math.round(Math.min(window.innerHeight - dockSize.height - DOCK_EDGE_GAP, Math.max(DOCK_EDGE_GAP, y))),
  };
}

function setDockPosition(x: number, y: number, persist = false) {
  const clamped = clampDockPosition(x, y);
  dockPosition.x = clamped.x;
  dockPosition.y = clamped.y;
  if (persist) localStorage.setItem(DOCK_POSITION_STORAGE_KEY, JSON.stringify(clamped));
}

function beginResize(event: PointerEvent) {
  if (!desktopViewport.value || event.button !== 0) return;
  event.preventDefault();
  clearPointerInteraction();
  const startX = event.clientX;
  const startY = event.clientY;
  const startWidth = dockSize.width;
  const startHeight = dockSize.height;
  resizing.value = true;
  document.documentElement.classList.add('ak-project-chat-resizing');

  pointerMoveHandler = (moveEvent: PointerEvent) => {
    setDockSize(startWidth + startX - moveEvent.clientX, startHeight + startY - moveEvent.clientY);
  };
  pointerEndHandler = () => {
    clearPointerInteraction();
    setDockSize(dockSize.width, dockSize.height, true);
    setDockPosition(dockPosition.x ?? DOCK_EDGE_GAP, dockPosition.y ?? DOCK_EDGE_GAP, true);
  };
  window.addEventListener('pointermove', pointerMoveHandler);
  window.addEventListener('pointerup', pointerEndHandler);
  window.addEventListener('pointercancel', pointerEndHandler);
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (!desktopViewport.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 32 : 16;
  const width = dockSize.width + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0);
  const height = dockSize.height + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0);
  setDockSize(width, height, true);
  setDockPosition(dockPosition.x ?? DOCK_EDGE_GAP, dockPosition.y ?? DOCK_EDGE_GAP, true);
}

function beginDrag(event: PointerEvent) {
  const target = event.target as HTMLElement;
  if (!desktopViewport.value || event.button !== 0 || target.closest('button, a, input, textarea, select, [role="button"]')) return;
  event.preventDefault();
  clearPointerInteraction();
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = dockPosition.x ?? DOCK_EDGE_GAP;
  const startTop = dockPosition.y ?? DOCK_EDGE_GAP;
  dragging.value = true;
  document.documentElement.classList.add('ak-project-chat-dragging');

  pointerMoveHandler = (moveEvent: PointerEvent) => {
    setDockPosition(startLeft + moveEvent.clientX - startX, startTop + moveEvent.clientY - startY);
  };
  pointerEndHandler = () => {
    clearPointerInteraction();
    setDockPosition(dockPosition.x ?? DOCK_EDGE_GAP, dockPosition.y ?? DOCK_EDGE_GAP, true);
  };
  window.addEventListener('pointermove', pointerMoveHandler);
  window.addEventListener('pointerup', pointerEndHandler);
  window.addEventListener('pointercancel', pointerEndHandler);
}

function clearPointerInteraction() {
  if (pointerMoveHandler) window.removeEventListener('pointermove', pointerMoveHandler);
  if (pointerEndHandler) {
    window.removeEventListener('pointerup', pointerEndHandler);
    window.removeEventListener('pointercancel', pointerEndHandler);
  }
  pointerMoveHandler = null;
  pointerEndHandler = null;
  resizing.value = false;
  dragging.value = false;
  document.documentElement.classList.remove('ak-project-chat-resizing', 'ak-project-chat-dragging');
}

function choosePrompt(value: string) {
  composer.value = value;
  nextTick(focusComposer);
}

function startVoiceConsole() {
  void voiceConsole.value?.startVoice();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function errorLabel(code: string) {
  const de = props.locale === 'de';
  const labels: Record<string, [string, string]> = {
    chat_harness_unavailable: ['The selected harness is unavailable.', 'Der gewählte Harness ist nicht verfügbar.'],
    chat_workspace_failed: ['The project context could not be prepared.', 'Der Projektkontext konnte nicht vorbereitet werden.'],
    chat_read_only_violation: ['The response was stopped by the read-only guard.', 'Die Antwort wurde vom Read-only-Schutz gestoppt.'],
    chat_empty_response: ['The harness returned no answer.', 'Der Harness hat keine Antwort geliefert.'],
    chat_interrupted: ['The response was interrupted by a service restart.', 'Die Antwort wurde durch einen Service-Neustart unterbrochen.'],
    chat_turn_already_running: ['An answer is already running.', 'Es läuft bereits eine Antwort.'],
    chat_config_locked: ['Harness and effort are fixed for this conversation.', 'Harness und Aufwand sind für diese Unterhaltung festgelegt.'],
    chat_harness_failed: ['The selected harness could not complete the answer.', 'Der gewählte Harness konnte die Antwort nicht abschließen.'],
    chat_attachment_too_large: ['Each attachment may be up to 10 MB.', 'Ein einzelner Anhang darf höchstens 10 MB groß sein.'],
    chat_attachments_too_large: ['Attachments may total up to 30 MB.', 'Anhänge dürfen zusammen höchstens 30 MB groß sein.'],
    chat_too_many_attachments: ['You can attach up to 10 files.', 'Du kannst höchstens 10 Dateien anhängen.'],
  };
  return labels[code]?.[de ? 1 : 0] ?? t.value.failed;
}

function friendlyError(error: unknown) {
  const candidate = error as { statusMessage?: string; data?: { statusMessage?: string } };
  return errorLabel(candidate.data?.statusMessage ?? candidate.statusMessage ?? 'chat_harness_failed');
}
</script>

<template>
  <Teleport to="body">
    <div class="ak-project-chat-root">
      <Transition name="ak-chat-dock">
        <aside
          v-if="isOpen"
          class="ak-project-chat-dock"
          :class="{ 'is-resizing': resizing, 'is-dragging': dragging }"
          :style="dockStyle"
          role="dialog"
          aria-modal="false"
          :aria-label="contextTitle"
          data-testid="project-chat-dock"
        >
          <button
            v-if="desktopViewport"
            type="button"
            class="ak-project-chat-resize-handle"
            :aria-label="t.resize"
            data-testid="project-chat-resize"
            @pointerdown="beginResize"
            @keydown="resizeWithKeyboard"
          />
          <header
            class="ak-project-chat-header flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-200 px-3.5 dark:border-zinc-800"
            :title="desktopViewport ? t.move : undefined"
            data-testid="project-chat-header"
            @pointerdown="beginDrag"
          >
            <UButton
              v-if="view === 'history'"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-left"
              :aria-label="t.back"
              @click="view = 'chat'"
            />
            <span v-else class="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-900">
              <UIcon name="i-lucide-message-circle-code" class="size-4.5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                {{ view === 'history' ? t.history : displayTitle }}
              </p>
              <p class="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                <UIcon name="i-lucide-lock-keyhole" class="size-3 shrink-0" />
                <span class="truncate">{{ view === 'history' ? (wikiPageTitle || projectName) : contextSubtitle }}</span>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-0.5">
              <UButton
                v-if="view === 'chat'"
                color="neutral"
                variant="ghost"
                icon="i-lucide-history"
                :aria-label="t.history"
                data-testid="project-chat-history"
                @click="showHistory"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-square-pen"
                :aria-label="t.newChat"
                data-testid="project-chat-new"
                :loading="submitting"
                @click="createNewChat"
              />
              <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t.close" @click="closeDock" />
            </div>
          </header>

          <div v-if="loading" class="grid flex-1 content-center justify-items-center gap-3 px-8 text-center">
            <span class="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-200">
              <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
            </span>
            <p class="text-sm text-zinc-600 dark:text-zinc-300">{{ t.loading }}</p>
          </div>

          <template v-else-if="view === 'history'">
            <div class="min-h-0 flex-1 overflow-y-auto p-2.5">
              <button
                v-for="item in history"
                :key="item.id"
                type="button"
                class="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600 dark:hover:bg-zinc-800/80"
                :class="item.id === chat?.id ? 'bg-teal-50/80 dark:bg-teal-950/35' : ''"
                @click="activateChat(item)"
              >
                <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 ring-1 ring-zinc-200 group-hover:text-teal-700 dark:bg-zinc-900 dark:ring-zinc-700 dark:group-hover:text-teal-300">
                  <UIcon name="i-lucide-message-square" class="size-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{{ item.title || t.newChat }}</span>
                    <span v-if="item.id === chat?.id" class="size-1.5 shrink-0 rounded-full bg-teal-500" />
                  </span>
                  <span class="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ item.preview || contextEmptyCopy }}</span>
                  <span class="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                    <span>{{ formatTime(item.updatedAt) }}</span>
                    <span>·</span>
                    <span>{{ harnessItems.find((option) => option.value === item.harness)?.label?.split(' · ')[0] }}</span>
                    <span>·</span>
                    <span>{{ effortItems.find((option) => option.value === item.reasoningEffort)?.label }}</span>
                  </span>
                </span>
              </button>
              <div v-if="!history.length" class="grid min-h-64 place-items-center px-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {{ t.noHistory }}
              </div>
            </div>
          </template>

          <template v-else>
            <div ref="messageLog" class="ak-project-chat-log min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-relevant="additions text">
              <div v-if="!hasMessages" class="mx-auto grid min-h-full max-w-sm content-center gap-5 px-6 py-10 text-center">
                <div class="mx-auto grid size-12 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-900">
                  <UIcon name="i-lucide-braces" class="size-5" />
                </div>
                <div>
                  <h2 class="text-base font-semibold text-zinc-950 dark:text-white">{{ contextEmptyTitle }}</h2>
                  <p class="mx-auto mt-2 max-w-[34ch] text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ contextEmptyCopy }}</p>
                </div>
                <div class="grid gap-2 text-left">
                  <button
                    v-for="prompt in contextPrompts"
                    :key="prompt"
                    type="button"
                    class="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-teal-950 transition-colors hover:border-teal-300 hover:bg-teal-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-teal-100 dark:hover:border-teal-800 dark:hover:bg-teal-950/35"
                    @click="choosePrompt(prompt)"
                  >
                    <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
                    <span>{{ prompt }}</span>
                  </button>
                </div>
              </div>

              <div v-else class="mx-auto grid max-w-3xl gap-5 px-4 py-5 sm:px-5">
                <article v-for="message in messages" :key="message.id" class="min-w-0">
                  <div v-if="message.role === 'user'" class="ml-auto max-w-[88%] rounded-xl bg-zinc-900 px-3.5 py-2.5 text-sm leading-6 text-white dark:bg-zinc-100 dark:text-zinc-950">
                    <p v-if="message.content" class="whitespace-pre-wrap break-words">{{ message.content }}</p>
                    <div v-if="message.attachments?.length" class="grid gap-1.5" :class="message.content ? 'mt-2.5' : ''">
                      <a
                        v-for="attachment in message.attachments"
                        :key="attachment.id"
                        :href="attachment.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex min-w-0 items-center gap-2 rounded-lg bg-white/10 px-2.5 py-2 text-left transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:bg-zinc-900/10 dark:hover:bg-zinc-900/15 dark:focus-visible:outline-zinc-900"
                      >
                        <img
                          v-if="attachment.mimeType.startsWith('image/')"
                          :src="attachment.url"
                          :alt="attachment.fileName"
                          class="size-9 shrink-0 rounded-md object-cover"
                        >
                        <span v-else class="grid size-9 shrink-0 place-items-center rounded-md bg-white/10 dark:bg-zinc-900/10">
                          <UIcon name="i-lucide-file" class="size-4" />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-xs font-medium">{{ attachment.fileName }}</span>
                          <span class="block text-[10px] opacity-70">{{ formatFileSize(attachment.size) }}</span>
                        </span>
                      </a>
                    </div>
                  </div>
                  <div v-else class="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-2">
                    <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-900">
                      <UIcon name="i-lucide-bot" class="size-3.5" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <UEditor
                        v-if="message.content"
                        :model-value="message.content"
                        content-type="markdown"
                        :editable="false"
                        :image="true"
                        :mention="false"
                        class="ak-chat-markdown text-sm leading-6 text-zinc-700 dark:text-zinc-200"
                        :ui="{ content: 'px-0 py-0', base: 'px-0 sm:px-0 text-sm text-zinc-700 dark:text-zinc-200' }"
                      />
                      <div v-else-if="message.state === 'streaming'" class="flex min-h-7 items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span class="flex gap-1" aria-hidden="true">
                          <span class="ak-chat-thinking-dot" />
                          <span class="ak-chat-thinking-dot [animation-delay:120ms]" />
                          <span class="ak-chat-thinking-dot [animation-delay:240ms]" />
                        </span>
                        <span>{{ activityLabel || t.preparing }}</span>
                      </div>
                      <p v-if="message.content && message.state === 'streaming'" class="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400" role="status">
                        <span class="size-1.5 rounded-full bg-teal-500 ak-chat-live-dot" aria-hidden="true" />
                        {{ t.streaming }}
                      </p>
                      <p v-if="message.state === 'failed'" class="mt-2 flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
                        <UIcon name="i-lucide-circle-alert" class="size-3.5" />
                        {{ t.failed }} {{ t.retry }}
                      </p>
                      <p v-else-if="message.state === 'cancelled'" class="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <UIcon name="i-lucide-circle-stop" class="size-3.5" />
                        {{ t.cancelled }}
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </div>

            <div class="min-w-0 shrink-0 overflow-hidden border-t border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-800 dark:bg-zinc-900/80">
              <ProjectVoiceConsole
                v-if="chat"
                ref="voiceConsole"
                :chat-id="chat.id"
                :project-name="projectName"
                :harness="harnessItems.find((item) => item.value === chat?.harness)?.label?.split(' · ')[0] || chat.harness"
                :locale="locale"
                @active-change="voiceActive = $event"
                @turn-completed="reloadChat"
              />

              <div v-if="!voiceActive && !hasMessages && chat" class="mb-2.5 flex items-center gap-2">
                <USelect
                  :model-value="chat.harness"
                  :items="harnessItems"
                  value-key="value"
                  size="sm"
                  class="min-w-0 flex-1"
                  icon="i-lucide-bot"
                  :ui="{ content: 'z-[60]' }"
                  :aria-label="t.harness"
                  data-testid="project-chat-harness"
                  @update:model-value="updateHarness($event as AgentHarness)"
                />
                <USelect
                  :model-value="chat.reasoningEffort"
                  :items="effortItems"
                  value-key="value"
                  size="sm"
                  class="min-w-0 flex-1"
                  icon="i-lucide-gauge"
                  :ui="{ content: 'z-[60]' }"
                  :aria-label="t.effort"
                  data-testid="project-chat-effort"
                  @update:model-value="updateEffort($event as ReasoningEffort)"
                />
              </div>

              <div v-else-if="!voiceActive && chat" class="mb-2 flex min-w-0 items-center gap-2 px-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span class="inline-flex min-w-0 items-center gap-1">
                  <UIcon name="i-lucide-bot" class="size-3" />
                  <span class="truncate">{{ harnessItems.find((item) => item.value === chat?.harness)?.label?.split(' · ')[0] }}</span>
                </span>
                <span>·</span>
                <span>{{ effortItems.find((item) => item.value === chat?.reasoningEffort)?.label }}</span>
                <template v-if="chat.sourceRevision">
                  <span>·</span>
                  <span class="inline-flex min-w-0 items-center gap-1 font-mono">
                    <UIcon name="i-lucide-git-commit-horizontal" class="size-3" />
                    {{ chat.sourceRevision.slice(0, 8) }}
                  </span>
                </template>
              </div>

              <div v-if="!voiceActive && (currentActivity || reconnecting)" class="mb-2 flex items-center gap-2 px-1 text-xs text-zinc-500 dark:text-zinc-400" role="status">
                <UIcon :name="reconnecting ? 'i-lucide-wifi-off' : 'i-lucide-loader-circle'" class="size-3.5" :class="reconnecting ? '' : 'animate-spin'" />
                <span>{{ reconnecting ? t.reconnecting : activityLabel }}</span>
              </div>

              <div
                v-if="!voiceActive && running && toolActivities.length"
                class="mb-2 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
              >
                <div class="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                  <span>{{ t.activityDetails }}</span>
                  <span class="font-mono text-zinc-400">{{ toolActivities.length }}</span>
                </div>
                <div class="max-h-32 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                  <div v-for="activity in toolActivities" :key="activity.id" class="flex min-w-0 items-start gap-2 px-3 py-2 text-[11px] leading-4">
                    <UIcon
                      :name="toolActivityIcon(activity)"
                      class="mt-0.5 size-3.5 shrink-0"
                      :class="activity.status === 'failed'
                        ? 'text-red-600 dark:text-red-400'
                        : activity.status === 'running'
                          ? 'animate-pulse text-teal-600 dark:text-teal-400'
                          : 'text-zinc-400'"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium text-zinc-700 dark:text-zinc-200">{{ activity.label }}</span>
                      <code v-if="activity.detail" class="mt-0.5 block truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400" :title="activity.detail">{{ activity.detail }}</code>
                    </span>
                  </div>
                </div>
              </div>

              <div
                v-if="!voiceActive"
                ref="composerInput"
                class="relative rounded-xl bg-white ring-1 ring-zinc-300 transition-colors focus-within:ring-2 focus-within:ring-teal-600 dark:bg-zinc-950 dark:ring-zinc-700 dark:focus-within:ring-teal-500"
                :class="composerDragging ? 'bg-teal-50 ring-2 ring-teal-500 dark:bg-teal-950/40 dark:ring-teal-400' : ''"
                @dragover.prevent
                @dragenter.prevent="handleComposerDragEnter"
                @dragleave.prevent="handleComposerDragLeave"
                @drop.prevent="handleComposerDrop"
              >
                <div v-if="composerDragging" class="pointer-events-none absolute inset-1 z-20 grid place-items-center rounded-lg border border-dashed border-teal-500 bg-teal-50/95 text-xs font-semibold text-teal-800 dark:border-teal-400 dark:bg-teal-950/95 dark:text-teal-200">
                  <span class="inline-flex items-center gap-2">
                    <UIcon name="i-lucide-file-down" class="size-4" />
                    {{ t.dropFiles }}
                  </span>
                </div>
                <div v-if="pendingFiles.length" class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto px-2.5 pt-2.5">
                  <span v-for="item in pendingFiles" :key="item.id" class="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-zinc-100 p-1 pr-1.5 text-[11px] text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700">
                    <img v-if="item.previewUrl" :src="item.previewUrl" alt="" class="size-7 shrink-0 rounded-md object-cover">
                    <span v-else class="grid size-7 shrink-0 place-items-center rounded-md bg-white text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                      <UIcon name="i-lucide-file" class="size-3.5" />
                    </span>
                    <span class="max-w-36 truncate">{{ item.file.name }}</span>
                    <button type="button" class="grid size-6 shrink-0 place-items-center rounded-md hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-teal-600 dark:hover:bg-zinc-800" :aria-label="`${t.removeAttachment}: ${item.file.name}`" @click="removePendingFile(item.id)">
                      <UIcon name="i-lucide-x" class="size-3.5" />
                    </button>
                  </span>
                </div>
                <UTextarea
                  v-model="composer"
                  autoresize
                  :rows="2"
                  :maxrows="7"
                  variant="none"
                  class="w-full"
                  :placeholder="contextPlaceholder"
                  :disabled="running"
                  data-testid="project-chat-composer"
                  :ui="{ base: 'min-h-16 resize-none pb-11 text-sm placeholder:text-zinc-500 dark:placeholder:text-zinc-400' }"
                  @keydown="handleComposerKeydown"
                  @paste="handleComposerPaste"
                />
                <div class="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
                  <span class="inline-flex min-w-0 items-center gap-1.5 truncate px-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                    <UIcon name="i-lucide-shield-check" class="size-3 shrink-0" />
                    <span class="truncate">{{ contextSourceScope }} · {{ wikiPageTitle || projectName }}</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1">
                    <input ref="fileInput" type="file" multiple class="sr-only" tabindex="-1" aria-hidden="true" @change="handleFileChange">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-paperclip"
                      :aria-label="t.attach"
                      :disabled="running"
                      data-testid="project-chat-attach"
                      @click="openFileDialog"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-mic"
                      :aria-label="t.voiceStart"
                      data-testid="project-voice-start"
                      @click="startVoiceConsole"
                    />
                    <UButton
                      v-if="running"
                      color="neutral"
                      variant="solid"
                      size="sm"
                      icon="i-lucide-square"
                      :aria-label="t.stop"
                      data-testid="project-chat-stop"
                      :loading="submitting"
                      @click="abortTurn"
                    />
                    <UButton
                      v-else
                      size="sm"
                      icon="i-lucide-arrow-up"
                      :aria-label="t.send"
                      data-testid="project-chat-send"
                      :disabled="!canSend"
                      :loading="submitting"
                      @click="sendMessage"
                    />
                  </span>
                </div>
              </div>
              <p v-if="!voiceActive && errorMessage" class="mt-2 flex items-start gap-1.5 px-1 text-xs leading-5 text-red-700 dark:text-red-300" role="alert">
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
                <span>{{ errorMessage }}</span>
              </p>
            </div>
          </template>
        </aside>
      </Transition>

      <button
        v-if="!isOpen"
        type="button"
        class="ak-project-chat-launcher"
        :aria-label="t.open"
        data-testid="project-chat-launcher"
        @click="toggleDock"
      >
        <UIcon name="i-lucide-message-circle-code" class="size-5" />
        <span v-if="running" class="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-400 ring-2 ring-teal-700" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.ak-project-chat-root {
  position: fixed;
  z-index: 50;
}

.ak-project-chat-launcher {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  display: grid;
  width: 3rem;
  height: 3rem;
  place-items: center;
  border: 1px solid rgb(13 148 136 / 0.55);
  border-radius: 0.875rem;
  background: rgb(15 118 110);
  color: white;
  box-shadow: 0 6px 8px rgb(15 23 42 / 0.16);
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease-out;
}

.ak-project-chat-launcher:hover {
  transform: translateY(-2px);
  background: rgb(17 94 89);
}

.ak-project-chat-launcher:active {
  transform: translateY(0);
}

.ak-project-chat-launcher:focus-visible {
  outline: 2px solid rgb(13 148 136);
  outline-offset: 3px;
}

.ak-project-chat-dock {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  width: min(28rem, calc(100vw - 2rem));
  height: min(46rem, calc(100dvh - 2rem));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(212 212 216);
  border-radius: 1rem;
  background: rgb(255 255 255);
  box-shadow: 0 8px 12px rgb(15 23 42 / 0.18);
}

.ak-project-chat-dock.is-resizing {
  box-shadow: 0 12px 24px rgb(15 23 42 / 0.22);
}

.ak-project-chat-dock.is-dragging {
  box-shadow: 0 10px 18px rgb(15 23 42 / 0.2);
}

.ak-project-chat-header {
  cursor: grab;
  touch-action: none;
}

.ak-project-chat-header:active {
  cursor: grabbing;
}

.ak-project-chat-header :where(button, a, input, textarea, select, [role='button']) {
  cursor: pointer;
}

.ak-project-chat-resize-handle {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 1rem 0 0;
  background: transparent;
  color: rgb(113 113 122);
  cursor: nwse-resize;
  touch-action: none;
}

.ak-project-chat-resize-handle::before,
.ak-project-chat-resize-handle::after {
  position: absolute;
  top: 0.35rem;
  left: 0.35rem;
  width: 0.5rem;
  height: 0.5rem;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
  content: '';
}

.ak-project-chat-resize-handle::after {
  top: 0.62rem;
  left: 0.62rem;
  width: 0.25rem;
  height: 0.25rem;
  opacity: 0.55;
}

.ak-project-chat-resize-handle:hover {
  color: rgb(13 148 136);
}

.ak-project-chat-resize-handle:focus-visible {
  outline: 2px solid rgb(13 148 136);
  outline-offset: -2px;
}

:global(html.ak-project-chat-resizing),
:global(html.ak-project-chat-resizing *) {
  cursor: nwse-resize !important;
  user-select: none !important;
}

:global(html.ak-project-chat-dragging),
:global(html.ak-project-chat-dragging *) {
  cursor: grabbing !important;
  user-select: none !important;
}

:global(.dark .ak-project-chat-dock) {
  border-color: rgb(63 63 70);
  background: rgb(9 9 11);
  box-shadow: 0 8px 12px rgb(0 0 0 / 0.42);
}

.ak-project-chat-log {
  scrollbar-gutter: stable;
}

.ak-chat-markdown :deep(img) {
  display: block;
  max-width: 100%;
  max-height: 28rem;
  margin-block: 0.75rem;
  border-radius: 0.75rem;
  object-fit: contain;
}

.ak-chat-markdown :deep(.ProseMirror),
.ak-chat-markdown :deep([contenteditable='false']) {
  margin: 0;
  padding: 0 !important;
}

.ak-chat-markdown :deep(.ProseMirror > :first-child),
.ak-chat-markdown :deep([contenteditable='false'] > :first-child) {
  margin-top: 0;
}

.ak-chat-live-dot {
  animation: ak-chat-live 1.15s ease-in-out infinite alternate;
}

.ak-chat-thinking-dot {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 999px;
  background: currentColor;
  animation: ak-chat-thinking 900ms ease-in-out infinite alternate;
}

.ak-chat-dock-enter-active,
.ak-chat-dock-leave-active {
  transition: opacity 180ms ease-out, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ak-chat-dock-enter-from,
.ak-chat-dock-leave-to {
  opacity: 0;
  transform: translateY(0.5rem) scale(0.985);
}

@keyframes ak-chat-thinking {
  from { opacity: 0.3; transform: translateY(1px); }
  to { opacity: 1; transform: translateY(-1px); }
}

@keyframes ak-chat-live {
  from { opacity: 0.4; }
  to { opacity: 1; }
}

@media (max-width: 639px) {
  .ak-project-chat-launcher {
    right: max(0.875rem, env(safe-area-inset-right));
    bottom: max(0.875rem, env(safe-area-inset-bottom));
    width: 3.25rem;
    height: 3.25rem;
  }

  .ak-project-chat-dock {
    inset: 0;
    width: 100vw;
    height: 100dvh;
    border: 0;
    border-radius: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .ak-project-chat-header {
    cursor: default;
    touch-action: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ak-project-chat-launcher,
  .ak-chat-dock-enter-active,
  .ak-chat-dock-leave-active {
    transition-duration: 1ms;
  }

  .ak-project-chat-launcher:hover {
    transform: none;
  }

  .ak-chat-thinking-dot {
    animation: none;
    opacity: 0.65;
  }

  .ak-chat-live-dot {
    animation: none;
  }
}
</style>
