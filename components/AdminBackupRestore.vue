<script setup lang="ts">
interface BackupScope {
  users: number;
  projects: number;
  tasks: number;
  files: number;
  totalFileBytes: number;
}

interface BackupCapabilities {
  scope: BackupScope;
  s3: {
    configured: boolean;
    bucket: string | null;
    prefix: string | null;
    encrypted: boolean;
    retentionCount: number | null;
  };
}

interface ImportProject {
  id: string;
  key: string;
  name: string;
  folderPath: string;
  taskCount: number;
  fileCount: number;
  fileBytes: number;
  action: 'create' | 'replace';
  effectiveFolderPath: string;
  folderPathExists: boolean;
  blockedReason: string | null;
}

interface ImportPreview {
  importId: string;
  exportedAt: string;
  expiresAt: string;
  scope: BackupScope;
  projects: ImportProject[];
  users: Array<{ id: string; email: string; name: string; role: string; active: number }>;
  warnings: string[];
}

const props = defineProps<{ locale: 'en' | 'de' }>();

const copy = computed(() => props.locale === 'de' ? {
  title: 'Backup erstellen',
  backupDescription: 'Erstellt einen konsistenten Snapshot mit Datenbank und allen referenzierten Nutzdateien.',
  ready: 'Bereit',
  projects: 'Projekte',
  tasks: 'Tasks',
  users: 'Benutzer inklusive Rollen',
  files: 'Anhänge und Artefakte',
  safeScope: 'Worktrees, Agent-Sessions und Secrets ausgeschlossen',
  target: 'Ziel',
  download: 'Herunterladen',
  downloadHint: 'ZIP direkt im Browser speichern',
  s3: 'S3-Storage',
  s3Unavailable: 'Nicht konfiguriert',
  retention: '{count} Backups werden behalten',
  start: 'Backup starten',
  preparing: 'Snapshot und Dateien werden verpackt …',
  uploading: 'Backup wird zu S3 übertragen und Rotation angewendet …',
  downloaded: 'Backup wurde erfolgreich erstellt.',
  uploaded: 'In S3 gespeichert. {deleted} ältere Backups wurden entfernt.',
  importTitle: 'Backup importieren',
  importDescription: 'Das Paket wird zuerst vollständig geprüft. Bis zur Bestätigung werden keine Daten verändert.',
  chooseFile: 'Backup-Paket auswählen',
  dropHint: 'Agent-Kanban-ZIP, maximal gemäß Serverkonfiguration',
  checking: 'Backup wird geprüft …',
  valid: 'Paket geprüft',
  created: 'Erstellt',
  format: 'Format v1',
  content: 'Inhalt',
  action: 'Aktion',
  replace: 'Ersetzen',
  create: 'Neu anlegen',
  allUsers: 'Alle {count} Benutzerkonten werden unabhängig von der Projektauswahl übernommen. Aktive Sessions und API-Tokens werden ungültig.',
  selected: '{selected} von {total} Projekten ausgewählt',
  prepare: 'Import vorbereiten',
  warning: 'Die ausgewählten Projekte werden vollständig ersetzt. Vorher wird automatisch ein lokales Sicherheitsbackup erstellt.',
  confirmLabel: 'Zur Bestätigung IMPORT eingeben',
  cancel: 'Abbrechen',
  apply: 'Endgültig importieren',
  importing: 'Sicherheitsbackup und Import werden ausgeführt …',
  imported: 'Import erfolgreich. Die Anwendung wird für die Neuanmeldung aktualisiert …',
  folderLabel: 'Projektordner auf diesem Server',
  folderMissing: 'Der gespeicherte Projektordner existiert auf diesem Server nicht.',
  noProject: 'Wähle mindestens ein Projekt aus.',
  invalidFile: 'Bitte eine ZIP-Datei auswählen.',
} : {
  title: 'Create backup',
  backupDescription: 'Creates a consistent snapshot containing the database and all referenced user files.',
  ready: 'Ready',
  projects: 'Projects',
  tasks: 'Tasks',
  users: 'Users including roles',
  files: 'Attachments and artifacts',
  safeScope: 'Worktrees, agent sessions and secrets excluded',
  target: 'Destination',
  download: 'Download',
  downloadHint: 'Save the ZIP directly in your browser',
  s3: 'S3 storage',
  s3Unavailable: 'Not configured',
  retention: '{count} backups are retained',
  start: 'Start backup',
  preparing: 'Packaging snapshot and files …',
  uploading: 'Uploading to S3 and applying retention …',
  downloaded: 'Backup created successfully.',
  uploaded: 'Saved to S3. Removed {deleted} older backups.',
  importTitle: 'Import backup',
  importDescription: 'The package is fully validated first. No data changes until you confirm.',
  chooseFile: 'Choose backup package',
  dropHint: 'Agent Kanban ZIP, up to the configured server limit',
  checking: 'Validating backup …',
  valid: 'Package verified',
  created: 'Created',
  format: 'Format v1',
  content: 'Content',
  action: 'Action',
  replace: 'Replace',
  create: 'Create',
  allUsers: 'All {count} user accounts are imported regardless of project selection. Active sessions and API tokens become invalid.',
  selected: '{selected} of {total} projects selected',
  prepare: 'Prepare import',
  warning: 'Selected projects will be replaced completely. A local safety backup is created first.',
  confirmLabel: 'Type IMPORT to confirm',
  cancel: 'Cancel',
  apply: 'Import permanently',
  importing: 'Creating safety backup and importing …',
  imported: 'Import completed. Refreshing the app for sign-in …',
  folderLabel: 'Project folder on this server',
  folderMissing: 'The stored project folder does not exist on this server.',
  noProject: 'Select at least one project.',
  invalidFile: 'Choose a ZIP file.',
});

