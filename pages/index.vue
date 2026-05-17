<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

type Locale = 'en' | 'de';
type View = 'board' | 'projects' | 'users';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin';
}

interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  folderPath: string;
  createdAt?: string;
}

interface BoardColumn {
  id: string;
  key: string;
  nameEn: string;
  nameDe: string;
  position: number;
  done: boolean;
}

interface Swimlane {
  id: string;
  nameEn: string;
  nameDe: string;
  position: number;
}

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface Task {
  id: string;
  key: string;
  title: string;
  description: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  columnId: string;
  swimlaneId: string | null;
  assigneeId: string | null;
  agentStatus: 'idle' | 'queued' | 'running' | 'failed' | 'done';
  attachments: Attachment[];
}

interface Board {
  project: Project;
  columns: BoardColumn[];
  swimlanes: Swimlane[];
  members: User[];
  tasks: Task[];
}

const dictionary = {
  en: {
    app: 'Agent Kanban',
    subtitle: 'Local project control for Codex work',
    login: 'Sign in',
    email: 'Email',
    password: 'Password',
    logout: 'Sign out',
    projects: 'Projects',
    users: 'Users',
    admin: 'Admin',
    workspace: 'Workspace',
    createProject: 'Create project',
    createUser: 'Create user',
    projectDialog: 'Project control record',
    userDialog: 'Administrator account',
    taskDialog: 'Task intake',
    projectName: 'Project name',
    projectKey: 'Key',
    projectFolder: 'Filesystem folder',
    projectNameHelp: 'A readable name shown in the sidebar and board header.',
    projectKeyHelp: 'Short uppercase key used for task IDs, for example APP.',
    projectFolderHelp: 'Absolute or relative folder where Codex will work for this project.',
    description: 'Description',
    assignedUsers: 'Assigned users',
    newTask: 'New task',
    title: 'Title',
    area: 'Kanban area',
    assignee: 'Assignee',
    priority: 'Priority',
    files: 'Files',
    pasteHint: 'Paste screenshots into description or attach files.',
    createTask: 'Create task',
    refresh: 'Refresh',
    noProject: 'No project selected',
    folder: 'Folder',
    attachments: 'attachments',
    language: 'Language',
    userName: 'Name',
    columns: 'Areas',
    tasks: 'Tasks',
    members: 'Members',
    queueCodex: 'Queue Codex',
    emptyColumn: 'No tasks here',
    openBoard: 'Open board',
    projectTableHint: 'Manage filesystem-bound projects. Created projects appear in the sidebar immediately.',
    userTableHint: 'Create admin users who can access and manage projects.',
    primaryDetails: 'Primary details',
    placement: 'Board placement',
    evidence: 'Evidence and files',
    credentials: 'Credentials',
    cancel: 'Cancel',
    save: 'Save',
    create: 'Create',
    priorities: { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' },
  },
  de: {
    app: 'Agent Kanban',
    subtitle: 'Lokale Projektsteuerung fuer Codex-Arbeit',
    login: 'Anmelden',
    email: 'E-Mail',
    password: 'Passwort',
    logout: 'Abmelden',
    projects: 'Projekte',
    users: 'Benutzer',
    admin: 'Admin',
    workspace: 'Arbeitsbereich',
    createProject: 'Projekt erstellen',
    createUser: 'Benutzer erstellen',
    projectDialog: 'Projekt-Kontrolldatensatz',
    userDialog: 'Administratorkonto',
    taskDialog: 'Aufgabenannahme',
    projectName: 'Projektname',
    projectKey: 'Kuerzel',
    projectFolder: 'Dateisystem-Ordner',
    projectNameHelp: 'Lesbarer Name fuer Sidebar und Board-Kopf.',
    projectKeyHelp: 'Kurzes Grossbuchstaben-Kuerzel fuer Aufgaben-IDs, zum Beispiel APP.',
    projectFolderHelp: 'Absoluter oder relativer Ordner, in dem Codex fuer das Projekt arbeitet.',
    description: 'Beschreibung',
    assignedUsers: 'Zugewiesene Benutzer',
    newTask: 'Neue Aufgabe',
    title: 'Titel',
    area: 'Kanban-Bereich',
    assignee: 'Zuweisung',
    priority: 'Prioritaet',
    files: 'Dateien',
    pasteHint: 'Screenshots in die Beschreibung einfuegen oder Dateien anhaengen.',
    createTask: 'Aufgabe erstellen',
    refresh: 'Aktualisieren',
    noProject: 'Kein Projekt ausgewaehlt',
    folder: 'Ordner',
    attachments: 'Anhaenge',
    language: 'Sprache',
    userName: 'Name',
    columns: 'Bereiche',
    tasks: 'Aufgaben',
    members: 'Mitglieder',
    queueCodex: 'Codex starten',
    emptyColumn: 'Keine Aufgaben',
    openBoard: 'Board oeffnen',
    projectTableHint: 'Verwalte Projekte mit gebundenem Ordner. Neue Projekte erscheinen sofort links.',
    userTableHint: 'Erstelle Admin-Benutzer fuer Projektzugriff und Verwaltung.',
    primaryDetails: 'Kerndaten',
    placement: 'Board-Position',
    evidence: 'Nachweise und Dateien',
    credentials: 'Zugangsdaten',
    cancel: 'Abbrechen',
    save: 'Speichern',
    create: 'Erstellen',
    priorities: { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' },
  },
} as const;

const locale = ref<Locale>('en');
const activeView = ref<View>('board');
const user = ref<User | null>(null);
const users = ref<User[]>([]);
const projects = ref<Project[]>([]);
const selectedProjectId = ref<string | null>(null);
const board = ref<Board | null>(null);
const busy = ref(false);
const refreshingBoard = ref(false);
const errorMessage = ref<string | null>(null);
const draggedTaskId = ref<string | null>(null);
const projectModalOpen = ref(false);
const userModalOpen = ref(false);
const taskModalOpen = ref(false);
const taskSubmitting = ref(false);
const sidebarCollapsed = ref(false);
let boardRefreshTimer: ReturnType<typeof setInterval> | null = null;

const loginForm = reactive({ email: 'admin@example.com', password: 'adminadmin' });
const userForm = reactive({ name: '', email: '', password: '' });
const projectForm = reactive({ name: '', key: '', folderPath: '', description: '', userIds: [] as string[] });
const taskForm = reactive({
  title: '',
  description: '',
  columnId: '',
  swimlaneId: '',
  assigneeId: '',
  priority: 'normal' as Task['priority'],
});
const taskFiles = ref<File[]>([]);

const t = computed(() => dictionary[locale.value]);
const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value) ?? null);
const defaultSwimlaneId = computed(() => board.value?.swimlanes[0]?.id ?? '');
const boardStats = computed(() => ({
  tasks: board.value?.tasks.length ?? 0,
  columns: board.value?.columns.length ?? 0,
  members: board.value?.members.length ?? 0,
}));
const columnItems = computed(() => board.value?.columns.map((column) => ({
  label: columnName(column),
  value: column.id,
})) ?? []);
const assigneeItems = computed(() => [
  { label: t.value.assignee, value: '' },
  ...(board.value?.members.map((member) => ({ label: member.name, value: member.id })) ?? []),
]);
const priorityItems = computed(() => [
  { label: t.value.priorities.low, value: 'low' },
  { label: t.value.priorities.normal, value: 'normal' },
  { label: t.value.priorities.high, value: 'high' },
  { label: t.value.priorities.urgent, value: 'urgent' },
]);

