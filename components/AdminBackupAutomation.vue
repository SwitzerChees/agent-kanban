<script setup lang="ts">
interface Destination {
  id: string;
  name: string;
  bucket: string;
  endpoint: string;
  region: string;
  prefix: string;
  forcePathStyle: boolean;
  serverSideEncryption: '' | 'AES256' | 'aws:kms';
  kmsKeyId: string;
  credentialsConfigured: boolean;
}

interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  destinationId: string;
  destinationName: string;
  destinationDirectory: string;
  retentionCount: number;
  retentionDays: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: 'running' | 'success' | 'failed' | null;
  lastError: string | null;
}

const props = defineProps<{ locale: 'en' | 'de' }>();
const emit = defineEmits<{ changed: [] }>();

const copy = computed(() => props.locale === 'de' ? {
  eyebrow: 'Automatisierung', title: 'S3-Backups planen', description: 'Ziele einmal sicher hinterlegen und Backups per Cron mit automatischer Rotation ausführen.',
  schedules: 'Zeitpläne', destinations: 'S3-Ziele', addSchedule: 'Zeitplan anlegen', addDestination: 'S3-Ziel anlegen',
  noSchedules: 'Noch keine automatischen Backups geplant.', noDestinations: 'Noch kein S3-Ziel konfiguriert.',
  enabled: 'Aktiv', disabled: 'Pausiert', next: 'Nächster Lauf', last: 'Letzter Lauf', never: 'Noch nie',
  retention: '{days} Tage · max. {count} Backups', run: 'Jetzt ausführen', edit: 'Bearbeiten', remove: 'Löschen',
  newDestination: 'S3-Ziel anlegen', editDestination: 'S3-Ziel bearbeiten', destinationDescription: 'Kompatibel mit AWS S3 und S3-kompatiblen Object Storages.',
  name: 'Name', nameHint: 'Ein gut erkennbarer Name', bucket: 'Bucket-Name', endpoint: 'Endpoint', endpointHint: 'Bei AWS S3 leer lassen; bei S3-kompatiblen Diensten die HTTPS-URL eintragen.',
  region: 'Region', basePrefix: 'Basisverzeichnis', basePrefixHint: 'Optionaler gemeinsamer Pfad innerhalb des Buckets.',
  accessKey: 'Access Key', secretKey: 'Secret Key', credentialsHint: 'Verschlüsselt auf diesem Server gespeichert und nicht in Backups exportiert.',
  keepCredentials: 'Leer lassen, um die gespeicherten Zugangsdaten beizubehalten.', clearCredentials: 'Gespeicherte Zugangsdaten entfernen',
  pathStyle: 'Path-Style-Zugriff verwenden', pathStyleHint: 'Für die meisten S3-kompatiblen Endpoints erforderlich; verhindert Bucket-Subdomains und Zertifikatsfehler.', encryption: 'Serverseitige Verschlüsselung', noEncryption: 'Nicht explizit setzen', kmsKey: 'KMS Key ID',
  test: 'Verbindung testen', testing: 'Verbindung wird geprüft …', testOk: 'Verbindung erfolgreich.', save: 'Speichern', cancel: 'Abbrechen',
  newSchedule: 'Backup-Zeitplan anlegen', editSchedule: 'Backup-Zeitplan bearbeiten', scheduleDescription: 'Cron-Ausdruck und Zeitzone bestimmen den nächsten Lauf.',
  cron: 'Cron-Ausdruck', cronHint: 'Fünf Felder: Minute, Stunde, Tag, Monat, Wochentag. Beispiel: 17 */12 * * *',
  timezone: 'Zeitzone', destination: 'S3-Ziel', directory: 'Zielverzeichnis', directoryHint: 'Relativ zum Basisverzeichnis des S3-Ziels.',
  retentionDays: 'Aufbewahrungstage', retentionDaysHint: 'Backups, die älter sind, werden beim nächsten erfolgreichen Upload gelöscht.',
  retentionCount: 'Maximale Anzahl', retentionCountHint: 'Zusätzliche Obergrenze; die jeweils strengere Regel greift.', activeSchedule: 'Zeitplan aktivieren',
  confirmDestination: 'Dieses S3-Ziel wirklich löschen?', confirmSchedule: 'Diesen Backup-Zeitplan wirklich löschen?',
  queued: 'Backup wurde zur Ausführung vorgemerkt.', loading: 'Konfiguration wird geladen …', failed: 'Fehlgeschlagen', success: 'Erfolgreich', running: 'Läuft', credentials: 'Zugangsdaten',
} : {
  eyebrow: 'Automation', title: 'Schedule S3 backups', description: 'Store destinations securely once, then run backups by cron with automatic rotation.',
  schedules: 'Schedules', destinations: 'S3 destinations', addSchedule: 'Add schedule', addDestination: 'Add S3 destination',
  noSchedules: 'No automated backups scheduled yet.', noDestinations: 'No S3 destination configured yet.',
  enabled: 'Enabled', disabled: 'Paused', next: 'Next run', last: 'Last run', never: 'Never',
  retention: '{days} days · max. {count} backups', run: 'Run now', edit: 'Edit', remove: 'Delete',
  newDestination: 'Add S3 destination', editDestination: 'Edit S3 destination', destinationDescription: 'Works with AWS S3 and S3-compatible object storage.',
  name: 'Name', nameHint: 'An easy-to-recognize name', bucket: 'Bucket name', endpoint: 'Endpoint', endpointHint: 'Leave empty for AWS S3; enter the HTTPS URL for compatible providers.',
  region: 'Region', basePrefix: 'Base directory', basePrefixHint: 'Optional shared path inside the bucket.',
  accessKey: 'Access key', secretKey: 'Secret key', credentialsHint: 'Stored encrypted on this server and excluded from backups.',
  keepCredentials: 'Leave empty to keep the stored credentials.', clearCredentials: 'Remove stored credentials',
  pathStyle: 'Use path-style access', pathStyleHint: 'Required by most S3-compatible endpoints; avoids bucket subdomains and certificate errors.', encryption: 'Server-side encryption', noEncryption: 'Do not set explicitly', kmsKey: 'KMS key ID',
  test: 'Test connection', testing: 'Testing connection …', testOk: 'Connection successful.', save: 'Save', cancel: 'Cancel',
  newSchedule: 'Add backup schedule', editSchedule: 'Edit backup schedule', scheduleDescription: 'The cron expression and time zone determine the next run.',
  cron: 'Cron expression', cronHint: 'Five fields: minute, hour, day, month, weekday. Example: 17 */12 * * *',
  timezone: 'Time zone', destination: 'S3 destination', directory: 'Destination directory', directoryHint: 'Relative to the S3 destination base directory.',
  retentionDays: 'Retention days', retentionDaysHint: 'Older backups are removed after the next successful upload.',
  retentionCount: 'Maximum count', retentionCountHint: 'Additional upper limit; whichever rule is stricter applies.', activeSchedule: 'Enable schedule',
  confirmDestination: 'Delete this S3 destination?', confirmSchedule: 'Delete this backup schedule?',
  queued: 'Backup was queued to run.', loading: 'Loading configuration …', failed: 'Failed', success: 'Successful', running: 'Running', credentials: 'Credentials',
});