const capabilities = ref<BackupCapabilities | null>(null);
const destination = ref<'download' | 's3'>('download');
const backupBusy = ref(false);
const backupMessage = ref('');
const errorMessage = ref('');
const previewBusy = ref(false);
const importBusy = ref(false);
const preview = ref<ImportPreview | null>(null);
const selectedProjects = ref<string[]>([]);
const folderPaths = reactive<Record<string, string>>({});
const confirmationOpen = ref(false);
const confirmation = ref('');
const importMessage = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const allSelected = computed({
  get: () => Boolean(preview.value?.projects.length) && selectedProjects.value.length === preview.value?.projects.length,
  set: (checked: boolean) => {
    selectedProjects.value = checked ? preview.value?.projects.map((project) => project.id) ?? [] : [];
  },
});

const selectedLabel = computed(() => copy.value.selected
  .replace('{selected}', String(selectedProjects.value.length))
  .replace('{total}', String(preview.value?.projects.length ?? 0)));

onMounted(async () => {
  try {
    capabilities.value = await $fetch<BackupCapabilities>('/api/admin/backups/capabilities');
  } catch (error) {
    errorMessage.value = humanError(error);
  }
});

async function startBackup() {
  backupBusy.value = true;
  backupMessage.value = destination.value === 's3' ? copy.value.uploading : copy.value.preparing;
  errorMessage.value = '';
  try {
    if (destination.value === 's3') {
      const result = await $fetch<{ deletedBackups: number }>('/api/admin/backups/s3', { method: 'POST' });
      backupMessage.value = copy.value.uploaded.replace('{deleted}', String(result.deletedBackups));
    } else {
      const response = await fetch('/api/admin/backups/download', { credentials: 'same-origin' });
      if (!response.ok) throw await responseError(response);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = responseFileName(response.headers.get('content-disposition'));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      backupMessage.value = copy.value.downloaded;
    }
  } catch (error) {
    backupMessage.value = '';
    errorMessage.value = humanError(error);
  } finally {
    backupBusy.value = false;
  }
}

async function previewFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.name.toLowerCase().endsWith('.zip')) {
    errorMessage.value = copy.value.invalidFile;
    return;
  }
  await resetPreview(false);
  previewBusy.value = true;
  errorMessage.value = '';
  importMessage.value = '';
  try {
    preview.value = await uploadArchive(file);
    selectedProjects.value = preview.value.projects.map((project) => project.id);
    for (const project of preview.value.projects) folderPaths[project.id] = project.effectiveFolderPath;
  } catch (error) {
    errorMessage.value = humanError(error);
    input.value = '';
  } finally {
    previewBusy.value = false;
  }
}

function uploadArchive(file: File) {
  return new Promise<ImportPreview>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/admin/imports/preview');
    request.setRequestHeader('content-type', 'application/zip');
    request.responseType = 'json';
    request.onload = () => {
      const response = request.response as ImportPreview | { statusMessage?: string; message?: string } | null;
      if (request.status >= 200 && request.status < 300 && response) {
        resolve(response as ImportPreview);
      } else {
        reject({ statusMessage: response && 'statusMessage' in response ? response.statusMessage ?? response.message : `HTTP ${request.status}` });
      }
    };
    request.onerror = () => reject({ statusMessage: 'backup_upload_failed' });
    request.send(file);
  });
}