const projectColumns: TableColumn<Project>[] = [
  { accessorKey: 'key', header: 'Key' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'folderPath', header: 'Folder' },
  { accessorKey: 'description', header: 'Description' },
];

const userColumns: TableColumn<User>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role' },
];

onMounted(async () => {
  locale.value = (localStorage.getItem('ak_locale') as Locale | null) ?? 'en';
  sidebarCollapsed.value = localStorage.getItem('ak_sidebar_collapsed') === 'true';
  selectedProjectId.value = localStorage.getItem('ak_project');
  await loadSession();
  startBoardRefresh();
});

watch(locale, (value) => localStorage.setItem('ak_locale', value));
watch(sidebarCollapsed, (value) => localStorage.setItem('ak_sidebar_collapsed', String(value)));
watch(selectedProjectId, async (value) => {
  if (value) localStorage.setItem('ak_project', value);
  if (value && user.value) await loadBoard(value);
});

onBeforeUnmount(() => {
  if (boardRefreshTimer) clearInterval(boardRefreshTimer);
});

const loadSession = async () => {
  const response = await $fetch<{ user: User | null }>('/api/auth/me');
  user.value = response.user;
  if (user.value) await loadAppData();
};

const loadAppData = async () => {
  busy.value = true;
  try {
    const [projectResponse, userResponse] = await Promise.all([
      $fetch<{ projects: Project[] }>('/api/projects'),
      $fetch<{ users: User[] }>('/api/users'),
    ]);
    projects.value = projectResponse.projects;
    users.value = userResponse.users;
    if (!selectedProjectId.value && projects.value[0]) selectedProjectId.value = projects.value[0].id;
    if (selectedProjectId.value) await loadBoard(selectedProjectId.value);
  } finally {
    busy.value = false;
  }
};

