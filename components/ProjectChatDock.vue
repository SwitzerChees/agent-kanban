<script setup lang="ts">
type Locale = 'en' | 'de';
type AgentHarness = 'codex' | 'opencode' | 'prime-agent';
type ReasoningEffort = 'low' | 'medium' | 'xhigh';

interface ProjectChat {
  id: string;
  projectId: string;
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
  state: 'complete' | 'streaming' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
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
    emptyCopy: 'Explore architecture, understand behavior, or trace code without changing the repository.',
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
    emptyCopy: 'Verstehe Architektur, Verhalten und Codepfade, ohne das Repository zu verändern.',
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
  },
} as const;

const t = computed(() => copy[props.locale]);
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
const currentActivity = ref<'preparing' | 'project' | 'web' | 'tool' | null>(null);
const messageLog = ref<HTMLElement | null>(null);
const composerInput = ref<HTMLElement | null>(null);
let stream: EventSource | null = null;

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
const canSend = computed(() => Boolean(composer.value.trim()) && !running.value && !submitting.value);
const displayTitle = computed(() => chat.value?.title || t.value.newChat);
const activityLabel = computed(() => {
  if (!currentActivity.value) return '';
  return t.value[currentActivity.value];
});

onMounted(() => {
  if (!import.meta.client) return;
  isOpen.value = localStorage.getItem('ak_project_chat_open') === 'true';
  if (isOpen.value) void ensureCurrentChat();
});

onBeforeUnmount(() => closeStream());

watch(() => props.projectId, async () => {
  closeStream();
  chat.value = null;
  messages.value = [];
  history.value = [];
  latestEventId.value = 0;
  currentActivity.value = null;
  errorMessage.value = '';
  view.value = 'chat';
  if (isOpen.value) await ensureCurrentChat();
});