async function cancelPreview() {
  await resetPreview(true);
}

async function resetPreview(clearFileInput: boolean) {
  const importId = preview.value?.importId;
  preview.value = null;
  selectedProjects.value = [];
  confirmationOpen.value = false;
  confirmation.value = '';
  for (const key of Object.keys(folderPaths)) delete folderPaths[key];
  if (clearFileInput && fileInput.value) fileInput.value.value = '';
  if (importId) await $fetch(`/api/admin/imports/${importId}`, { method: 'DELETE' }).catch(() => undefined);
}

function prepareImport() {
  if (!selectedProjects.value.length) {
    errorMessage.value = copy.value.noProject;
    return;
  }
  errorMessage.value = '';
  confirmationOpen.value = true;
}

async function applyImport() {
  if (!preview.value || confirmation.value !== 'IMPORT') return;
  importBusy.value = true;
  errorMessage.value = '';
  importMessage.value = copy.value.importing;
  try {
    await $fetch(`/api/admin/imports/${preview.value.importId}/apply`, {
      method: 'POST',
      body: {
        projectIds: selectedProjects.value,
        folderPaths: Object.fromEntries(selectedProjects.value.map((id) => [id, folderPaths[id]])),
        confirmation: 'IMPORT',
      },
    });
    importMessage.value = copy.value.imported;
    setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    importMessage.value = '';
    errorMessage.value = humanError(error);
    importBusy.value = false;
  }
}

function toggleProject(projectId: string, checked: boolean) {
  selectedProjects.value = checked
    ? [...new Set([...selectedProjects.value, projectId])]
    : selectedProjects.value.filter((id) => id !== projectId);
  confirmationOpen.value = false;
  confirmation.value = '';
}

function bytes(value: number) {
  return new Intl.NumberFormat(props.locale === 'de' ? 'de-CH' : 'en', { style: 'unit', unit: value >= 1024 ** 2 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 })
    .format(value / (value >= 1024 ** 2 ? 1024 ** 2 : 1024));
}

function date(value: string) {
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-CH' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function humanError(error: unknown) {
  const code = (error as { data?: { statusMessage?: string }; statusMessage?: string })?.data?.statusMessage
    ?? (error as { statusMessage?: string })?.statusMessage
    ?? (error instanceof Error ? error.message : 'unknown_error');
  const messages: Record<string, { de: string; en: string }> = {
    backup_runtime_busy: { de: 'Ein Agent, Chat, Refinement oder E2E-Lauf ist noch aktiv. Bitte nach Abschluss erneut versuchen.', en: 'An agent, chat, refinement, or E2E run is active. Try again when it has finished.' },
    maintenance_busy: { de: 'Eine andere Backup- oder Importaktion läuft bereits.', en: 'Another backup or import operation is already running.' },
    backup_s3_not_configured: { de: 'S3 ist auf diesem Server nicht konfiguriert.', en: 'S3 is not configured on this server.' },
    backup_schema_incompatible: { de: 'Dieses Backup stammt von einer inkompatiblen Agent-Kanban-Version.', en: 'This backup was created by an incompatible Agent Kanban version.' },
    backup_file_checksum_invalid: { de: 'Eine Datei im Backup ist beschädigt oder wurde verändert.', en: 'A file in the backup is damaged or has been changed.' },
    import_project_folder_required: { de: 'Mindestens ein Projektordner existiert auf diesem Server nicht.', en: 'At least one project folder does not exist on this server.' },
    import_confirmation_required: { de: 'Die Importbestätigung fehlt.', en: 'Import confirmation is missing.' },
  };
  return messages[code]?.[props.locale] ?? code.replaceAll('_', ' ');
}

async function responseError(response: Response) {
  const data = await response.json().catch(() => ({})) as { statusMessage?: string };
  return new Error(data.statusMessage ?? `HTTP ${response.status}`);
}

function responseFileName(value: string | null) {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return 'agent-kanban-backup.zip';
}
</script>