const loadBoard = async (projectId: string) => {
  board.value = await $fetch<Board>(`/api/projects/${projectId}/board`);
  const firstColumnId = board.value.columns[0]?.id ?? '';
  if (!board.value.columns.some((column) => column.id === taskForm.columnId)) taskForm.columnId = firstColumnId;
  taskForm.swimlaneId = taskForm.swimlaneId || defaultSwimlaneId.value;
};

const refreshCurrentBoard = async () => {
  if (!user.value || activeView.value !== 'board' || !selectedProjectId.value || refreshingBoard.value) return;
  refreshingBoard.value = true;
  try {
    await loadBoard(selectedProjectId.value);
  } finally {
    refreshingBoard.value = false;
  }
};

const startBoardRefresh = () => {
  if (boardRefreshTimer) clearInterval(boardRefreshTimer);
  boardRefreshTimer = setInterval(refreshCurrentBoard, 8000);
};

const selectProject = async (projectId: string) => {
  selectedProjectId.value = projectId;
  activeView.value = 'board';
};

const openProjectModal = () => {
  Object.assign(projectForm, { name: '', key: '', folderPath: '', description: '', userIds: [] });
  projectModalOpen.value = true;
};

const openUserModal = () => {
  Object.assign(userForm, { name: '', email: '', password: '' });
  userModalOpen.value = true;
};

const openTaskModal = (columnId?: string) => {
  Object.assign(taskForm, {
    title: '',
    description: '',
    columnId: columnId ?? board.value?.columns[0]?.id ?? '',
    swimlaneId: defaultSwimlaneId.value,
    assigneeId: '',
    priority: 'normal',
  });
  taskFiles.value = [];
  taskModalOpen.value = true;
};

const login = async () => {
  errorMessage.value = null;
  try {
    const response = await $fetch<{ user: User }>('/api/auth/login', { method: 'POST', body: loginForm });
    user.value = response.user;
    await loadAppData();
  } catch (error) {
    errorMessage.value = humanError(error);
  }
};

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' });
  user.value = null;
  board.value = null;
  projects.value = [];
};

const createUser = async () => {
  errorMessage.value = null;
  try {
    const response = await $fetch<{ users: User[] }>('/api/users', { method: 'POST', body: userForm });
    users.value = response.users;
    Object.assign(userForm, { name: '', email: '', password: '' });
    userModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  }
};

