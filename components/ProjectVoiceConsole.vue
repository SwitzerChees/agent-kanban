<script setup lang="ts">
type Locale = 'en' | 'de';
type VoiceJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

interface VoiceJob {
  id: string;
  taskId: string;
  taskKey: string;
  title: string;
  harness: string;
  reasoningEffort: string;
  status: VoiceJobStatus;
  latestProgress: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VoiceTurnResponse {
  ignored: boolean;
  reason?: string;
  transcript: string;
  spokenResponse?: string;
  intent?: string;
  job?: VoiceJob | null;
  pendingConfirmation?: boolean;
}

interface VoiceBridgePayload {
  jobId?: string;
  taskId?: string;
  taskKey?: string;
  title?: string;
  harness?: string;
  status?: VoiceJobStatus;
  detail?: string | null;
  announce?: boolean;
}

const props = defineProps<{
  chatId: string;
  projectName: string;
  harness: string;
  locale: Locale;
}>();

const emit = defineEmits<{
  activeChange: [active: boolean];
  turnCompleted: [];
}>();

const copy = {
  en: {
    start: 'Start voice assistant',
    stop: 'End voice mode',
    starting: 'Starting voice assistant',
    listening: 'I’m listening',
    capturing: 'I can hear you',
    processing: 'Understanding your request',
    speaking: 'Jarvis is speaking',
    stillListening: 'The microphone keeps listening',
    greeting: 'Hello. What can I help you with?',
    idleCaption: 'Speak naturally. You can add information or ask for progress at any time.',
    permission: 'Microphone access is required. Allow it in your browser and try again.',
    unavailable: 'Voice mode is not available in this browser or on this server.',
    connection: 'The voice service could not be reached. Listening remains active; please try again.',
    background: 'Background agent',
    queued: 'Waiting for an agent slot',
    running: 'Background agent is working',
    done: 'Ready for review',
    failed: 'Background task needs attention',
    cancelled: 'Background task stopped',
    chatQueued: 'Waiting for the background agent',
    chatRunning: 'Background agent is working',
    chatDone: 'Background work completed',
    chatFailed: 'Background work needs attention',
    chatCancelled: 'Background work stopped',
    textMode: 'Return to text mode',
    queuedTurns: 'voice turns waiting',
  },
  de: {
    start: 'Sprachassistent starten',
    stop: 'Sprachmodus beenden',
    starting: 'Sprachassistent wird gestartet',
    listening: 'Ich höre zu',
    capturing: 'Ich höre dich',
    processing: 'Ich verstehe deine Anfrage',
    speaking: 'Jarvis spricht',
    stillListening: 'Das Mikrofon hört weiter zu',
    greeting: 'Hallo. Was kann ich für dich tun?',
    idleCaption: 'Sprich ganz natürlich. Du kannst jederzeit ergänzen oder nach dem Fortschritt fragen.',
    permission: 'Der Mikrofonzugriff wird benötigt. Erlaube ihn im Browser und versuche es erneut.',
    unavailable: 'Der Sprachmodus ist in diesem Browser oder auf diesem Server nicht verfügbar.',
    connection: 'Der Sprachdienst ist gerade nicht erreichbar. Das Mikrofon bleibt aktiv; versuche es erneut.',
    background: 'Hintergrund-Agent',
    queued: 'Wartet auf einen freien Agent-Platz',
    running: 'Hintergrund-Agent arbeitet',
    done: 'Bereit zur Prüfung',
    failed: 'Hintergrundaufgabe braucht Aufmerksamkeit',
    cancelled: 'Hintergrundaufgabe gestoppt',
    chatQueued: 'Wartet auf den Hintergrund-Agenten',
    chatRunning: 'Hintergrund-Agent arbeitet',
    chatDone: 'Hintergrundarbeit abgeschlossen',
    chatFailed: 'Hintergrundarbeit braucht Aufmerksamkeit',
    chatCancelled: 'Hintergrundarbeit gestoppt',
    textMode: 'Zurück zum Textmodus',
    queuedTurns: 'Spracheingaben warten',
  },
} as const;

const t = computed(() => copy[props.locale]);
const active = ref(false);
const starting = ref(false);
const capturing = ref(false);
const processingCount = ref(0);
const speaking = ref(false);
const errorMessage = ref('');
const transcript = ref('');
const assistantCaption = ref('');
const levels = ref<number[]>(Array.from({ length: 32 }, () => 0.08));
const currentJob = ref<VoiceJob | null>(null);
const pendingConfirmation = ref(false);

let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let mediaSource: MediaStreamAudioSourceNode | null = null;
let captureNode: AudioWorkletNode | null = null;
let silentGain: GainNode | null = null;
let speechAbort: AbortController | null = null;
let speechFinishTimer: ReturnType<typeof setTimeout> | null = null;
let currentSpokenText = '';
let lastSpokenText = '';
let lastSpeechEndedAt = 0;
let scheduledSources = new Set<AudioBufferSourceNode>();
let ringFrames: Float32Array[] = [];
let capturedFrames: Float32Array[] = [];
let capturedSamples = 0;
let voicedFrames = 0;
let silentFrames = 0;
let noiseFloor = 0.004;
let lastLevelPaint = 0;
let playbackSettleFrames = 0;
let turnQueue: Promise<void> = Promise.resolve();

const RING_FRAME_LIMIT = 24;
const START_VOICE_FRAMES = 4;
const END_SILENCE_FRAMES = 38;
const MIN_SEGMENT_SECONDS = 0.34;
const MAX_SEGMENT_SECONDS = 18;
const BARGE_IN_SETTLE_FRAMES = 8;
const ECHO_REFERENCE_TTL_MS = 15_000;

const stateLabel = computed(() => {
  if (starting.value) return t.value.starting;
  if (speaking.value) return t.value.speaking;
  if (capturing.value) return t.value.capturing;
  if (processingCount.value) return t.value.processing;
  return t.value.listening;
});
const stateKind = computed(() => speaking.value
  ? 'speaking'
  : capturing.value
    ? 'capturing'
    : processingCount.value
      ? 'processing'
      : 'listening');
const visibleCaption = computed(() => assistantCaption.value || transcript.value || t.value.idleCaption);
const jobStatusLabel = computed(() => {
  if (!currentJob.value) return '';
  if (currentJob.value.taskId) return t.value[currentJob.value.status];
  const key = `chat${currentJob.value.status[0]!.toUpperCase()}${currentJob.value.status.slice(1)}` as
    'chatQueued' | 'chatRunning' | 'chatDone' | 'chatFailed' | 'chatCancelled';
  return t.value[key];
});

onBeforeUnmount(() => {
  void stopVoice();
});

watch(() => props.chatId, () => {
  if (active.value) void stopVoice();
  currentJob.value = null;
  transcript.value = '';
  assistantCaption.value = '';
});

async function startVoice() {
  if (active.value || starting.value) return;
  starting.value = true;
  emit('activeChange', true);
  errorMessage.value = '';
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      throw new Error('voice_browser_unavailable');
    }
    const capabilities = await $fetch<{ available: boolean }>(`/api/project-chats/${props.chatId}/voice/capabilities`);
    if (!capabilities.available) throw new Error('voice_server_unavailable');
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    audioContext = new AudioContext({ latencyHint: 'interactive' });
    await audioContext.audioWorklet.addModule('/voice-capture-worklet.js');
    await audioContext.resume();
    mediaSource = audioContext.createMediaStreamSource(mediaStream);
    captureNode = new AudioWorkletNode(audioContext, 'agent-kanban-voice-capture');
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    captureNode.port.onmessage = (event: MessageEvent<{ samples?: Float32Array }>) => {
      if (event.data.samples) processAudioFrame(event.data.samples);
    };
    mediaSource.connect(captureNode);
    captureNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
    active.value = true;
    emit('activeChange', true);
    await loadStatus();
    void speakText(t.value.greeting);
  } catch (error) {
    await releaseAudio();
    const name = error instanceof DOMException ? error.name : error instanceof Error ? error.message : '';
    errorMessage.value = name === 'NotAllowedError' || name === 'PermissionDeniedError'
      ? t.value.permission
      : t.value.unavailable;
  } finally {
    starting.value = false;
  }
}