<template>
  <div class="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.82fr)_minmax(520px,1.35fr)]">
    <UAlert v-if="errorMessage" class="xl:col-span-2" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" />

    <UCard class="overflow-hidden">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-semibold">{{ copy.title }}</h2>
          <UBadge color="primary" variant="soft">{{ copy.ready }}</UBadge>
        </div>
      </template>

      <p class="text-sm leading-6 text-zinc-500 dark:text-zinc-400">{{ copy.backupDescription }}</p>
      <div v-if="capabilities" class="mt-5 grid gap-3 text-sm">
        <div class="flex items-center gap-3"><UIcon name="i-lucide-folder-check" class="size-4 text-teal-600 dark:text-teal-300" /><span><strong>{{ capabilities.scope.projects }}</strong> {{ copy.projects }} · <strong>{{ capabilities.scope.tasks }}</strong> {{ copy.tasks }}</span></div>
        <div class="flex items-center gap-3"><UIcon name="i-lucide-users" class="size-4 text-teal-600 dark:text-teal-300" /><span><strong>{{ capabilities.scope.users }}</strong> {{ copy.users }}</span></div>
        <div class="flex items-center gap-3"><UIcon name="i-lucide-paperclip" class="size-4 text-teal-600 dark:text-teal-300" /><span><strong>{{ bytes(capabilities.scope.totalFileBytes) }}</strong> {{ copy.files }}</span></div>
        <div class="flex items-center gap-3"><UIcon name="i-lucide-shield-check" class="size-4 text-teal-600 dark:text-teal-300" /><span>{{ copy.safeScope }}</span></div>
      </div>
      <USkeleton v-else class="mt-5 h-28" />

      <fieldset class="mt-6 grid gap-2">
        <legend class="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">{{ copy.target }}</legend>
        <label class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition" :class="destination === 'download' ? 'border-teal-300 bg-teal-50/70 dark:border-teal-800 dark:bg-teal-950/35' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900'">
          <input v-model="destination" type="radio" value="download" class="accent-teal-600">
          <UIcon name="i-lucide-download" class="size-5 text-zinc-500" />
          <span><span class="block text-sm font-semibold">{{ copy.download }}</span><span class="block text-xs text-zinc-500 dark:text-zinc-400">{{ copy.downloadHint }}</span></span>
        </label>
        <label class="flex items-center gap-3 rounded-xl border p-3 transition" :class="[
          destination === 's3' ? 'border-teal-300 bg-teal-50/70 dark:border-teal-800 dark:bg-teal-950/35' : 'border-zinc-200 dark:border-zinc-800',
          capabilities?.s3.configured ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900' : 'cursor-not-allowed opacity-60',
        ]">
          <input v-model="destination" type="radio" value="s3" class="accent-teal-600" :disabled="!capabilities?.s3.configured">
          <UIcon name="i-lucide-cloud-upload" class="size-5 text-zinc-500" />
          <span class="min-w-0"><span class="block text-sm font-semibold">{{ copy.s3 }}</span><span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ capabilities?.s3.configured ? `${capabilities.s3.bucket}/${capabilities.s3.prefix}` : copy.s3Unavailable }}</span><span v-if="capabilities?.s3.retentionCount" class="block text-xs text-zinc-500 dark:text-zinc-400">{{ copy.retention.replace('{count}', String(capabilities.s3.retentionCount)) }}</span></span>
        </label>
      </fieldset>

      <UButton class="mt-5" block size="lg" icon="i-lucide-archive" :loading="backupBusy" :disabled="!capabilities" @click="startBackup">{{ copy.start }}</UButton>
      <p v-if="backupMessage" class="mt-3 text-center text-xs text-teal-700 dark:text-teal-300" aria-live="polite">{{ backupMessage }}</p>
    </UCard>

    <UCard class="overflow-hidden">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold">{{ copy.importTitle }}</h2>
          <UBadge v-if="preview" color="primary" variant="soft" icon="i-lucide-badge-check">{{ copy.valid }}</UBadge>
        </div>
      </template>

      <p class="text-sm leading-6 text-zinc-500 dark:text-zinc-400">{{ copy.importDescription }}</p>
      <label v-if="!preview" class="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 px-6 text-center transition hover:border-teal-400 hover:bg-teal-50/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-teal-700 dark:hover:bg-teal-950/20">
        <UIcon name="i-lucide-file-archive" class="mb-3 size-8 text-teal-600 dark:text-teal-300" />
        <span class="text-sm font-semibold">{{ previewBusy ? copy.checking : copy.chooseFile }}</span>
        <span class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ copy.dropHint }}</span>
        <input ref="fileInput" type="file" accept=".zip,application/zip" class="sr-only" :disabled="previewBusy" @change="previewFile">
      </label>

      <template v-else>
        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-900">
          <div class="flex min-w-0 items-center gap-3">
            <UIcon name="i-lucide-file-check-2" class="size-5 shrink-0 text-teal-600 dark:text-teal-300" />
            <span><span class="block text-sm font-semibold">agent-kanban-backup.zip</span><span class="block text-xs text-zinc-500 dark:text-zinc-400">{{ copy.created }} {{ date(preview.exportedAt) }} · {{ copy.format }}</span></span>
          </div>
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="copy.cancel" @click="cancelPreview" />
        </div>

        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span><strong class="text-zinc-900 dark:text-zinc-100">{{ preview.scope.projects }}</strong> {{ copy.projects }}</span>
          <span><strong class="text-zinc-900 dark:text-zinc-100">{{ preview.scope.tasks }}</strong> {{ copy.tasks }}</span>
          <span><strong class="text-zinc-900 dark:text-zinc-100">{{ preview.scope.users }}</strong> {{ copy.users }}</span>
          <span><strong class="text-zinc-900 dark:text-zinc-100">{{ bytes(preview.scope.totalFileBytes) }}</strong> {{ copy.files }}</span>
        </div>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[480px] text-left text-sm">
            <thead class="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr><th class="w-10 py-2"><input v-model="allSelected" type="checkbox" class="accent-teal-600" aria-label="Select all projects"></th><th class="py-2 font-medium">{{ copy.projects }}</th><th class="py-2 font-medium">{{ copy.content }}</th><th class="py-2 text-right font-medium">{{ copy.action }}</th></tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <template v-for="project in preview.projects" :key="project.id">
                <tr>
                  <td class="py-3"><input :checked="selectedProjects.includes(project.id)" type="checkbox" class="accent-teal-600" :aria-label="project.name" @change="toggleProject(project.id, ($event.target as HTMLInputElement).checked)"></td>
                  <td class="py-3"><span class="font-semibold">{{ project.name }}</span><UBadge class="ml-2" color="neutral" variant="soft" size="sm">{{ project.key }}</UBadge></td>
                  <td class="py-3 text-xs text-zinc-500 dark:text-zinc-400">{{ project.taskCount }} {{ copy.tasks }} · {{ bytes(project.fileBytes) }}</td>
                  <td class="py-3 text-right"><UBadge :color="project.action === 'replace' ? 'warning' : 'primary'" variant="soft">{{ project.action === 'replace' ? copy.replace : copy.create }}</UBadge></td>
                </tr>
                <tr v-if="selectedProjects.includes(project.id) && !project.folderPathExists">
                  <td></td>
                  <td colspan="3" class="pb-3">
                    <label class="block text-xs font-medium text-amber-700 dark:text-amber-300">{{ copy.folderMissing }}<span class="mt-2 block text-zinc-700 dark:text-zinc-200">{{ copy.folderLabel }}</span><UInput v-model="folderPaths[project.id]" class="mt-1 w-full" /></label>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex gap-3 rounded-xl bg-teal-50 px-4 py-3 text-xs leading-5 text-teal-900 dark:bg-teal-950/35 dark:text-teal-100">
          <UIcon name="i-lucide-users-round" class="mt-0.5 size-4 shrink-0" />
          <span>{{ copy.allUsers.replace('{count}', String(preview.users.length)) }}</span>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ selectedLabel }}</span>
          <UButton color="neutral" variant="soft" icon="i-lucide-shield-alert" @click="prepareImport">{{ copy.prepare }}</UButton>
        </div>

        <div v-if="confirmationOpen" class="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <p class="text-sm leading-6 text-red-800 dark:text-red-200"><strong>{{ copy.warning }}</strong></p>
          <label class="mt-3 block text-xs font-medium text-red-800 dark:text-red-200">{{ copy.confirmLabel }}<UInput v-model="confirmation" class="mt-1 w-full" autocomplete="off" spellcheck="false" /></label>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="importBusy" @click="confirmationOpen = false">{{ copy.cancel }}</UButton>
            <UButton color="error" icon="i-lucide-archive-restore" :loading="importBusy" :disabled="confirmation !== 'IMPORT'" @click="applyImport">{{ copy.apply }}</UButton>
          </div>
        </div>
        <p v-if="importMessage" class="mt-3 text-center text-xs text-teal-700 dark:text-teal-300" aria-live="polite">{{ importMessage }}</p>
      </template>
    </UCard>
  </div>
</template>