const destinations = ref<Destination[]>([]);
const schedules = ref<Schedule[]>([]);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const destinationModalOpen = ref(false);
const scheduleModalOpen = ref(false);
const editingDestinationId = ref<string | null>(null);
const editingScheduleId = ref<string | null>(null);
const destinationForm = reactive({
  name: '', bucket: '', endpoint: '', region: 'eu-central-1', prefix: 'agent-kanban',
  forcePathStyle: false, serverSideEncryption: 'none' as 'none' | 'AES256' | 'aws:kms', kmsKeyId: '',
  accessKeyId: '', secretAccessKey: '', clearCredentials: false,
});
const scheduleForm = reactive({
  name: '', cronExpression: '17 */12 * * *', timezone: 'Europe/Zurich', destinationId: '',
  destinationDirectory: '', retentionDays: 28, retentionCount: 30, enabled: true,
});

const destinationItems = computed(() => destinations.value.map((item) => ({ label: item.name, value: item.id })));
const timezoneItems = computed(() => {
  return typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['Europe/Zurich', 'Europe/Berlin', 'UTC', 'America/New_York'];
});
const encryptionItems = computed(() => [
  { label: copy.value.noEncryption, value: 'none' },
  { label: 'AES-256 (SSE-S3)', value: 'AES256' },
  { label: 'AWS KMS (SSE-KMS)', value: 'aws:kms' },
]);