watch(messages, () => void scrollToLatest(), { deep: true });

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
    let payload = await $fetch<ChatPayload>(`/api/projects/${props.projectId}/chat`);
    capabilities.value = payload.capabilities ?? capabilities.value;
    if (!payload.chat) {
      payload = await $fetch<ChatPayload>(`/api/projects/${props.projectId}/chats`, {
        method: 'POST',
        body: { harness: 'prime-agent', reasoningEffort: 'xhigh' },
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
  chat.value = payload.chat;
  messages.value = payload.messages;
  latestEventId.value = payload.latestEventId;
  currentActivity.value = chat.value?.status === 'running' ? 'project' : null;
  connectStream();
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
      body: { harness: 'prime-agent', reasoningEffort: 'xhigh' },
    });
    view.value = 'chat';
    composer.value = '';
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
    await $fetch(`/api/project-chats/${chat.value.id}/messages`, {
      method: 'POST',
      body: {
        message,
        clientRequestId: crypto.randomUUID(),
      },
    });
    await reloadChat();
  } catch (error) {
    composer.value = message;
    currentActivity.value = null;
    errorMessage.value = friendlyError(error);
  } finally {
    submitting.value = false;
  }
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
    const payload = await $fetch<{ chats: ProjectChatHistoryItem[] }>(`/api/projects/${props.projectId}/chats`);
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
  });
  stream.addEventListener('activity', (event) => {
    const payload = eventPayload(event);
    updateEventCursor(event, payload);
    const activity = payload.activity;
    currentActivity.value = payload.phase === 'preparing'
      ? 'preparing'
      : activity === 'web' || activity === 'tool' ? activity : 'project';
  });
  stream.addEventListener('message_updated', (event) => applyMessageEvent(event, 'streaming'));
  stream.addEventListener('message_completed', (event) => {
    applyMessageEvent(event, 'complete');
    if (chat.value) chat.value.status = 'ready';
    currentActivity.value = null;
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
    message.content = String(payload.content ?? message.content);
    message.state = state;
    message.updatedAt = new Date().toISOString();
  } else {
    void reloadChat();
  }
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

function closeStream() {
  stream?.close();
  stream = null;
  reconnecting.value = false;
}

function focusComposer() {
  const input = composerInput.value?.querySelector('textarea');
  input?.focus();
}

async function scrollToLatest() {
  await nextTick();
  if (messageLog.value) messageLog.value.scrollTop = messageLog.value.scrollHeight;
}

function choosePrompt(value: string) {
  composer.value = value;
  nextTick(focusComposer);
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
          role="dialog"
          aria-modal="false"
          :aria-label="t.title"
          data-testid="project-chat-dock"
        >
          <header class="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-200 px-3.5 dark:border-zinc-800">
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
                <span class="truncate">{{ view === 'history' ? projectName : t.private }}</span>
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
                  <span class="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ item.preview || t.emptyCopy }}</span>
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
                  <h2 class="text-base font-semibold text-zinc-950 dark:text-white">{{ t.emptyTitle }}</h2>
                  <p class="mx-auto mt-2 max-w-[34ch] text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ t.emptyCopy }}</p>
                </div>
                <div class="grid gap-2 text-left">
                  <button
                    v-for="prompt in [t.promptArchitecture, t.promptFlow, t.promptRisk]"
                    :key="prompt"
                    type="button"
                    class="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:border-teal-300 hover:bg-teal-50/60 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-teal-800 dark:hover:bg-teal-950/35 dark:hover:text-teal-100"
                    @click="choosePrompt(prompt)"
                  >
                    <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0 text-zinc-400" />
                    <span>{{ prompt }}</span>
                  </button>
                </div>
              </div>

              <div v-else class="mx-auto grid max-w-3xl gap-5 px-4 py-5 sm:px-5">
                <article v-for="message in messages" :key="message.id" class="min-w-0">
                  <div v-if="message.role === 'user'" class="ml-auto max-w-[88%] rounded-xl bg-zinc-900 px-3.5 py-2.5 text-sm leading-6 text-white dark:bg-zinc-100 dark:text-zinc-950">
                    <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
                  </div>
                  <div v-else class="flex min-w-0 items-start gap-3">
                    <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-900">
                      <UIcon name="i-lucide-bot" class="size-3.5" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <UEditor
                        v-if="message.content"
                        :model-value="message.content"
                        content-type="markdown"
                        :editable="false"
                        :image="false"
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

            <div class="shrink-0 border-t border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-800 dark:bg-zinc-900/80">
              <div v-if="!hasMessages && chat" class="mb-2.5 flex items-center gap-2">
                <USelect
                  :model-value="chat.harness"
                  :items="harnessItems"
                  value-key="value"
                  size="sm"
                  class="min-w-0 flex-1"
                  icon="i-lucide-bot"
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
                  :aria-label="t.effort"
                  data-testid="project-chat-effort"
                  @update:model-value="updateEffort($event as ReasoningEffort)"
                />
              </div>

              <div v-else-if="chat" class="mb-2 flex min-w-0 items-center gap-2 px-1 text-[10px] text-zinc-500 dark:text-zinc-400">
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

              <div v-if="currentActivity || reconnecting" class="mb-2 flex items-center gap-2 px-1 text-xs text-zinc-500 dark:text-zinc-400" role="status">
                <UIcon :name="reconnecting ? 'i-lucide-wifi-off' : 'i-lucide-loader-circle'" class="size-3.5" :class="reconnecting ? '' : 'animate-spin'" />
                <span>{{ reconnecting ? t.reconnecting : activityLabel }}</span>
              </div>

              <div ref="composerInput" class="relative rounded-xl bg-white ring-1 ring-zinc-300 focus-within:ring-2 focus-within:ring-teal-600 dark:bg-zinc-950 dark:ring-zinc-700 dark:focus-within:ring-teal-500">
                <UTextarea
                  v-model="composer"
                  autoresize
                  :rows="2"
                  :maxrows="7"
                  variant="none"
                  class="w-full"
                  :placeholder="t.placeholder"
                  :disabled="running"
                  data-testid="project-chat-composer"
                  :ui="{ base: 'min-h-16 resize-none pb-11 text-sm placeholder:text-zinc-500 dark:placeholder:text-zinc-400' }"
                  @keydown="handleComposerKeydown"
                />
                <div class="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
                  <span class="inline-flex min-w-0 items-center gap-1.5 truncate px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                    <UIcon name="i-lucide-shield-check" class="size-3 shrink-0" />
                    <span class="truncate">Read-only · {{ projectName }}</span>
                  </span>
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
                </div>
              </div>
              <p v-if="errorMessage" class="mt-2 flex items-start gap-1.5 px-1 text-xs leading-5 text-red-700 dark:text-red-300" role="alert">
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

:global(.dark) .ak-project-chat-dock {
  border-color: rgb(63 63 70);
  background: rgb(9 9 11);
  box-shadow: 0 8px 12px rgb(0 0 0 / 0.42);
}

.ak-project-chat-log {
  scrollbar-gutter: stable;
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
}
</style>