const createProjectAction = async () => {
  errorMessage.value = null;
  try {
    await $fetch('/api/projects', { method: 'POST', body: projectForm });
    Object.assign(projectForm, { name: '', key: '', folderPath: '', description: '', userIds: [] });
    await loadAppData();
    selectedProjectId.value = projects.value.at(-1)?.id ?? selectedProjectId.value;
    activeView.value = 'board';
    projectModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  }
};

const createTaskAction = async () => {
  if (!selectedProjectId.value || !taskForm.title.trim() || taskSubmitting.value) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  try {
    taskForm.swimlaneId = taskForm.swimlaneId || defaultSwimlaneId.value;
    const form = new FormData();
    for (const [key, value] of Object.entries(taskForm)) {
      if (value) form.append(key, value);
    }
    for (const file of taskFiles.value) form.append('files', file);
    await $fetch(`/api/projects/${selectedProjectId.value}/tasks`, { method: 'POST', body: form });
    taskModalOpen.value = false;
    await nextTick();
    Object.assign(taskForm, {
      title: '',
      description: '',
      columnId: board.value?.columns[0]?.id ?? '',
      swimlaneId: defaultSwimlaneId.value,
      assigneeId: '',
      priority: 'normal',
    });
    taskFiles.value = [];
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const moveTask = async (taskId: string, columnId: string) => {
  if (!selectedProjectId.value) return;
  await $fetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: { columnId, position: Date.now() } });
  await loadBoard(selectedProjectId.value);
};

const queueAgent = async (task: Task) => {
  if (!selectedProjectId.value) return;
  await $fetch(`/api/tasks/${task.id}`, { method: 'PATCH', body: { agentStatus: 'queued' } });
  await loadBoard(selectedProjectId.value);
};

const handlePaste = (event: ClipboardEvent) => {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) taskFiles.value = [...taskFiles.value, ...files];
};

const handleFileInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  taskFiles.value = [...taskFiles.value, ...(input.files ? [...input.files] : [])];
  input.value = '';
};

const columnName = (column: BoardColumn) => locale.value === 'de' ? column.nameDe : column.nameEn;
const taskAssignee = (task: Task) => board.value?.members.find((member) => member.id === task.assigneeId)?.name ?? '';
const tasksForColumn = (columnId: string) =>
  board.value?.tasks.filter((task) => task.columnId === columnId) ?? [];

const priorityColor = (priority: Task['priority']) => {
  if (priority === 'urgent') return 'error';
  if (priority === 'high') return 'warning';
  if (priority === 'low') return 'neutral';
  return 'info';
};

const agentColor = (status: Task['agentStatus']) => {
  if (status === 'failed') return 'error';
  if (status === 'running') return 'primary';
  if (status === 'queued') return 'warning';
  if (status === 'done') return 'success';
  return 'neutral';
};

const toggleLocale = () => {
  locale.value = locale.value === 'en' ? 'de' : 'en';
};

const humanError = (error: unknown) => {
  const candidate = error as { statusMessage?: string; data?: { message?: string } };
  return candidate.data?.message ?? candidate.statusMessage ?? 'Request failed';
};
</script>