async function stopVoice() {
  stopSpeech();
  active.value = false;
  starting.value = false;
  capturing.value = false;
  processingCount.value = 0;
  errorMessage.value = '';
  resetCapture();
  await releaseAudio();
  emit('activeChange', false);
}

async function releaseAudio() {
  if (captureNode) captureNode.port.onmessage = null;
  captureNode?.disconnect();
  mediaSource?.disconnect();
  silentGain?.disconnect();
  for (const track of mediaStream?.getTracks() ?? []) track.stop();
  if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => undefined);
  mediaStream = null;
  audioContext = null;
  mediaSource = null;
  captureNode = null;
  silentGain = null;
}

function processAudioFrame(samples: Float32Array) {
  if (!active.value || !audioContext) return;
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  const now = performance.now();
  if (now - lastLevelPaint > 42) {
    lastLevelPaint = now;
    const normalized = Math.min(1, Math.max(0.06, (rms - noiseFloor) * 24));
    levels.value = [...levels.value.slice(-31), normalized];
  }

  const playbackActive = speaking.value || Boolean(speechAbort);
  const threshold = playbackActive
    ? Math.max(0.035, noiseFloor * 4.5)
    : Math.max(0.014, noiseFloor * 3.1);
  if (!capturing.value && rms < threshold) {
    noiseFloor = noiseFloor * 0.985 + rms * 0.015;
  }

  if (playbackActive) {
    ringFrames = [];
    voicedFrames = rms >= threshold ? voicedFrames + 1 : 0;
    if (voicedFrames < START_VOICE_FRAMES) return;
    stopSpeech();
    resetCapture();
    playbackSettleFrames = BARGE_IN_SETTLE_FRAMES;
    return;
  }

  if (playbackSettleFrames > 0) {
    playbackSettleFrames -= 1;
    resetCapture();
    return;
  }

  if (!capturing.value) {
    ringFrames.push(samples);
    if (ringFrames.length > RING_FRAME_LIMIT) ringFrames.shift();
    voicedFrames = rms >= threshold ? voicedFrames + 1 : 0;
    if (voicedFrames < START_VOICE_FRAMES) return;
    capturedFrames = [...ringFrames];
    capturedSamples = capturedFrames.reduce((sum, frame) => sum + frame.length, 0);
    ringFrames = [];
    silentFrames = 0;
    capturing.value = true;
    return;
  }

  capturedFrames.push(samples);
  capturedSamples += samples.length;
  silentFrames = rms < threshold ? silentFrames + 1 : 0;
  const duration = capturedSamples / audioContext.sampleRate;
  if (silentFrames >= END_SILENCE_FRAMES || duration >= MAX_SEGMENT_SECONDS) {
    finishSegment(audioContext.sampleRate);
  }
}