onMounted(load);

watch(() => destinationForm.endpoint, (endpoint, previous) => {
  if (!editingDestinationId.value && endpoint && !previous) destinationForm.forcePathStyle = true;
});

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    [destinations.value, schedules.value] = await Promise.all([
      $fetch<Destination[]>('/api/admin/backup-destinations'),
      $fetch<Schedule[]>('/api/admin/backup-schedules'),
    ]);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    loading.value = false;
  }
}

function openDestination(destination?: Destination) {
  editingDestinationId.value = destination?.id ?? null;
  Object.assign(destinationForm, {
    name: destination?.name ?? '', bucket: destination?.bucket ?? '', endpoint: destination?.endpoint ?? '',
    region: destination?.region ?? 'eu-central-1', prefix: destination?.prefix ?? 'agent-kanban',
    forcePathStyle: destination?.forcePathStyle ?? false,
    serverSideEncryption: destination?.serverSideEncryption || 'none', kmsKeyId: destination?.kmsKeyId ?? '',
    accessKeyId: '', secretAccessKey: '', clearCredentials: false,
  });
  successMessage.value = '';
  errorMessage.value = '';
  destinationModalOpen.value = true;
}

function destinationBody() {
  return {
    ...destinationForm,
    serverSideEncryption: destinationForm.serverSideEncryption === 'none' ? '' : destinationForm.serverSideEncryption,
    accessKeyId: destinationForm.accessKeyId || undefined,
    secretAccessKey: destinationForm.secretAccessKey || undefined,
  };
}

async function saveDestination() {
  busy.value = true;
  errorMessage.value = '';
  try {
    await $fetch(editingDestinationId.value ? `/api/admin/backup-destinations/${editingDestinationId.value}` : '/api/admin/backup-destinations', {
      method: editingDestinationId.value ? 'PATCH' : 'POST',
      body: destinationBody(),
    });
    destinationModalOpen.value = false;
    await load();
    emit('changed');
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    busy.value = false;
  }
}

async function testDestination() {
  busy.value = true;
  successMessage.value = copy.value.testing;
  errorMessage.value = '';
  try {
    await $fetch('/api/admin/backup-destinations/test', {
      method: 'POST',
      body: { id: editingDestinationId.value || undefined, destination: destinationBody() },
    });
    successMessage.value = copy.value.testOk;
  } catch (error) {
    successMessage.value = '';
    errorMessage.value = humanError(error);
  } finally {
    busy.value = false;
  }
}

async function removeDestination(destination: Destination) {
  if (!window.confirm(copy.value.confirmDestination)) return;
  await action(async () => {
    await $fetch(`/api/admin/backup-destinations/${destination.id}`, { method: 'DELETE' });
    await load();
    emit('changed');
  });
}