<template>
  <div class="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 ak-grid-bg">
    <section v-if="!user" class="grid min-h-screen place-items-center px-6">
      <UCard class="w-full max-w-md border border-zinc-200/80 bg-white/90 shadow-2xl shadow-zinc-950/10 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <form class="space-y-5" @submit.prevent="login">
          <div class="space-y-2">
            <UBadge color="primary" variant="soft">Local Codex Workflow</UBadge>
            <h1 class="text-3xl font-semibold tracking-tight">{{ t.app }}</h1>
            <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ t.subtitle }}</p>
          </div>
          <UInput v-model="loginForm.email" :placeholder="t.email" type="email" icon="i-lucide-mail" size="lg" />
          <UInput v-model="loginForm.password" :placeholder="t.password" type="password" icon="i-lucide-lock" size="lg" />
          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-circle" :description="errorMessage" />
          <UButton block size="lg" type="submit" icon="i-lucide-log-in">{{ t.login }}</UButton>
        </form>
      </UCard>
    </section>

    <div v-else class="flex min-h-screen">
      <aside
        class="sticky top-0 flex h-screen shrink-0 flex-col border-r border-zinc-200/80 bg-white/90 shadow-xl shadow-zinc-950/5 backdrop-blur-xl transition-[width,padding] duration-200 dark:border-zinc-800 dark:bg-zinc-950/90"
        :class="sidebarCollapsed ? 'w-[76px] p-3' : 'w-[320px] p-4'"
      >
        <div class="mb-5 flex items-center gap-2">
          <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-600 text-white shadow-lg shadow-teal-600/25">
            <UIcon name="i-lucide-kanban-square" class="size-5" />
          </div>
          <div v-if="!sidebarCollapsed" class="min-w-0">
            <p class="text-sm font-semibold">{{ t.app }}</p>
            <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ user.email }}</p>
          </div>
          <UButton
            class="ml-auto"
            color="neutral"
            variant="ghost"
            size="sm"
            :icon="sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
            :aria-label="sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          />
        </div>

        <div class="mb-5 grid gap-2">
          <p v-if="!sidebarCollapsed" class="px-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.admin }}</p>
          <UButton
            :variant="activeView === 'projects' ? 'soft' : 'ghost'"
            color="neutral"
            icon="i-lucide-folder-cog"
            block
            :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
            @click="activeView = 'projects'"
          >
            <span v-if="!sidebarCollapsed">{{ t.projects }}</span>
          </UButton>
          <UButton
            :variant="activeView === 'users' ? 'soft' : 'ghost'"
            color="neutral"
            icon="i-lucide-users"
            block
            :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
            @click="activeView = 'users'"
          >
            <span v-if="!sidebarCollapsed">{{ t.users }}</span>
          </UButton>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <div v-if="!sidebarCollapsed" class="mb-2 flex items-center justify-between px-2">
            <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.workspace }}</p>
          </div>
          <div class="grid gap-2">
            <button
              v-for="project in projects"
              :key="project.id"
              class="group rounded-xl border text-left transition"
              :class="[
                project.id === selectedProjectId && activeView === 'board'
                  ? 'border-teal-500/50 bg-teal-50 shadow-lg shadow-teal-950/5 dark:bg-teal-950/30'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
                sidebarCollapsed ? 'grid h-11 place-items-center p-0' : 'p-3'
              ]"
              :title="project.name"
              @click="selectProject(project.id)"
            >
              <span v-if="sidebarCollapsed" class="text-xs font-bold text-teal-700 dark:text-teal-300">{{ project.key.slice(0, 2) }}</span>
              <template v-else>
                <div class="mb-2 flex items-center justify-between gap-3">
                  <UBadge color="primary" variant="subtle">{{ project.key }}</UBadge>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-zinc-400 transition group-hover:translate-x-0.5" />
                </div>
                <p class="font-medium leading-tight">{{ project.name }}</p>
                <p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{{ project.folderPath }}</p>
              </template>
            </button>
            <p v-if="!projects.length && !sidebarCollapsed" class="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {{ t.noProject }}
            </p>
          </div>
        </div>

        <div
          class="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          :class="sidebarCollapsed ? 'grid gap-2' : 'flex items-center gap-2'"
        >
          <UButton variant="soft" color="neutral" icon="i-lucide-globe-2" @click="toggleLocale">{{ locale.toUpperCase() }}</UButton>
          <UColorModeButton variant="soft" color="neutral" />
          <UButton :class="sidebarCollapsed ? '' : 'ml-auto'" variant="ghost" color="neutral" icon="i-lucide-log-out" @click="logout">
            <span v-if="!sidebarCollapsed">{{ t.logout }}</span>
          </UButton>
        </div>
      </aside>

      <main class="min-w-0 flex-1 p-4 lg:p-5">
        <header class="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 pb-3 dark:border-zinc-800">
          <div class="flex min-w-0 items-center gap-3">
            <UBadge variant="soft" color="neutral">{{ activeView === 'board' ? selectedProject?.key ?? t.workspace : t.admin }}</UBadge>
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold tracking-tight">
                {{ activeView === 'board' ? selectedProject?.name ?? t.noProject : activeView === 'projects' ? t.projects : t.users }}
              </h1>
              <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ activeView === 'board' ? selectedProject?.folderPath ?? t.subtitle : activeView === 'projects' ? t.projectTableHint : t.userTableHint }}
              </p>
            </div>
          </div>
          <div v-if="activeView === 'board'" class="flex flex-wrap gap-2">
            <UBadge color="neutral" variant="soft">{{ boardStats.columns }} {{ t.columns }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ boardStats.tasks }} {{ t.tasks }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ boardStats.members }} {{ t.members }}</UBadge>
          </div>
        </header>

        <UAlert v-if="errorMessage" class="mb-4" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" />

        <section v-if="activeView === 'projects'" class="grid gap-5">
          <UCard class="overflow-hidden">
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="font-semibold">{{ t.projects }}</h2>
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ projects.length }} total</p>
                </div>
                <UButton icon="i-lucide-folder-plus" size="lg" @click="openProjectModal">{{ t.createProject }}</UButton>
              </div>
            </template>
            <UTable :data="projects" :columns="projectColumns" class="max-h-[640px]" />
            <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <UButton
                v-for="project in projects"
                :key="project.id"
                color="neutral"
                variant="soft"
                icon="i-lucide-panel-left-open"
                @click="selectProject(project.id)"
              >
                {{ t.openBoard }}: {{ project.key }}
              </UButton>
            </div>
          </UCard>
        </section>

        <section v-else-if="activeView === 'users'" class="grid gap-5">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="font-semibold">{{ t.users }}</h2>
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ users.length }} total</p>
                </div>
                <UButton icon="i-lucide-user-plus" size="lg" @click="openUserModal">{{ t.createUser }}</UButton>
              </div>
            </template>
            <UTable :data="users" :columns="userColumns" />
          </UCard>
        </section>

        <section v-else-if="board">
          <div class="overflow-x-auto pb-2">
            <div class="grid min-w-[1180px] gap-4" :style="{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(260px, 1fr))` }">
              <section
                v-for="column in board.columns"
                :key="column.id"
                class="flex min-h-[calc(100vh-106px)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 shadow-xl shadow-zinc-950/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/75"
              >
                <header class="border-b border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold leading-tight">{{ columnName(column) }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ tasksForColumn(column.id).length }} {{ t.tasks }}</p>
                    </div>
                    <UBadge color="neutral" variant="soft">{{ tasksForColumn(column.id).length }}</UBadge>
                  </div>
                  <UButton
                    class="mt-4 w-full justify-center"
                    size="sm"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-plus"
                    @click="openTaskModal(column.id)"
                  >
                    {{ t.newTask }}
                  </UButton>
                </header>

                <div
                  class="flex-1 bg-zinc-50/55 p-3 dark:bg-zinc-900/30"
                  @dragover.prevent
                  @drop="draggedTaskId && moveTask(draggedTaskId, column.id)"
                >
                  <div class="grid gap-3">
                    <UCard
                      v-for="task in tasksForColumn(column.id)"
                      :key="task.id"
                      class="cursor-grab border-l-4"
                      :class="{
                        'border-l-red-500': task.priority === 'urgent',
                        'border-l-amber-500': task.priority === 'high',
                        'border-l-sky-500': task.priority === 'normal',
                        'border-l-zinc-400': task.priority === 'low',
                      }"
                      :ui="{ body: 'p-3 sm:p-3' }"
                      draggable="true"
                      @dragstart="draggedTaskId = task.id"
                      @dragend="draggedTaskId = null"
                    >
                      <div class="mb-2 flex items-start justify-between gap-2">
                        <UBadge variant="subtle" color="neutral">{{ task.key }}</UBadge>
                        <UButton size="xs" variant="soft" color="primary" icon="i-lucide-bot" @click="queueAgent(task)">
                          {{ t.queueCodex }}
                        </UButton>
                      </div>
                      <h3 class="text-sm font-semibold leading-snug">{{ task.title }}</h3>
                      <p v-if="task.description" class="mt-2 line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400">{{ task.description }}</p>
                      <div class="mt-3 flex flex-wrap gap-1.5">
                        <UBadge :color="priorityColor(task.priority)" variant="soft">{{ t.priorities[task.priority] }}</UBadge>
                        <UBadge :color="agentColor(task.agentStatus)" variant="subtle">{{ task.agentStatus }}</UBadge>
                        <UBadge v-if="taskAssignee(task)" color="neutral" variant="outline">{{ taskAssignee(task) }}</UBadge>
                        <UBadge v-if="task.attachments.length" color="neutral" variant="outline">{{ task.attachments.length }} {{ t.attachments }}</UBadge>
                      </div>
                    </UCard>
                    <p v-if="!tasksForColumn(column.id).length" class="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">
                      {{ t.emptyColumn }}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>

        <UCard v-else>
          <div class="grid place-items-center py-20 text-center">
            <UIcon name="i-lucide-folder-plus" class="mb-4 size-10 text-zinc-400" />
            <h2 class="text-lg font-semibold">{{ t.noProject }}</h2>
            <UButton class="mt-4" icon="i-lucide-folder-cog" @click="activeView = 'projects'">{{ t.createProject }}</UButton>
          </div>
        </UCard>
      </main>

      <UModal
        v-model:open="projectModalOpen"
        :title="t.createProject"
        :description="t.projectDialog"
        :ui="{ content: 'max-w-3xl', body: 'p-0 sm:p-0' }"
      >
        <template #body>
          <form class="grid gap-0" @submit.prevent="createProjectAction">
            <div class="border-b border-zinc-200 bg-zinc-50/80 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p class="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{{ t.projectDialog }}</p>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ t.projectTableHint }}</p>
            </div>

            <div class="grid gap-5 p-6">
              <UFormField :label="t.projectName" :description="t.projectNameHelp" required size="lg">
                <UInput v-model="projectForm.name" class="w-full" size="xl" icon="i-lucide-folder-plus" required />
              </UFormField>

              <UFormField :label="t.projectKey" :description="t.projectKeyHelp" required size="lg">
                <UInput v-model="projectForm.key" class="w-full" size="xl" icon="i-lucide-hash" required />
              </UFormField>

              <UFormField :label="t.projectFolder" :description="t.projectFolderHelp" required size="lg">
                <UInput v-model="projectForm.folderPath" class="w-full" size="xl" icon="i-lucide-hard-drive" required />
              </UFormField>

              <UFormField :label="t.description" size="lg">
                <UTextarea v-model="projectForm.description" class="w-full" :rows="4" size="xl" />
              </UFormField>

              <div class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div class="mb-3 flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold">{{ t.assignedUsers }}</p>
                    <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t.members }}</p>
                  </div>
                  <UBadge color="neutral" variant="soft">{{ users.length }}</UBadge>
                </div>
                <div class="grid gap-2">
                  <label
                    v-for="member in users"
                    :key="member.id"
                    class="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                  >
                    <input v-model="projectForm.userIds" type="checkbox" :value="member.id" class="size-4 accent-teal-600">
                    <span class="min-w-0">
                      <span class="block font-medium">{{ member.name }}</span>
                      <span class="block truncate text-xs text-zinc-500">{{ member.email }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <UButton color="neutral" variant="ghost" type="button" @click="projectModalOpen = false">{{ t.cancel }}</UButton>
              <UButton icon="i-lucide-plus" type="submit">{{ t.createProject }}</UButton>
            </div>
          </form>
        </template>
      </UModal>

      <UModal
        v-model:open="userModalOpen"
        :title="t.createUser"
        :description="t.userDialog"
        :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }"
      >
        <template #body>
          <form @submit.prevent="createUser">
            <div class="border-b border-zinc-200 bg-zinc-50/80 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p class="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{{ t.credentials }}</p>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ t.userTableHint }}</p>
            </div>
            <div class="grid gap-5 p-6">
              <UFormField :label="t.userName" required size="lg">
                <UInput v-model="userForm.name" class="w-full" size="xl" icon="i-lucide-user" required />
              </UFormField>
              <UFormField :label="t.email" required size="lg">
                <UInput v-model="userForm.email" class="w-full" size="xl" icon="i-lucide-mail" type="email" required />
              </UFormField>
              <UFormField :label="t.password" required size="lg" description="Minimum 8 characters.">
                <UInput v-model="userForm.password" class="w-full" size="xl" icon="i-lucide-lock" type="password" minlength="8" required />
              </UFormField>
            </div>
            <div class="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <UButton color="neutral" variant="ghost" type="button" @click="userModalOpen = false">{{ t.cancel }}</UButton>
              <UButton icon="i-lucide-user-plus" type="submit">{{ t.createUser }}</UButton>
            </div>
          </form>
        </template>
      </UModal>

      <UModal
        v-if="taskModalOpen"
        v-model:open="taskModalOpen"
        :title="t.createTask"
        :description="t.taskDialog"
        :ui="{ content: 'max-w-3xl', body: 'p-0 sm:p-0' }"
      >
        <template #body>
          <form @submit.prevent="createTaskAction">
            <div class="border-b border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p class="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{{ t.taskDialog }}</p>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ t.pasteHint }}</p>
            </div>
            <div class="grid gap-5 p-6">
              <UFormField :label="t.title" required size="lg">
                <UInput v-model="taskForm.title" class="w-full" size="xl" required />
              </UFormField>

              <UFormField :label="t.description" size="lg">
                <UTextarea v-model="taskForm.description" class="w-full" :rows="7" size="xl" @paste="handlePaste" />
              </UFormField>

              <UFormField :label="t.area" required size="lg">
                <USelect v-model="taskForm.columnId" class="w-full" :items="columnItems" size="xl" />
              </UFormField>

              <UFormField :label="t.assignee" size="lg">
                <USelect v-model="taskForm.assigneeId" class="w-full" :items="assigneeItems" size="xl" />
              </UFormField>

              <UFormField :label="t.priority" required size="lg">
                <USelect v-model="taskForm.priority" class="w-full" :items="priorityItems" size="xl" />
              </UFormField>

              <div class="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold">{{ t.evidence }}</p>
                    <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">{{ t.pasteHint }}</p>
                  </div>
                  <label class="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-950">
                    <UIcon name="i-lucide-paperclip" class="size-4" />
                    <span>{{ t.files }}</span>
                    <input type="file" multiple class="hidden" @change="handleFileInput">
                  </label>
                </div>
                <div class="min-h-12 rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  {{ taskFiles.length ? taskFiles.map((file) => file.name).join(', ') : t.pasteHint }}
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <UButton color="neutral" variant="ghost" type="button" @click="taskModalOpen = false">{{ t.cancel }}</UButton>
              <UButton icon="i-lucide-clipboard-plus" type="submit" :loading="taskSubmitting">{{ t.createTask }}</UButton>
            </div>
          </form>
        </template>
      </UModal>
    </div>
  </div>
</template>