function finishSegment(sampleRate: number) {
  if (!capturing.value) return;
  const frames = capturedFrames;
  const sampleCount = capturedSamples;
  capturing.value = false;
  resetCapture();
  const duration = sampleCount / sampleRate;
  if (duration < MIN_SEGMENT_SECONDS || !active.value) return;
  const samples = joinFrames(frames, sampleCount);
  const wav = encodeWav(samples, sampleRate, 16_000);
  processingCount.value += 1;
  turnQueue = turnQueue
    .then(() => active.value ? submitSegment(wav) : undefined)
    .catch(() => undefined)
    .finally(() => {
      processingCount.value = Math.max(0, processingCount.value - 1);
    });
}

function resetCapture() {
  capturedFrames = [];
  capturedSamples = 0;
  voicedFrames = 0;
  silentFrames = 0;
  ringFrames = [];
}

async function submitSegment(wav: Blob) {
  if (!active.value) return;
  const form = new FormData();
  form.append('audio', wav, 'voice-turn.wav');
  form.append('locale', props.locale);
  const echoReference = currentSpokenText || (Date.now() - lastSpeechEndedAt <= ECHO_REFERENCE_TTL_MS ? lastSpokenText : '');
  if (echoReference) form.append('echoReference', echoReference);
  try {
    const response = await $fetch<VoiceTurnResponse>(`/api/project-chats/${props.chatId}/voice/turn`, {
      method: 'POST',
      body: form,
    });
    transcript.value = response.transcript;
    if (response.ignored) return;
    assistantCaption.value = response.spokenResponse || '';
    pendingConfirmation.value = Boolean(response.pendingConfirmation);
    if (response.job) currentJob.value = response.job;
    emit('turnCompleted');
    if (response.spokenResponse && active.value) void speakText(response.spokenResponse);
  } catch {
    errorMessage.value = t.value.connection;
  }
}