function openSchedule(schedule?: Schedule) {
  if (!destinations.value.length) {
    openDestination();
    return;
  }
  editingScheduleId.value = schedule?.id ?? null;
  Object.assign(scheduleForm, {
    name: schedule?.name ?? '', cronExpression: schedule?.cronExpression ?? '17 */12 * * *',
    timezone: schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Zurich',
    destinationId: schedule?.destinationId ?? destinations.value[0]!.id,
    destinationDirectory: schedule?.destinationDirectory ?? '', retentionDays: schedule?.retentionDays ?? 28,
    retentionCount: schedule?.retentionCount ?? 30, enabled: schedule?.enabled ?? true,
  });
  errorMessage.value = '';
  scheduleModalOpen.value = true;
}

async function saveSchedule() {
  busy.value = true;
  errorMessage.value = '';
  try {
    await $fetch(editingScheduleId.value ? `/api/admin/backup-schedules/${editingScheduleId.value}` : '/api/admin/backup-schedules', {
      method: editingScheduleId.value ? 'PATCH' : 'POST',
      body: { ...scheduleForm },
    });
    scheduleModalOpen.value = false;
    await load();
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    busy.value = false;
  }
}

async function removeSchedule(schedule: Schedule) {
  if (!window.confirm(copy.value.confirmSchedule)) return;
  await action(async () => {
    await $fetch(`/api/admin/backup-schedules/${schedule.id}`, { method: 'DELETE' });
    await load();
  });
}

async function runNow(schedule: Schedule) {
  await action(async () => {
    await $fetch(`/api/admin/backup-schedules/${schedule.id}/run`, { method: 'POST' });
    successMessage.value = copy.value.queued;
    window.setTimeout(() => { void load(); }, 800);
  });
}

async function action(callback: () => Promise<void>) {
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await callback();
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    busy.value = false;
  }
}

function statusLabel(status: Schedule['lastStatus']) {
  return status ? copy.value[status] : copy.value.never;
}

function statusColor(status: Schedule['lastStatus']) {
  return status === 'success' ? 'success' : status === 'failed' ? 'error' : status === 'running' ? 'primary' : 'neutral';
}

function date(value: string | null) {
  if (!value) return copy.value.never;
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-CH' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function retention(schedule: Schedule) {
  return copy.value.retention.replace('{days}', String(schedule.retentionDays)).replace('{count}', String(schedule.retentionCount));
}

function humanError(error: unknown) {
  const code = (error as { data?: { statusMessage?: string }; statusMessage?: string })?.data?.statusMessage
    ?? (error as { statusMessage?: string })?.statusMessage
    ?? (error instanceof Error ? error.message : 'unknown_error');
  const messages: Record<string, { de: string; en: string }> = {
    backup_cron_invalid: { de: 'Der Cron-Ausdruck ist ungültig. Bitte genau fünf Felder verwenden.', en: 'The cron expression is invalid. Use exactly five fields.' },
    backup_timezone_invalid: { de: 'Die Zeitzone ist ungültig.', en: 'The time zone is invalid.' },
    backup_name_exists: { de: 'Dieser Name wird bereits verwendet.', en: 'This name is already in use.' },
    backup_destination_in_use: { de: 'Das Ziel wird noch von einem Zeitplan verwendet.', en: 'This destination is still used by a schedule.' },
    backup_s3_credentials_incomplete: { de: 'Access Key und Secret Key müssen gemeinsam angegeben werden.', en: 'Access key and secret key must be provided together.' },
    backup_s3_kms_key_required: { de: 'Für SSE-KMS ist eine KMS Key ID erforderlich.', en: 'SSE-KMS requires a KMS key ID.' },
    backup_credentials_unavailable: { de: 'Die gespeicherten Zugangsdaten konnten nicht entschlüsselt werden.', en: 'Stored credentials could not be decrypted.' },
    backup_runtime_busy: { de: 'Ein Agent-Lauf ist aktiv. Der Zeitplan versucht es beim nächsten Termin erneut.', en: 'An agent run is active. The schedule will try again at its next time.' },
    backup_s3_virtual_host_tls_failed: { de: 'Der Endpoint unterstützt keine Bucket-Subdomain mit gültigem Zertifikat. Aktiviere Path-Style-Zugriff.', en: 'The endpoint does not support a bucket subdomain with a valid certificate. Enable path-style access.' },
    backup_s3_certificate_untrusted: { de: 'Das TLS-Zertifikat des S3-Endpoints wird vom Server nicht als vertrauenswürdig erkannt.', en: 'The S3 endpoint TLS certificate is not trusted by the server.' },
    backup_s3_access_denied: { de: 'Die Zugangsdaten haben keine Listenberechtigung für diesen Bucket.', en: 'The credentials do not have list permission for this bucket.' },
    backup_s3_credentials_invalid: { de: 'Access Key oder Secret Key sind ungültig.', en: 'The access key or secret key is invalid.' },
    backup_s3_bucket_not_found: { de: 'Der konfigurierte Bucket wurde nicht gefunden.', en: 'The configured bucket was not found.' },
    backup_s3_endpoint_unreachable: { de: 'Der S3-Endpoint ist vom Server aus nicht erreichbar.', en: 'The S3 endpoint cannot be reached from the server.' },
    backup_s3_connection_failed: { de: 'Die S3-Verbindung konnte nicht hergestellt werden.', en: 'The S3 connection could not be established.' },
  };
  return messages[code]?.[props.locale] ?? String(code).replaceAll('_', ' ');
}
</script>

<template>
  <section class="xl:col-span-2">
    <div class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div class="relative border-b border-zinc-200 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.18),transparent_42%)] px-5 py-5 dark:border-zinc-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_42%)] sm:px-6">
        <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">{{ copy.eyebrow }}</p>
        <div class="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div><h2 class="text-lg font-semibold tracking-tight">{{ copy.title }}</h2><p class="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">{{ copy.description }}</p></div>
          <div class="flex gap-2"><UButton color="neutral" variant="soft" icon="i-lucide-cloud-cog" @click="openDestination()">{{ copy.addDestination }}</UButton><UButton class="!bg-teal-700 !text-white hover:!bg-teal-800" icon="i-lucide-calendar-plus" :disabled="!destinations.length" @click="openSchedule()">{{ copy.addSchedule }}</UButton></div>
        </div>
      </div>

      <div class="grid lg:grid-cols-[1.25fr_0.75fr]">
        <div class="border-b border-zinc-200 p-5 dark:border-zinc-800 lg:border-b-0 lg:border-r sm:p-6">
          <div class="mb-4 flex items-center justify-between"><h3 class="text-sm font-semibold">{{ copy.schedules }}</h3><UBadge color="neutral" variant="soft">{{ schedules.length }}</UBadge></div>
          <USkeleton v-if="loading" class="h-28" />
          <div v-else-if="!schedules.length" class="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 px-5 text-center dark:border-zinc-700"><UIcon name="i-lucide-calendar-clock" class="mb-2 size-6 text-zinc-400" /><p class="text-sm text-zinc-500">{{ copy.noSchedules }}</p></div>
          <div v-else class="grid gap-3">
            <article v-for="schedule in schedules" :key="schedule.id" class="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h4 class="font-semibold">{{ schedule.name }}</h4><UBadge :color="schedule.enabled ? 'primary' : 'neutral'" :class="schedule.enabled ? '!bg-teal-100 !text-teal-800 dark:!bg-teal-950 dark:!text-teal-200' : ''" variant="soft" size="sm">{{ schedule.enabled ? copy.enabled : copy.disabled }}</UBadge><UBadge :color="statusColor(schedule.lastStatus)" variant="subtle" size="sm">{{ statusLabel(schedule.lastStatus) }}</UBadge></div><p class="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-300">{{ schedule.cronExpression }} <span class="font-sans text-zinc-500 dark:text-zinc-400">· {{ schedule.timezone }}</span></p></div>
                <div class="flex gap-1"><UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-play" :loading="busy && schedule.lastStatus === 'running'" :disabled="!schedule.enabled" :aria-label="copy.run" @click="runNow(schedule)" /><UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" :aria-label="copy.edit" @click="openSchedule(schedule)" /><UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="copy.remove" @click="removeSchedule(schedule)" /></div>
              </div>
              <div class="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3 dark:text-zinc-400"><span><strong class="block font-medium text-zinc-800 dark:text-zinc-200">{{ schedule.destinationName }}/{{ schedule.destinationDirectory }}</strong>{{ copy.destination }}</span><span><strong class="block font-medium text-zinc-800 dark:text-zinc-200">{{ date(schedule.nextRunAt) }}</strong>{{ copy.next }}</span><span><strong class="block font-medium text-zinc-800 dark:text-zinc-200">{{ retention(schedule) }}</strong>{{ copy.retentionDays }}</span></div>
              <p v-if="schedule.lastError" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{{ schedule.lastError.replaceAll('_', ' ') }}</p>
            </article>
          </div>
        </div>

        <div class="p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between"><h3 class="text-sm font-semibold">{{ copy.destinations }}</h3><UBadge color="neutral" variant="soft">{{ destinations.length }}</UBadge></div>
          <USkeleton v-if="loading" class="h-28" />
          <div v-else-if="!destinations.length" class="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 px-5 text-center dark:border-zinc-700"><UIcon name="i-lucide-cloud-off" class="mb-2 size-6 text-zinc-400" /><p class="text-sm text-zinc-500">{{ copy.noDestinations }}</p></div>
          <div v-else class="grid gap-2">
            <article v-for="item in destinations" :key="item.id" class="group flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"><UIcon name="i-lucide-hard-drive-upload" class="size-4" /></div>
              <div class="min-w-0 flex-1"><h4 class="truncate text-sm font-semibold">{{ item.name }}</h4><p class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ item.bucket }}/{{ item.prefix }} · {{ item.region }}</p></div>
              <UBadge :color="item.credentialsConfigured ? 'primary' : 'neutral'" :class="item.credentialsConfigured ? '!bg-teal-100 !text-teal-800 dark:!bg-teal-950 dark:!text-teal-200' : ''" variant="soft" size="sm" icon="i-lucide-key-round">{{ item.credentialsConfigured ? copy.credentials : 'IAM' }}</UBadge>
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" :aria-label="copy.edit" @click="openDestination(item)" /><UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="copy.remove" @click="removeDestination(item)" />
            </article>
          </div>
        </div>
      </div>
    </div>

    <UAlert v-if="errorMessage && !destinationModalOpen && !scheduleModalOpen" class="mt-3" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" />
    <UAlert v-if="successMessage && !destinationModalOpen" class="mt-3" color="success" variant="soft" icon="i-lucide-circle-check" :description="successMessage" />

    <UModal v-model:open="destinationModalOpen" :title="editingDestinationId ? copy.editDestination : copy.newDestination" :description="copy.destinationDescription" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form class="grid gap-4" @submit.prevent="saveDestination">
          <div class="grid gap-4 sm:grid-cols-2"><UFormField :label="copy.name" :description="copy.nameHint" required><UInput v-model="destinationForm.name" class="w-full" autofocus required /></UFormField><UFormField :label="copy.bucket" required><UInput v-model="destinationForm.bucket" class="w-full" required /></UFormField></div>
          <UFormField :label="copy.endpoint" :description="copy.endpointHint"><UInput v-model="destinationForm.endpoint" class="w-full" type="url" placeholder="https://s3.example.com" /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2"><UFormField :label="copy.region" required><UInput v-model="destinationForm.region" class="w-full" required /></UFormField><UFormField :label="copy.basePrefix" :description="copy.basePrefixHint"><UInput v-model="destinationForm.prefix" class="w-full" placeholder="agent-kanban" /></UFormField></div>
          <div class="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"><div class="grid gap-4 sm:grid-cols-2"><UFormField :label="copy.accessKey"><UInput v-model="destinationForm.accessKeyId" class="w-full" autocomplete="off" :placeholder="editingDestinationId ? '••••••••••••' : ''" /></UFormField><UFormField :label="copy.secretKey"><UInput v-model="destinationForm.secretAccessKey" class="w-full" type="password" autocomplete="new-password" :placeholder="editingDestinationId ? '••••••••••••' : ''" /></UFormField></div><p class="mt-2 text-xs text-zinc-500">{{ editingDestinationId ? copy.keepCredentials : copy.credentialsHint }}</p><USwitch v-if="editingDestinationId" v-model="destinationForm.clearCredentials" class="mt-3" :label="copy.clearCredentials" /></div>
          <div class="grid gap-4 sm:grid-cols-2"><UFormField :label="copy.encryption"><USelect v-model="destinationForm.serverSideEncryption" class="w-full" :items="encryptionItems" /></UFormField><UFormField v-if="destinationForm.serverSideEncryption === 'aws:kms'" :label="copy.kmsKey" required><UInput v-model="destinationForm.kmsKeyId" class="w-full" required /></UFormField></div>
          <USwitch v-model="destinationForm.forcePathStyle" :label="copy.pathStyle" :description="copy.pathStyleHint" />
          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" /><UAlert v-if="successMessage" color="success" variant="soft" icon="i-lucide-circle-check" :description="successMessage" />
          <div class="flex flex-wrap justify-between gap-2"><UButton type="button" color="neutral" variant="outline" icon="i-lucide-plug-zap" :loading="busy" @click="testDestination">{{ copy.test }}</UButton><div class="flex gap-2"><UButton type="button" color="neutral" variant="ghost" :disabled="busy" @click="destinationModalOpen = false">{{ copy.cancel }}</UButton><UButton class="!bg-teal-700 !text-white hover:!bg-teal-800" type="submit" icon="i-lucide-save" :loading="busy">{{ copy.save }}</UButton></div></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="scheduleModalOpen" :title="editingScheduleId ? copy.editSchedule : copy.newSchedule" :description="copy.scheduleDescription" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form class="grid gap-4" @submit.prevent="saveSchedule">
          <UFormField :label="copy.name" required><UInput v-model="scheduleForm.name" class="w-full" autofocus required /></UFormField>
          <UFormField :label="copy.cron" :description="copy.cronHint" required><UInput v-model="scheduleForm.cronExpression" class="w-full font-mono" placeholder="17 */12 * * *" required /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2"><UFormField :label="copy.timezone" required><USelectMenu v-model="scheduleForm.timezone" class="w-full" :items="timezoneItems" searchable required :aria-label="copy.timezone" /></UFormField><UFormField :label="copy.destination" required><USelect v-model="scheduleForm.destinationId" class="w-full" :items="destinationItems" required /></UFormField></div>
          <UFormField :label="copy.directory" :description="copy.directoryHint"><UInput v-model="scheduleForm.destinationDirectory" class="w-full" placeholder="daily" /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2"><UFormField :label="copy.retentionDays" :description="copy.retentionDaysHint" required><UInput v-model.number="scheduleForm.retentionDays" class="w-full" type="number" min="1" max="36500" required /></UFormField><UFormField :label="copy.retentionCount" :description="copy.retentionCountHint" required><UInput v-model.number="scheduleForm.retentionCount" class="w-full" type="number" min="1" max="10000" required /></UFormField></div>
          <USwitch v-model="scheduleForm.enabled" :label="copy.activeSchedule" />
          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" />
          <div class="flex justify-end gap-2"><UButton type="button" color="neutral" variant="ghost" :disabled="busy" @click="scheduleModalOpen = false">{{ copy.cancel }}</UButton><UButton class="!bg-teal-700 !text-white hover:!bg-teal-800" type="submit" icon="i-lucide-save" :loading="busy">{{ copy.save }}</UButton></div>
        </form>
      </template>
    </UModal>
  </section>
</template>