async function speakText(text: string) {
  if (!active.value || !audioContext || !text.trim()) return;
  stopSpeech();
  currentSpokenText = text.trim();
  const controller = new AbortController();
  speechAbort = controller;
  try {
    const response = await fetch(`/api/project-chats/${props.chatId}/voice/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: currentSpokenText }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body || !audioContext) throw new Error('voice_speech_failed');
    const sampleRate = Number(response.headers.get('x-audio-sample-rate') || 24_000);
    const reader = response.body.getReader();
    let carry = new Uint8Array();
    let scheduleAt = audioContext.currentTime + 0.08;
    let firstChunk = true;
    while (true) {
      const { done, value } = await reader.read();
      if (done || controller.signal.aborted || !audioContext) break;
      const joined = new Uint8Array(carry.length + value.length);
      joined.set(carry);
      joined.set(value, carry.length);
      const evenLength = joined.length - (joined.length % 2);
      carry = joined.slice(evenLength);
      if (!evenLength) continue;
      const pcm = pcm16ToFloat(joined.subarray(0, evenLength));
      const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
      buffer.copyToChannel(pcm, 0);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      scheduledSources.add(source);
      source.onended = () => scheduledSources.delete(source);
      if (firstChunk) {
        firstChunk = false;
        speaking.value = true;
      }
      scheduleAt = Math.max(scheduleAt, audioContext.currentTime + 0.04);
      source.start(scheduleAt);
      scheduleAt += buffer.duration;
    }
    if (controller.signal.aborted || !audioContext) return;
    const remainingMs = Math.max(0, (scheduleAt - audioContext.currentTime) * 1000);
    speechFinishTimer = setTimeout(() => {
      rememberCurrentSpeech();
      speaking.value = false;
      speechAbort = null;
      currentSpokenText = '';
      speechFinishTimer = null;
    }, remainingMs + 40);
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') errorMessage.value = t.value.connection;
    rememberCurrentSpeech();
    speaking.value = false;
    speechAbort = null;
    currentSpokenText = '';
  }
}

function stopSpeech() {
  rememberCurrentSpeech();
  speechAbort?.abort();
  speechAbort = null;
  if (speechFinishTimer) clearTimeout(speechFinishTimer);
  speechFinishTimer = null;
  for (const source of scheduledSources) {
    try { source.stop(); } catch { /* Already stopped. */ }
  }
  scheduledSources = new Set();
  speaking.value = false;
  currentSpokenText = '';
}

function rememberCurrentSpeech() {
  if (!currentSpokenText) return;
  lastSpokenText = currentSpokenText;
  lastSpeechEndedAt = Date.now();
}

async function loadStatus() {
  try {
    const status = await $fetch<{ jobs: VoiceJob[]; pendingConfirmation: unknown }>(`/api/project-chats/${props.chatId}/voice/status`);
    currentJob.value = status.jobs.find((job) => job.status === 'running' || job.status === 'queued') ?? status.jobs[0] ?? null;
    pendingConfirmation.value = Boolean(status.pendingConfirmation);
  } catch {
    // The capability request already provides the actionable error state.
  }
}

function handleBridgeEvent(type: 'update' | 'progress', payload: VoiceBridgePayload) {
  const status = payload.status ?? currentJob.value?.status ?? 'running';
  currentJob.value = {
    id: payload.jobId || currentJob.value?.id || '',
    taskId: payload.taskId || currentJob.value?.taskId || '',
    taskKey: payload.taskKey || currentJob.value?.taskKey || '',
    title: payload.title || currentJob.value?.title || '',
    harness: payload.harness || currentJob.value?.harness || props.harness,
    reasoningEffort: currentJob.value?.reasoningEffort || '',
    status,
    latestProgress: payload.detail ?? currentJob.value?.latestProgress ?? null,
    createdAt: currentJob.value?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!active.value || !payload.announce) return;
  const announcement = bridgeAnnouncement(type, payload, status);
  if (announcement) {
    assistantCaption.value = announcement;
    void speakText(announcement);
  }
}

function bridgeAnnouncement(type: 'update' | 'progress', payload: VoiceBridgePayload, status: VoiceJobStatus) {
  const key = payload.taskKey || currentJob.value?.taskKey || (props.locale === 'de' ? 'Die Aufgabe' : 'The task');
  const isChatJob = !(payload.taskId || currentJob.value?.taskId);
  if (type === 'progress' && payload.detail) {
    return props.locale === 'de' ? `Kurzes Update zu ${key}: ${payload.detail}` : `A quick update on ${key}: ${payload.detail}`;
  }
  if (status === 'running') return props.locale === 'de' ? `${key} wird jetzt bearbeitet.` : `${key} is now being worked on.`;
  if (status === 'done') return isChatJob
    ? (props.locale === 'de' ? 'Die Hintergrundarbeit im Projektchat ist abgeschlossen.' : 'The background work in the project chat is complete.')
    : (props.locale === 'de' ? `${key} ist abgeschlossen und bereit zur Prüfung.` : `${key} is complete and ready for review.`);
  if (status === 'failed') return isChatJob
    ? (props.locale === 'de' ? 'Die Hintergrundarbeit im Projektchat konnte nicht abgeschlossen werden.' : 'The background work in the project chat could not be completed.')
    : (props.locale === 'de' ? `${key} konnte nicht abgeschlossen werden. Bitte prüfe die Aufgabe.` : `${key} could not be completed. Please review the task.`);
  if (status === 'cancelled') return props.locale === 'de' ? `${key} wurde gestoppt.` : `${key} was stopped.`;
  return '';
}

function joinFrames(frames: Float32Array[], total: number) {
  const output = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    output.set(frame, offset);
    offset += frame.length;
  }
  return output;
}

function encodeWav(input: Float32Array, inputRate: number, outputRate: number) {
  const outputLength = Math.max(1, Math.floor(input.length * outputRate / inputRate));
  const samples = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let source = start; source < Math.min(end, input.length); source += 1) sum += input[source] ?? 0;
    samples[index] = sum / Math.max(1, Math.min(end, input.length) - start);
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function pcm16ToFloat(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return output;
}

defineExpose({ startVoice, stopVoice, handleBridgeEvent });
</script>

<template>
  <section
    v-if="active || starting || errorMessage"
    class="ak-voice-console"
    :class="`is-${stateKind}`"
    :aria-label="active ? t.stop : t.start"
    data-testid="project-voice-console"
  >
    <div v-if="currentJob" class="ak-voice-job" role="status">
      <span class="ak-voice-job-dot" :class="`is-${currentJob.status}`" aria-hidden="true" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
          {{ currentJob.taskKey }} · {{ jobStatusLabel }}
        </span>
        <span class="mt-0.5 block truncate text-[0.6875rem] text-zinc-600 dark:text-zinc-300">
          {{ currentJob.latestProgress || currentJob.title }}
        </span>
      </span>
      <span class="shrink-0 text-[0.625rem] font-medium text-zinc-500 dark:text-zinc-400">{{ currentJob.harness }}</span>
    </div>

    <div class="ak-voice-stage">
      <div class="ak-voice-state" role="status" aria-live="polite">
        <span class="ak-voice-state-dot" aria-hidden="true" />
        <span>{{ stateLabel }}</span>
        <span v-if="processingCount > 1" class="text-zinc-500 dark:text-zinc-400">· {{ processingCount }} {{ t.queuedTurns }}</span>
      </div>

      <div class="ak-voice-control-row">
        <div class="ak-voice-wave" aria-hidden="true">
          <span
            v-for="(level, index) in levels.slice(0, 12)"
            :key="`left-${index}`"
            :style="{ '--ak-scale': 0.12 + level * 0.88 }"
          />
        </div>
        <button
          type="button"
          class="ak-voice-microphone"
          :aria-label="t.stop"
          :title="t.stop"
          data-testid="project-voice-stop"
          @click="stopVoice"
        >
          <span class="ak-voice-pulse ak-voice-pulse-one" aria-hidden="true" />
          <span class="ak-voice-pulse ak-voice-pulse-two" aria-hidden="true" />
          <UIcon name="i-lucide-mic" class="relative size-7" />
        </button>
        <div class="ak-voice-wave" aria-hidden="true">
          <span
            v-for="(level, index) in levels.slice(20).reverse()"
            :key="`right-${index}`"
            :style="{ '--ak-scale': 0.12 + level * 0.88 }"
          />
        </div>
      </div>

      <p class="ak-voice-caption" :class="pendingConfirmation ? 'font-semibold text-amber-800 dark:text-amber-200' : ''">
        {{ visibleCaption }}
      </p>
      <p class="ak-voice-listening-note">
        <UIcon name="i-lucide-audio-lines" class="size-3.5" />
        {{ t.stillListening }}
      </p>
    </div>

    <div class="ak-voice-footer">
      <span class="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-[0.6875rem] text-zinc-600 dark:text-zinc-300">
        <UIcon name="i-lucide-shield-check" class="size-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
        <span class="truncate">{{ projectName }} · {{ harness }}</span>
      </span>
      <button type="button" class="ak-voice-text-mode" @click="stopVoice">
        <UIcon name="i-lucide-keyboard" class="size-3.5" />
        {{ t.textMode }}
      </button>
    </div>
    <p v-if="errorMessage" class="ak-voice-error" role="alert">
      <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
      <span>{{ errorMessage }}</span>
    </p>
  </section>
</template>

<style scoped>
.ak-voice-console {
  --ak-voice-accent: 13 148 136;
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  padding: 0.75rem;
  border-radius: 0.875rem;
  background: rgb(255 255 255);
  box-shadow: inset 0 0 0 1px rgb(212 212 216);
  container-type: inline-size;
}

:global(.dark .ak-voice-console) {
  background: rgb(9 9 11);
  box-shadow: inset 0 0 0 1px rgb(63 63 70);
}

.ak-voice-job {
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  background: rgb(244 244 245);
}

:global(.dark .ak-voice-job) {
  background: rgb(39 39 42 / 0.78);
}

.ak-voice-job-dot,
.ak-voice-state-dot {
  width: 0.5rem;
  height: 0.5rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgb(13 148 136);
}

.ak-voice-job-dot.is-queued { background: rgb(217 119 6); }
.ak-voice-job-dot.is-done { background: rgb(5 150 105); }
.ak-voice-job-dot.is-failed { background: rgb(220 38 38); }
.ak-voice-job-dot.is-cancelled { background: rgb(113 113 122); }

.ak-voice-stage {
  display: grid;
  width: 100%;
  min-width: 0;
  justify-items: center;
  gap: 0.625rem;
  padding: 0.125rem 0.25rem 0.25rem;
  text-align: center;
}

.ak-voice-state {
  display: flex;
  min-height: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  color: rgb(24 24 27);
  font-size: 0.75rem;
  font-weight: 600;
}

:global(.dark .ak-voice-state) { color: rgb(244 244 245); }

.is-speaking .ak-voice-state-dot { background: rgb(8 145 178); }
.is-processing .ak-voice-state-dot { background: rgb(217 119 6); }
.is-capturing .ak-voice-state-dot { animation: ak-voice-state-pulse 900ms ease-in-out infinite alternate; }

.ak-voice-control-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.ak-voice-wave {
  display: flex;
  width: min(6.25rem, 25%);
  height: 2.75rem;
  align-items: center;
  justify-content: flex-end;
  gap: 0.1875rem;
  overflow: hidden;
}

.ak-voice-wave:last-child { justify-content: flex-start; }

.ak-voice-wave span {
  width: 0.125rem;
  height: 2.35rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgb(var(--ak-voice-accent) / 0.72);
  transform: scaleY(var(--ak-scale));
  transition: opacity 160ms ease-out, transform 100ms cubic-bezier(0.22, 1, 0.36, 1);
}

.is-capturing .ak-voice-wave span,
.is-speaking .ak-voice-wave span {
  opacity: 1;
}

.ak-voice-microphone {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 4.5rem;
  height: 4.5rem;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgb(15 118 110);
  color: white;
  box-shadow: 0 4px 8px rgb(15 23 42 / 0.22);
  transition: transform 150ms cubic-bezier(0.22, 1, 0.36, 1), background-color 150ms ease-out;
}

.ak-voice-microphone:hover { background: rgb(17 94 89); transform: translateY(-1px); }
.ak-voice-microphone:active { transform: scale(0.97); }
.ak-voice-microphone:focus-visible { outline: 3px solid rgb(20 184 166); outline-offset: 4px; }

.is-speaking .ak-voice-microphone { background: rgb(14 116 144); }
.is-processing .ak-voice-microphone { background: rgb(63 63 70); }

.ak-voice-pulse {
  position: absolute;
  z-index: -1;
  inset: -0.45rem;
  border: 1px solid rgb(var(--ak-voice-accent) / 0.28);
  border-radius: inherit;
  pointer-events: none;
}

.ak-voice-pulse-two { inset: -0.9rem; opacity: 0.48; }
.is-listening .ak-voice-pulse-one,
.is-capturing .ak-voice-pulse-one { animation: ak-voice-ring 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
.is-listening .ak-voice-pulse-two,
.is-capturing .ak-voice-pulse-two { animation: ak-voice-ring 2.2s 320ms cubic-bezier(0.22, 1, 0.36, 1) infinite; }

.ak-voice-caption {
  width: 100%;
  max-width: 48ch;
  min-height: 2.75rem;
  margin: 0;
  color: rgb(63 63 70);
  font-size: 0.875rem;
  line-height: 1.45;
  text-wrap: pretty;
  overflow-wrap: anywhere;
}

:global(.dark .ak-voice-caption) { color: rgb(228 228 231); }

.ak-voice-listening-note {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  color: rgb(82 82 91);
  font-size: 0.6875rem;
  max-width: 100%;
  text-align: center;
  overflow-wrap: anywhere;
}

:global(.dark .ak-voice-listening-note) { color: rgb(161 161 170); }

.ak-voice-footer {
  display: flex;
  min-width: 0;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.625rem;
  border-top: 1px solid rgb(228 228 231);
}

:global(.dark .ak-voice-footer) { border-top-color: rgb(39 39 42); }

.ak-voice-text-mode {
  display: inline-flex;
  min-height: 2.25rem;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: rgb(63 63 70);
  font-size: 0.6875rem;
  font-weight: 600;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}

.ak-voice-text-mode:hover { background: rgb(244 244 245); color: rgb(15 118 110); }
.ak-voice-text-mode:focus-visible { outline: 2px solid rgb(13 148 136); outline-offset: 2px; }
:global(.dark .ak-voice-text-mode) { color: rgb(212 212 216); }
:global(.dark .ak-voice-text-mode:hover) { background: rgb(39 39 42); color: rgb(94 234 212); }

.ak-voice-error {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  margin: 0;
  color: rgb(185 28 28);
  font-size: 0.75rem;
  line-height: 1.4;
}

:global(.dark .ak-voice-error) { color: rgb(252 165 165); }

@container (max-width: 22rem) {
  .ak-voice-console { padding: 0.625rem; }
  .ak-voice-wave { width: 4rem; gap: 0.125rem; }
  .ak-voice-wave span:nth-child(-n+4) { display: none; }
  .ak-voice-footer { align-items: flex-start; flex-direction: column; gap: 0.25rem; }
  .ak-voice-text-mode { align-self: stretch; justify-content: center; }
}

@media (pointer: coarse) {
  .ak-voice-text-mode { min-height: 2.75rem; }
}

@media (prefers-reduced-motion: reduce) {
  .ak-voice-wave span,
  .ak-voice-microphone { transition-duration: 1ms; }
  .ak-voice-pulse,
  .ak-voice-state-dot { animation: none !important; }
  .ak-voice-microphone:hover { transform: none; }
}

@keyframes ak-voice-ring {
  0% { opacity: 0.6; transform: scale(0.92); }
  70%, 100% { opacity: 0; transform: scale(1.12); }
}

@keyframes ak-voice-state-pulse {
  from { opacity: 0.45; }
  to { opacity: 1; }
}
</style>
