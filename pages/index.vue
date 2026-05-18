<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

type Locale = 'en' | 'de';
type View = 'board' | 'projects' | 'users';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
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
  position: number;
  columnId: string;
  swimlaneId: string | null;
  assigneeId: string | null;
  agentStatus: 'idle' | 'queued' | 'running' | 'failed' | 'done';
  attachments: Attachment[];
}

interface TaskComment {
  id: string;
  userName: string;
  body: string;
  createdAt: string;
}

interface TaskEvent {
  id: string;
  action: string;
  metadata: string | null;
  createdAt: string;
}

type ActivityTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

interface ActivityItem {
  id: string;
  title: string;
  detail: string | null;
  badge: string;
  tone: ActivityTone;
  createdAt: string;
}

interface TaskDetail {
  task: Task;
  comments: TaskComment[];
  events: TaskEvent[];
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
    app: 'Work Board',
    subtitle: 'Projects, tasks, and reviews in one place',
    loginEyebrow: 'Private work board',
    loginHeadline: 'Sign in to your work board',
    loginCopy: 'Plan work, share context, and follow progress without switching tools.',
    loginStatus: 'Ready for work',
    loginStatusDetail: 'Your projects, tasks, files, and progress are available in one protected place.',
    login: 'Sign in',
    email: 'Email',
    password: 'Password',
    logout: 'Sign out',
    projects: 'Projects',
    users: 'Users',
    admin: 'Admin',
    workspace: 'Projects',
    createProject: 'Create project',
    createUser: 'Create user',
    projectDialog: 'Project details',
    userDialog: 'User details',
    taskDialog: 'Task details',
    projectName: 'Project name',
    projectKey: 'Short label',
    projectFolder: 'Project location',
    projectNameHelp: 'A readable name shown in the sidebar and board header.',
    projectKeyHelp: 'Short label shown on task cards, for example APP.',
    projectFolderHelp: "Where this project's files are stored.",
    description: 'Description',
    assignedUsers: 'Assigned users',
    newTask: 'New task',
    title: 'Title',
    area: 'Board area',
    assignee: 'Assignee',
    priority: 'Priority',
    files: 'Files',
    pasteHint: 'Paste screenshots into description or attach files.',
    createTask: 'Create task',
    editTask: 'Edit task',
    updateTask: 'Save task',
    deleteTask: 'Delete task',
    deleteTaskConfirm: 'Delete this task permanently?',
    deleteTaskWarning: 'This cannot be undone. Attachments and activity for this task will be removed with it.',
    editProject: 'Edit project',
    updateProject: 'Save project',
    role: 'Role',
    memberRole: 'Member',
    adminRole: 'Admin',
    activity: 'Progress',
    activityReadableHint: 'Important updates are shown in plain language.',
    hiddenActivityEvents: 'quiet updates hidden',
    guidance: 'Guidance',
    sendMessage: 'Send message',
    lockedTask: 'Work is in progress. Title and description are locked.',
    todoAutomationHint: 'Tasks moved here are processed from top to bottom.',
    activityTab: 'Progress',
    taskTab: 'Task brief',
    readonlyTask: 'This is the original task brief. It stays unchanged once work has started.',
    dropHere: 'Drop here',
    noGuidanceAfterFinish: 'Work is finished. New guidance is closed, but the progress history remains available.',
    refresh: 'Refresh',
    noProject: 'No project selected',
    folder: 'Location',
    attachments: 'attachments',
    language: 'Language',
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
    darkMode: 'Dark mode',
    lightMode: 'Light mode',
    userName: 'Name',
    columns: 'Areas',
    tasks: 'Tasks',
    members: 'Members',
    emptyColumn: 'No tasks here',
    openBoard: 'Open board',
    projectTableHint: 'Manage projects and access. New projects appear in the sidebar immediately.',
    userTableHint: 'Create users and manage who can access projects.',
    primaryDetails: 'Primary details',
    placement: 'Board area',
    evidence: 'Files and screenshots',
    credentials: 'Sign-in details',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    create: 'Create',
    total: 'total',
    priorities: { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' },
  },
  de: {
    app: 'Arbeitsboard',
    subtitle: 'Projekte, Aufgaben und Prüfungen an einem Ort',
    loginEyebrow: 'Privates Arbeitsboard',
    loginHeadline: 'Am Arbeitsboard anmelden',
    loginCopy: 'Plane Arbeit, teile Kontext und verfolge den Fortschritt ohne Werkzeugwechsel.',
    loginStatus: 'Bereit für die Arbeit',
    loginStatusDetail: 'Projekte, Aufgaben, Dateien und Fortschritt sind an einem geschützten Ort verfügbar.',
    login: 'Anmelden',
    email: 'E-Mail',
    password: 'Passwort',
    logout: 'Abmelden',
    projects: 'Projekte',
    users: 'Benutzer',
    admin: 'Admin',
    workspace: 'Projekte',
    createProject: 'Projekt erstellen',
    createUser: 'Benutzer erstellen',
    projectDialog: 'Projektdetails',
    userDialog: 'Benutzerdetails',
    taskDialog: 'Aufgabendetails',
    projectName: 'Projektname',
    projectKey: 'Kürzel',
    projectFolder: 'Projektablage',
    projectNameHelp: 'Lesbarer Name für Sidebar und Board-Kopf.',
    projectKeyHelp: 'Kurzes Kürzel auf Aufgabenkarten, zum Beispiel APP.',
    projectFolderHelp: 'Ort, an dem die Projektdateien gespeichert sind.',
    description: 'Beschreibung',
    assignedUsers: 'Zugewiesene Benutzer',
    newTask: 'Neue Aufgabe',
    title: 'Titel',
    area: 'Board-Bereich',
    assignee: 'Zuweisung',
    priority: 'Priorität',
    files: 'Dateien',
    pasteHint: 'Screenshots in die Beschreibung einfügen oder Dateien anhängen.',
    createTask: 'Aufgabe erstellen',
    editTask: 'Aufgabe bearbeiten',
    updateTask: 'Aufgabe speichern',
    deleteTask: 'Aufgabe löschen',
    deleteTaskConfirm: 'Diese Aufgabe dauerhaft löschen?',
    deleteTaskWarning: 'Das kann nicht rückgängig gemacht werden. Anhänge und Aktivitäten dieser Aufgabe werden mitgelöscht.',
    editProject: 'Projekt bearbeiten',
    updateProject: 'Projekt speichern',
    role: 'Rolle',
    memberRole: 'Mitglied',
    adminRole: 'Admin',
    activity: 'Fortschritt',
    activityReadableHint: 'Wichtige Schritte werden verständlich zusammengefasst.',
    hiddenActivityEvents: 'leise Aktualisierungen ausgeblendet',
    guidance: 'Hinweis',
    sendMessage: 'Nachricht senden',
    lockedTask: 'Die Aufgabe wird bearbeitet. Titel und Beschreibung sind gesperrt.',
    todoAutomationHint: 'Aufgaben, die hierher gezogen werden, werden von oben nach unten abgearbeitet.',
    activityTab: 'Fortschritt',
    taskTab: 'Auftrag',
    readonlyTask: 'Das ist der ursprüngliche Auftrag. Er bleibt unverändert, sobald die Bearbeitung begonnen hat.',
    dropHere: 'Hier ablegen',
    noGuidanceAfterFinish: 'Die Bearbeitung ist abgeschlossen. Neue Hinweise sind geschlossen, der Verlauf bleibt sichtbar.',
    refresh: 'Aktualisieren',
    noProject: 'Kein Projekt ausgewählt',
    folder: 'Ablage',
    attachments: 'Anhänge',
    language: 'Sprache',
    openSidebar: 'Sidebar öffnen',
    closeSidebar: 'Sidebar schließen',
    darkMode: 'Dunkelmodus',
    lightMode: 'Hellmodus',
    userName: 'Name',
    columns: 'Bereiche',
    tasks: 'Aufgaben',
    members: 'Mitglieder',
    emptyColumn: 'Keine Aufgaben',
    openBoard: 'Board öffnen',
    projectTableHint: 'Verwalte Projekte und Zugriffe. Neue Projekte erscheinen sofort links.',
    userTableHint: 'Erstelle Benutzer und verwalte, wer Zugriff auf Projekte hat.',
    primaryDetails: 'Kerndaten',
    placement: 'Board-Bereich',
    evidence: 'Dateien und Screenshots',
    credentials: 'Anmeldedaten',
    cancel: 'Abbrechen',
    close: 'Schließen',
    save: 'Speichern',
    create: 'Erstellen',
    total: 'gesamt',
    priorities: { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' },
  },
} as const;

const locale = ref<Locale>('en');
const colorMode = useColorMode();
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
const dragOverColumnId = ref<string | null>(null);
const dragOverTaskId = ref<string | null>(null);
const projectModalOpen = ref(false);
const userModalOpen = ref(false);
const taskModalOpen = ref(false);
const deleteTaskModalOpen = ref(false);
const taskSubmitting = ref(false);
const sidebarCollapsed = ref(false);
const editingProjectId = ref<string | null>(null);
const selectedTaskId = ref<string | null>(null);
const selectedTaskDetail = ref<TaskDetail | null>(null);
const taskMessage = ref('');
const activeTaskTab = ref<'activity' | 'task'>('activity');
let boardRefreshTimer: ReturnType<typeof setInterval> | null = null;
let taskEventSource: EventSource | null = null;

const loginForm = reactive({ email: '', password: '' });
const userForm = reactive({ name: '', email: '', password: '', role: 'member' as User['role'] });
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
const isDarkMode = computed(() => colorMode.value === 'dark');
const themeToggleLabel = computed(() => isDarkMode.value ? t.value.lightMode : t.value.darkMode);
const themeToggleIcon = computed(() => isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon');
const isAdmin = computed(() => user.value?.role === 'admin');
const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value) ?? null);
const defaultSwimlaneId = computed(() => board.value?.swimlanes[0]?.id ?? '');
const editingTask = computed(() => selectedTaskDetail.value?.task ?? null);
const taskLocked = computed(() => editingTask.value?.agentStatus === 'running');
const backlogColumn = computed(() => board.value?.columns.find((column) => column.key === 'backlog') ?? board.value?.columns[0] ?? null);
const hasAgentActivity = computed(() => {
  const status = editingTask.value?.agentStatus;
  if (status === 'running' || status === 'done' || status === 'failed') return true;
  return selectedTaskDetail.value?.events.some((event) => ['codex_started', 'codex_event', 'codex_completed', 'codex_failed'].includes(event.action)) ?? false;
});
const canSendGuidance = computed(() => editingTask.value?.agentStatus === 'running');
const taskTabs = computed(() => [
  { key: 'activity' as const, label: t.value.activityTab },
  { key: 'task' as const, label: t.value.taskTab },
]);
const readableActivityItems = computed(() => {
  return (selectedTaskDetail.value?.events ?? [])
    .map(formatActivityEvent)
    .filter((item): item is ActivityItem => item !== null);
});
const hiddenActivityCount = computed(() => Math.max(0, (selectedTaskDetail.value?.events.length ?? 0) - readableActivityItems.value.length));
const boardStats = computed(() => ({
  tasks: board.value?.tasks.length ?? 0,
  columns: board.value?.columns.length ?? 0,
  members: board.value?.members.length ?? 0,
}));
const columnItems = computed(() => board.value?.columns.map((column) => ({
  label: columnName(column),
  value: column.id,
})) ?? []);
const roleItems = computed(() => [
  { label: t.value.memberRole, value: 'member' },
  { label: t.value.adminRole, value: 'admin' },
]);
const userRows = computed(() => users.value.map((row) => ({
  ...row,
  roleLabel: row.role === 'admin' ? t.value.adminRole : t.value.memberRole,
})));

useHead(() => ({ title: t.value.app }));

const projectColumns = computed<TableColumn<Project>[]>(() => [
  { accessorKey: 'key', header: t.value.projectKey },
  { accessorKey: 'name', header: t.value.projectName },
  { accessorKey: 'description', header: t.value.description },
]);

const userColumns = computed<TableColumn<User & { roleLabel: string }>[]>(() => [
  { accessorKey: 'name', header: t.value.userName },
  { accessorKey: 'email', header: t.value.email },
  { accessorKey: 'roleLabel', header: t.value.role },
]);

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
watch(taskModalOpen, (open) => {
  if (!open) {
    closeTaskEventStream();
  }
});

onBeforeUnmount(() => {
  if (boardRefreshTimer) clearInterval(boardRefreshTimer);
  closeTaskEventStream();
});

const loadSession = async () => {
  const response = await $fetch<{ user: User | null }>('/api/auth/me');
  user.value = response.user;
  if (user.value) await loadAppData();
};

const loadAppData = async () => {
  busy.value = true;
  try {
    const projectResponse = await $fetch<{ projects: Project[] }>('/api/projects');
    projects.value = projectResponse.projects;
    if (isAdmin.value) {
      const userResponse = await $fetch<{ users: User[] }>('/api/users');
      users.value = userResponse.users;
    } else {
      users.value = user.value ? [user.value] : [];
    }
    if (selectedProjectId.value && !projects.value.some((project) => project.id === selectedProjectId.value)) {
      selectedProjectId.value = projects.value[0]?.id ?? null;
    }
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

const openProjectModal = async (project?: Project) => {
  editingProjectId.value = project?.id ?? null;
  Object.assign(projectForm, { name: '', key: '', folderPath: '', description: '', userIds: [] });
  if (project) {
    Object.assign(projectForm, {
      name: project.name,
      key: project.key,
      folderPath: project.folderPath,
      description: project.description ?? '',
      userIds: [],
    });
    const projectBoard = selectedProjectId.value === project.id && board.value
      ? board.value
      : await $fetch<Board>(`/api/projects/${project.id}/board`);
    projectForm.userIds = projectBoard.members.map((member) => member.id);
  }
  projectModalOpen.value = true;
};

const openUserModal = () => {
  Object.assign(userForm, { name: '', email: '', password: '', role: 'member' });
  userModalOpen.value = true;
};

const openTaskModal = (columnId?: string) => {
  closeTaskEventStream();
  selectedTaskId.value = null;
  selectedTaskDetail.value = null;
  taskMessage.value = '';
  activeTaskTab.value = 'task';
  Object.assign(taskForm, {
    title: '',
    description: '',
    columnId: columnId ?? backlogColumn.value?.id ?? '',
    swimlaneId: defaultSwimlaneId.value,
    assigneeId: '',
    priority: 'normal',
  });
  taskFiles.value = [];
  taskModalOpen.value = true;
};

const openTaskDetail = async (task: Task) => {
  closeTaskEventStream();
  selectedTaskId.value = task.id;
  taskFiles.value = [];
  taskMessage.value = '';
  selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${task.id}`);
  activeTaskTab.value = hasAgentActivity.value ? 'activity' : 'task';
  const detailTask = selectedTaskDetail.value.task;
  Object.assign(taskForm, {
    title: detailTask.title,
    description: detailTask.description ?? '',
    columnId: detailTask.columnId,
    swimlaneId: detailTask.swimlaneId ?? defaultSwimlaneId.value,
    assigneeId: '',
    priority: 'normal',
  });
  taskModalOpen.value = true;
  openTaskEventStream(task.id);
};

const closeTaskEventStream = () => {
  taskEventSource?.close();
  taskEventSource = null;
};

const openTaskEventStream = (taskId: string) => {
  closeTaskEventStream();
  if (!import.meta.client) return;
  taskEventSource = new EventSource(`/api/tasks/${taskId}/events`);
  taskEventSource.addEventListener('activity', async () => {
    if (selectedTaskId.value === taskId) {
      selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${taskId}`);
    }
  });
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
    Object.assign(userForm, { name: '', email: '', password: '', role: 'member' });
    userModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  }
};

const saveProjectAction = async () => {
  errorMessage.value = null;
  try {
    if (editingProjectId.value) {
      await $fetch(`/api/projects/${editingProjectId.value}`, { method: 'PATCH', body: projectForm });
    } else {
      await $fetch('/api/projects', { method: 'POST', body: projectForm });
    }
    Object.assign(projectForm, { name: '', key: '', folderPath: '', description: '', userIds: [] });
    const editedProjectId = editingProjectId.value;
    editingProjectId.value = null;
    await loadAppData();
    selectedProjectId.value = editedProjectId ?? projects.value.at(-1)?.id ?? selectedProjectId.value;
    activeView.value = 'board';
    projectModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  }
};

const saveTaskAction = async () => {
  if (!selectedProjectId.value || taskSubmitting.value) return;
  if (!selectedTaskId.value && !taskForm.title.trim()) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  try {
    if (selectedTaskId.value) {
      if (!hasAgentActivity.value) {
        await $fetch(`/api/tasks/${selectedTaskId.value}`, {
          method: 'PATCH',
          body: {
            title: taskForm.title,
            description: taskForm.description,
            columnId: taskForm.columnId,
          },
        });
      }
      if (taskFiles.value.length && (!hasAgentActivity.value || canSendGuidance.value)) {
        const attachmentForm = new FormData();
        for (const file of taskFiles.value) attachmentForm.append('files', file);
        await $fetch(`/api/tasks/${selectedTaskId.value}/attachments`, { method: 'POST', body: attachmentForm });
      }
      if (taskMessage.value.trim() && canSendGuidance.value) {
        await $fetch(`/api/tasks/${selectedTaskId.value}/messages`, { method: 'POST', body: { body: taskMessage.value } });
      }
      taskFiles.value = [];
      taskMessage.value = '';
      selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}`);
      await loadBoard(selectedProjectId.value);
    } else {
      taskForm.swimlaneId = taskForm.swimlaneId || defaultSwimlaneId.value;
      const form = new FormData();
      form.append('title', taskForm.title);
      if (taskForm.description) form.append('description', taskForm.description);
      if (taskForm.columnId) form.append('columnId', taskForm.columnId);
      if (taskForm.swimlaneId) form.append('swimlaneId', taskForm.swimlaneId);
      for (const file of taskFiles.value) form.append('files', file);
      await $fetch(`/api/projects/${selectedProjectId.value}/tasks`, { method: 'POST', body: form });
      taskModalOpen.value = false;
      await nextTick();
      Object.assign(taskForm, {
        title: '',
        description: '',
        columnId: backlogColumn.value?.id ?? '',
        swimlaneId: defaultSwimlaneId.value,
        assigneeId: '',
        priority: 'normal',
      });
      taskFiles.value = [];
      await loadBoard(selectedProjectId.value);
    }
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const requestDeleteTask = () => {
  if (!selectedTaskId.value || !selectedProjectId.value || taskSubmitting.value) return;
  deleteTaskModalOpen.value = true;
};

const confirmDeleteTaskAction = async () => {
  if (!selectedTaskId.value || !selectedProjectId.value || taskSubmitting.value) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  try {
    await $fetch(`/api/tasks/${selectedTaskId.value}`, { method: 'DELETE' });
    deleteTaskModalOpen.value = false;
    taskModalOpen.value = false;
    selectedTaskId.value = null;
    selectedTaskDetail.value = null;
    taskFiles.value = [];
    taskMessage.value = '';
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const moveTask = async (taskId: string, columnId: string, beforeTaskId?: string) => {
  if (!selectedProjectId.value) return;
  const targetTasks = tasksForColumn(columnId).filter((task) => task.id !== taskId);
  const beforeIndex = beforeTaskId ? targetTasks.findIndex((task) => task.id === beforeTaskId) : -1;
  const beforeTask = beforeIndex >= 0 ? targetTasks[beforeIndex] : undefined;
  const position = beforeTask
    ? Math.floor(((targetTasks[beforeIndex - 1]?.position ?? 0) + beforeTask.position) / 2)
    : ((targetTasks.at(-1)?.position ?? 0) + 1000);
  await $fetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: { columnId, position } });
  clearDragState();
  await loadBoard(selectedProjectId.value);
};

const markColumnDropTarget = (columnId: string) => {
  if (!draggedTaskId.value) return;
  dragOverColumnId.value = columnId;
  dragOverTaskId.value = null;
};

const markTaskDropTarget = (columnId: string, taskId: string) => {
  if (!draggedTaskId.value || draggedTaskId.value === taskId) return;
  dragOverColumnId.value = columnId;
  dragOverTaskId.value = taskId;
};

const clearDragState = () => {
  draggedTaskId.value = null;
  dragOverColumnId.value = null;
  dragOverTaskId.value = null;
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
const tasksForColumn = (columnId: string) =>
  [...(board.value?.tasks.filter((task) => task.columnId === columnId) ?? [])].sort((a, b) => a.position - b.position);

const agentColor = (status: Task['agentStatus']) => {
  if (status === 'failed') return 'error';
  if (status === 'running') return 'primary';
  if (status === 'queued') return 'warning';
  if (status === 'done') return 'success';
  return 'neutral';
};

const taskStatusLabel = (status: Task['agentStatus']) => {
  const labels: Record<Task['agentStatus'], { en: string; de: string }> = {
    idle: { en: 'Waiting', de: 'Wartet' },
    queued: { en: 'Ready', de: 'Vorgemerkt' },
    running: { en: 'In progress', de: 'In Bearbeitung' },
    failed: { en: 'Needs review', de: 'Prüfen' },
    done: { en: 'Ready for review', de: 'Bereit zur Prüfung' },
  };
  return labels[status][locale.value];
};

const projectSidebarText = (project: Project) => project.description?.trim() || t.value.openBoard;

const formatActivityEvent = (event: TaskEvent): ActivityItem | null => {
  const metadata = parseMetadata(event.metadata);
  const codexEvent = metadataString(metadata.event);
  const message = metadataString(metadata.message);
  const command = extractCommand(message);
  const label = (en: string, de: string) => locale.value === 'de' ? de : en;

  if (event.action === 'codex_event') {
    if (isLowSignalCodexEvent(codexEvent)) return null;
    if (codexEvent === 'item/started' && command) {
      return activityItem(event, label('Step started', 'Schritt gestartet'), label('A work step has started.', 'Ein Arbeitsschritt wurde gestartet.'), label('Step', 'Schritt'), 'info');
    }
    if (codexEvent === 'item/completed' && command) {
      return activityItem(event, label('Step finished', 'Schritt abgeschlossen'), label('A work step was completed.', 'Ein Arbeitsschritt wurde abgeschlossen.'), label('Step', 'Schritt'), 'success');
    }
    if (codexEvent === 'item/started' || codexEvent === 'item/completed') return null;
    if (codexEvent === 'turn/diff/updated') {
      return activityItem(event, label('Files updated', 'Dateien aktualisiert'), label('Changes were prepared for this task.', 'Änderungen wurden für diese Aufgabe vorbereitet.'), label('Change', 'Änderung'), 'warning');
    }
    if (codexEvent === 'turn/started' || codexEvent === 'session_started') {
      return activityItem(event, label('Work started', 'Bearbeitung gestartet'), friendlyDetail(message), label('Start', 'Start'), 'info');
    }
    if (codexEvent === 'turn/completed') {
      return activityItem(event, label('Work step finished', 'Bearbeitungsschritt abgeschlossen'), friendlyDetail(message), label('Step', 'Schritt'), 'success');
    }
    if (codexEvent === 'app_server_started') {
      return activityItem(event, label('Preparation started', 'Vorbereitung gestartet'), null, label('Start', 'Start'), 'neutral');
    }
    if (codexEvent?.includes('approval')) {
      return activityItem(event, label('Rule checked', 'Regel geprüft'), friendlyDetail(message), label('Check', 'Prüfung'), 'warning');
    }
    return activityItem(event, label('Progress update', 'Fortschritt aktualisiert'), friendlyDetail(message), label('Update', 'Aktualisierung'), 'neutral');
  }

  if (event.action === 'codex_started') {
    return activityItem(event, label('Work started', 'Bearbeitung gestartet'), label('The task is locked while work is in progress.', 'Die Aufgabe ist gesperrt, solange sie bearbeitet wird.'), label('Start', 'Start'), 'info');
  }
  if (event.action === 'codex_completed') {
    return activityItem(event, label('Ready for review', 'Bereit zur Prüfung'), label('The task was moved to review.', 'Die Aufgabe wurde in Prüfung verschoben.'), label('Done', 'Fertig'), 'success');
  }
  if (event.action === 'codex_failed') {
    return activityItem(event, label('Work needs review', 'Bearbeitung prüfen'), label('The task could not be completed automatically. Review the history or add a new note.', 'Die Aufgabe konnte nicht automatisch abgeschlossen werden. Prüfe den Verlauf oder ergänze einen neuen Hinweis.'), label('Review', 'Prüfen'), 'error');
  }
  if (event.action === 'codex_queued') {
    return activityItem(event, label('Ready to start', 'Zur Bearbeitung vorgemerkt'), label('The task will be handled in board order.', 'Die Aufgabe wird gemäß Board-Reihenfolge bearbeitet.'), label('Ready', 'Bereit'), 'warning');
  }
  if (event.action === 'steering_message') {
    return activityItem(event, label('Guidance sent', 'Hinweis gesendet'), metadataString(metadata.body), label('Input', 'Hinweis'), 'info');
  }
  if (event.action === 'task_created') {
    return activityItem(event, label('Task created', 'Aufgabe erstellt'), null, label('Task', 'Aufgabe'), 'neutral');
  }
  if (event.action === 'task_updated') {
    return activityItem(event, label('Task updated', 'Aufgabe aktualisiert'), metadata.columnChanged ? label('The board area or order changed.', 'Board-Bereich oder Reihenfolge wurde geändert.') : null, label('Task', 'Aufgabe'), 'neutral');
  }

  return activityItem(event, label('Progress update', 'Fortschritt aktualisiert'), friendlyDetail(message), label('Update', 'Aktualisierung'), 'neutral');
};

const activityItem = (event: TaskEvent, title: string, detail: string | null | undefined, badge: string, tone: ActivityTone): ActivityItem => ({
  id: event.id,
  title,
  detail: detail ? shorten(detail, 280) : null,
  badge,
  tone,
  createdAt: event.createdAt,
});

const parseMetadata = (metadata: string | null): Record<string, unknown> => {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const metadataString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

const isLowSignalCodexEvent = (event?: string | null) => {
  return !event
    || event === 'item/agentMessage/delta'
    || event === 'thread/tokenUsage/updated'
    || event === 'account/rateLimits/updated'
    || event === 'thread/status/changed'
    || event === 'mcpServer/startupStatus/updated';
};

const extractCommand = (message: string | null) => {
  const match = message?.match(/^item\/(?:started|completed):\s*(.+)$/);
  if (!match) return null;
  return cleanupCommand(match[1] ?? '');
};

const cleanupCommand = (command: string) => {
  let cleaned = command.trim().replace(/^\/bin\/bash -lc\s+/, '').trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");
};

const friendlyDetail = (message: string | null) => {
  if (!message || ['item/started', 'item/completed', 'turn/started', 'turn/completed', 'turn/diff/updated'].includes(message)) return null;
  const detail = message.includes(': ') ? message.split(': ').slice(1).join(': ') : message;
  return isInternalDetail(detail) ? null : detail;
};

const isInternalDetail = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return !normalized
    || normalized.startsWith('item/')
    || normalized.startsWith('turn/')
    || normalized.startsWith('thread/')
    || normalized.startsWith('account/')
    || normalized.startsWith('mcpserver/')
    || normalized.includes('/bin/bash')
    || normalized.includes('codex')
    || normalized.includes('nuxt')
    || normalized.includes('sqlite')
    || normalized.includes('drizzle')
    || normalized.includes('agent-browser')
    || normalized.includes('app-server')
    || normalized.includes('completion_gate')
    || normalized.includes('session_')
    || normalized.includes('approval_')
    || /^(bun|git|gh|node|npm|npx|pnpm|curl|rg)\s/.test(normalized);
};

const shorten = (value: string, maxLength: number) => value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;

const activityToneClass = (tone: ActivityTone) => ({
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100',
  error: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100',
  info: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-100',
  neutral: 'border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100',
}[tone]);

const activityDotClass = (tone: ActivityTone) => ({
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-sky-500',
  neutral: 'bg-zinc-400',
}[tone]);

const formatActivityTime = (value: string) => new Date(value).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const toggleLocale = () => {
  locale.value = locale.value === 'en' ? 'de' : 'en';
};

const toggleTheme = () => {
  colorMode.preference = isDarkMode.value ? 'light' : 'dark';
};

const humanError = (error: unknown) => {
  const candidate = error as { statusMessage?: string; data?: { message?: string } };
  const raw = candidate.data?.message ?? candidate.statusMessage ?? '';
  const key = raw.trim().toLowerCase();
  const label = (en: string, de: string) => locale.value === 'de' ? de : en;
  const messages: Record<string, { en: string; de: string }> = {
    invalid_credentials: { en: 'Email or password is incorrect.', de: 'E-Mail oder Passwort ist nicht korrekt.' },
    unauthorized: { en: 'Please sign in again.', de: 'Bitte melde dich erneut an.' },
    admin_required: { en: 'Only administrators can do this.', de: 'Nur Administratoren können das ausführen.' },
    project_not_found: { en: 'The project could not be found.', de: 'Das Projekt wurde nicht gefunden.' },
    project_forbidden: { en: 'You do not have access to this project.', de: 'Du hast keinen Zugriff auf dieses Projekt.' },
    task_not_found: { en: 'The task could not be found.', de: 'Die Aufgabe wurde nicht gefunden.' },
    task_locked_after_agent_start: { en: 'This task is already being worked on. Title and description cannot be changed anymore.', de: 'Diese Aufgabe wird bereits bearbeitet. Titel und Beschreibung können nicht mehr geändert werden.' },
    task_running_cannot_delete: { en: 'This task is in progress and cannot be deleted.', de: 'Diese Aufgabe wird gerade bearbeitet und kann nicht gelöscht werden.' },
    task_closed_for_attachments: { en: 'Files can no longer be added to this task.', de: 'Zu dieser Aufgabe können keine Dateien mehr hinzugefügt werden.' },
    task_not_accepting_steering: { en: 'This task is not accepting new guidance right now.', de: 'Diese Aufgabe nimmt im Moment keine neuen Hinweise an.' },
    empty_message: { en: 'Please enter a message.', de: 'Bitte gib eine Nachricht ein.' },
    missing_backlog_column: { en: 'The board is missing its first task area.', de: 'Dem Board fehlt der erste Aufgabenbereich.' },
    invalid_column: { en: 'Please choose a valid board area.', de: 'Bitte wähle einen gültigen Board-Bereich.' },
    invalid_project_key: { en: 'Please use a short project key with letters and numbers.', de: 'Bitte verwende ein kurzes Projektkürzel mit Buchstaben und Zahlen.' },
  };
  return messages[key]?.[locale.value] ?? label('The action could not be completed.', 'Die Aktion konnte nicht abgeschlossen werden.');
};
</script>

<template>
  <div class="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 ak-grid-bg">
    <section v-if="!user" class="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10 sm:px-6">
      <div class="absolute inset-0 ak-login-surface" />
      <div class="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/92 shadow-2xl shadow-zinc-950/12 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/92 lg:grid-cols-[1.05fr_0.95fr]">
        <div class="relative hidden min-h-[620px] overflow-hidden bg-zinc-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div class="absolute inset-0 ak-login-panel" />
          <div class="relative">
            <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium text-teal-100">
              <span class="size-2 rounded-full bg-teal-300 shadow-[0_0_18px_rgba(94,234,212,0.9)]" />
              {{ t.loginStatus }}
            </div>
            <h1 class="max-w-md text-4xl font-semibold leading-tight tracking-tight">{{ t.app }}</h1>
            <p class="mt-4 max-w-md text-sm leading-6 text-zinc-300">{{ t.loginCopy }}</p>
          </div>
          <div class="relative grid gap-3 rounded-2xl border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/30">
            <div class="grid grid-cols-3 gap-2">
              <div class="h-28 rounded-xl border border-white/10 bg-white/10 p-2">
                <div class="mb-2 h-2 w-14 rounded-full bg-teal-300/80" />
                <div class="space-y-1.5">
                  <div class="h-8 rounded-lg bg-white/12" />
                  <div class="h-8 rounded-lg bg-white/8" />
                </div>
              </div>
              <div class="h-28 rounded-xl border border-white/10 bg-white/10 p-2">
                <div class="mb-2 h-2 w-16 rounded-full bg-amber-300/80" />
                <div class="space-y-1.5">
                  <div class="h-8 rounded-lg bg-white/14" />
                  <div class="h-8 rounded-lg bg-white/8" />
                </div>
              </div>
              <div class="h-28 rounded-xl border border-white/10 bg-white/10 p-2">
                <div class="mb-2 h-2 w-12 rounded-full bg-emerald-300/80" />
                <div class="space-y-1.5">
                  <div class="h-8 rounded-lg bg-white/12" />
                  <div class="h-8 rounded-lg bg-white/8" />
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <UIcon name="i-lucide-shield-check" class="size-5 text-teal-200" />
              <p class="text-sm leading-5 text-zinc-200">{{ t.loginStatusDetail }}</p>
            </div>
          </div>
        </div>

        <form class="grid gap-6 p-6 sm:p-10 lg:p-12" @submit.prevent="login">
          <div class="space-y-3">
            <UBadge color="primary" variant="soft">{{ t.loginEyebrow }}</UBadge>
            <div>
              <h1 class="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{{ t.loginHeadline }}</h1>
              <p class="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{{ t.subtitle }}</p>
            </div>
          </div>

          <div class="grid gap-4">
            <UFormField :label="t.email" required size="lg">
              <UInput v-model="loginForm.email" class="w-full" type="email" icon="i-lucide-mail" size="xl" autocomplete="email" required />
            </UFormField>
            <UFormField :label="t.password" required size="lg">
              <UInput v-model="loginForm.password" class="w-full" type="password" icon="i-lucide-lock" size="xl" autocomplete="current-password" required />
            </UFormField>
          </div>

          <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-circle" :description="errorMessage" />
          <UButton block size="xl" type="submit" icon="i-lucide-log-in">{{ t.login }}</UButton>
        </form>
      </div>
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
            :aria-label="sidebarCollapsed ? t.openSidebar : t.closeSidebar"
            @click="sidebarCollapsed = !sidebarCollapsed"
          />
        </div>

        <div v-if="isAdmin" class="mb-5 grid gap-2">
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
                <p class="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{{ projectSidebarText(project) }}</p>
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
          <UButton
            variant="soft"
            color="neutral"
            icon="i-lucide-globe-2"
            :class="sidebarCollapsed ? 'w-full justify-center px-0' : ''"
            @click="toggleLocale"
          >
            <span v-if="!sidebarCollapsed">{{ locale.toUpperCase() }}</span>
          </UButton>
          <UButton
            variant="soft"
            color="neutral"
            :icon="themeToggleIcon"
            :aria-label="themeToggleLabel"
            :class="sidebarCollapsed ? 'w-full justify-center px-0' : ''"
            @click="toggleTheme"
          >
            <span v-if="!sidebarCollapsed">{{ themeToggleLabel }}</span>
          </UButton>
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
                {{ activeView === 'board' ? selectedProject?.description || t.subtitle : activeView === 'projects' ? t.projectTableHint : t.userTableHint }}
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
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ projects.length }} {{ t.total }}</p>
                </div>
                <UButton icon="i-lucide-folder-plus" size="lg" @click="openProjectModal()">{{ t.createProject }}</UButton>
              </div>
            </template>
            <UTable :data="projects" :columns="projectColumns" class="max-h-[640px]" />
            <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="project in projects"
                :key="project.id"
                class="flex gap-2"
              >
                <UButton
                  class="min-w-0 flex-1 justify-start"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-panel-left-open"
                  @click="selectProject(project.id)"
                >
                  {{ t.openBoard }}: {{ project.key }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-pencil"
                  @click="openProjectModal(project)"
                >
                  {{ t.editProject }}
                </UButton>
              </div>
            </div>
          </UCard>
        </section>

        <section v-else-if="activeView === 'users'" class="grid gap-5">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="font-semibold">{{ t.users }}</h2>
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ users.length }} {{ t.total }}</p>
                </div>
                <UButton icon="i-lucide-user-plus" size="lg" @click="openUserModal">{{ t.createUser }}</UButton>
              </div>
            </template>
            <UTable :data="userRows" :columns="userColumns" />
          </UCard>
        </section>

        <section v-else-if="board">
          <div class="overflow-x-auto pb-2">
            <div class="grid min-w-[1180px] gap-4" :style="{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(260px, 1fr))` }">
              <section
                v-for="column in board.columns"
                :key="column.id"
                :data-column-id="column.id"
                :data-column-key="column.key"
                class="flex min-h-[calc(100vh-106px)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 shadow-xl shadow-zinc-950/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/75"
              >
                <header class="border-b border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold leading-tight">{{ columnName(column) }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ tasksForColumn(column.id).length }} {{ t.tasks }}</p>
                      <p v-if="column.key === 'todo'" class="mt-2 text-xs leading-snug text-amber-700 dark:text-amber-300">
                        {{ t.todoAutomationHint }}
                      </p>
                    </div>
                    <UBadge color="neutral" variant="soft">{{ tasksForColumn(column.id).length }}</UBadge>
                  </div>
                  <UButton
                    v-if="column.key === 'backlog'"
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
                  :data-drop-column-id="column.id"
                  :data-drop-column-key="column.key"
                  class="flex-1 bg-zinc-50/55 p-3 dark:bg-zinc-900/30"
                  @dragover.prevent="markColumnDropTarget(column.id)"
                  @dragenter.prevent="markColumnDropTarget(column.id)"
                  @dragleave.self="dragOverColumnId = null"
                  @drop="draggedTaskId && moveTask(draggedTaskId, column.id)"
                >
                  <div class="grid gap-3">
                    <template
                      v-for="task in tasksForColumn(column.id)"
                      :key="task.id"
                    >
                      <div
                        v-if="draggedTaskId && dragOverTaskId === task.id"
                        class="flex h-9 items-center justify-center rounded-lg border-2 border-dashed border-teal-500 bg-teal-50 text-xs font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-200"
                      >
                        {{ t.dropHere }}
                      </div>
                      <UCard
                        :data-task-id="task.id"
                        :data-task-key="task.key"
                        class="cursor-pointer border-l-4 border-l-teal-500"
                        :class="{
                          'opacity-80 ring-1 ring-amber-300 dark:ring-amber-700': task.agentStatus === 'running',
                        }"
                        :ui="{ body: 'p-3 sm:p-3' }"
                        draggable="true"
                        @click="openTaskDetail(task)"
                        @dragover.prevent.stop="markTaskDropTarget(column.id, task.id)"
                        @dragenter.prevent.stop="markTaskDropTarget(column.id, task.id)"
                        @dragstart="draggedTaskId = task.id"
                        @dragend="clearDragState"
                        @drop.stop.prevent="draggedTaskId && moveTask(draggedTaskId, column.id, task.id)"
                      >
                        <div class="mb-2 flex items-start justify-between gap-2">
                          <UBadge variant="subtle" color="neutral">{{ task.key }}</UBadge>
                          <UBadge :color="agentColor(task.agentStatus)" variant="subtle">{{ taskStatusLabel(task.agentStatus) }}</UBadge>
                        </div>
                        <h3 class="text-sm font-semibold leading-snug">{{ task.title }}</h3>
                        <p v-if="task.description" class="mt-2 line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400">{{ task.description }}</p>
                        <div class="mt-3 flex flex-wrap gap-1.5">
                          <UBadge v-if="task.attachments.length" color="neutral" variant="outline">{{ task.attachments.length }} {{ t.attachments }}</UBadge>
                        </div>
                      </UCard>
                    </template>
                    <div
                      v-if="draggedTaskId && dragOverColumnId === column.id && !dragOverTaskId"
                      class="flex h-10 items-center justify-center rounded-lg border-2 border-dashed border-teal-500 bg-teal-50 text-xs font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-200"
                    >
                      {{ t.dropHere }}
                    </div>
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
            <UButton v-if="isAdmin" class="mt-4" icon="i-lucide-folder-cog" @click="activeView = 'projects'">{{ t.createProject }}</UButton>
          </div>
        </UCard>
      </main>

      <UModal
        v-model:open="projectModalOpen"
        :title="editingProjectId ? t.editProject : t.createProject"
        :description="t.projectDialog"
        :ui="{ content: 'max-w-3xl', body: 'p-0 sm:p-0' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <form class="grid gap-0" @submit.prevent="saveProjectAction">
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
                <UInput v-model="projectForm.folderPath" class="w-full" size="xl" icon="i-lucide-folder-open" required />
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
              <UButton icon="i-lucide-plus" type="submit">{{ editingProjectId ? t.updateProject : t.createProject }}</UButton>
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
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
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
              <UFormField :label="t.role" required size="lg">
                <USelect v-model="userForm.role" class="w-full" :items="roleItems" size="xl" />
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
        :title="selectedTaskId ? t.editTask : t.createTask"
        :description="t.taskDialog"
        :ui="{ content: 'max-w-4xl', body: 'p-0 sm:p-0 overflow-y-auto', footer: 'justify-end border-t border-zinc-200 bg-zinc-50/95 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/90' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <form id="task-form" @submit.prevent="saveTaskAction">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div>
                <p class="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{{ selectedTaskDetail?.task.key ?? t.taskDialog }}</p>
                <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ selectedTaskId && selectedTaskDetail ? taskStatusLabel(selectedTaskDetail.task.agentStatus) : t.pasteHint }}</p>
              </div>
              <UFormField :label="t.area" required size="sm">
                <USelect v-model="taskForm.columnId" class="w-56 max-w-full" :items="columnItems" size="lg" :disabled="!selectedTaskId || hasAgentActivity" />
              </UFormField>
            </div>

            <div v-if="hasAgentActivity" class="grid gap-5 p-6">
              <div class="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
                <button
                  v-for="tab in taskTabs"
                  :key="tab.key"
                  type="button"
                  class="rounded-md px-3 py-2 text-sm font-medium transition"
                  :class="activeTaskTab === tab.key ? 'bg-teal-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50'"
                  @click="activeTaskTab = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>

              <section v-if="activeTaskTab === 'activity'" class="grid gap-4">
                <UAlert v-if="taskLocked" color="warning" variant="soft" icon="i-lucide-lock" :description="t.lockedTask" />
                <UAlert v-else color="neutral" variant="soft" icon="i-lucide-lock" :description="t.noGuidanceAfterFinish" />

                <div v-if="canSendGuidance" class="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <UFormField :label="t.guidance" size="lg">
                    <UTextarea v-model="taskMessage" class="w-full" :rows="3" size="lg" @paste="handlePaste" />
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

                <div class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">{{ t.activity }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ t.activityReadableHint }}</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge color="primary" variant="soft">{{ readableActivityItems.length }}</UBadge>
                      <UBadge v-if="hiddenActivityCount" color="neutral" variant="soft">{{ hiddenActivityCount }} {{ t.hiddenActivityEvents }}</UBadge>
                    </div>
                  </div>
                  <div class="pr-1">
                    <ol class="relative space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
                      <li
                        v-for="item in readableActivityItems"
                        :key="item.id"
                        class="relative"
                      >
                        <span
                          class="absolute -left-[21px] top-3 size-2.5 rounded-full ring-4 ring-white dark:ring-zinc-950"
                          :class="activityDotClass(item.tone)"
                        />
                        <div class="rounded-xl border p-3 shadow-sm" :class="activityToneClass(item.tone)">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <div class="flex min-w-0 items-center gap-2">
                              <UBadge color="neutral" variant="subtle">{{ item.badge }}</UBadge>
                              <p class="min-w-0 truncate text-sm font-semibold">{{ item.title }}</p>
                            </div>
                            <time class="shrink-0 text-xs opacity-65">{{ formatActivityTime(item.createdAt) }}</time>
                          </div>
                          <p v-if="item.detail" class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 opacity-80">{{ item.detail }}</p>
                        </div>
                      </li>
                    </ol>
                  </div>
                </div>
              </section>

              <section v-else class="grid gap-4">
                <UAlert color="neutral" variant="soft" icon="i-lucide-file-text" :description="t.readonlyTask" />
                <div class="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div>
                    <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.title }}</p>
                    <p class="mt-1 text-base font-semibold">{{ taskForm.title }}</p>
                  </div>
                  <div>
                    <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.description }}</p>
                    <p class="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{{ taskForm.description || '-' }}</p>
                  </div>
                  <div>
                    <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.files }}</p>
                    <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{{ editingTask?.attachments.length ?? 0 }} {{ t.attachments }}</p>
                  </div>
                </div>
              </section>
            </div>

            <div v-else class="grid gap-5 p-6">
              <UFormField :label="t.title" required size="lg">
                <UInput v-model="taskForm.title" class="w-full" size="xl" required />
              </UFormField>

              <UFormField :label="t.description" size="lg">
                <UTextarea v-model="taskForm.description" class="w-full" :rows="7" size="xl" @paste="handlePaste" />
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
          </form>
        </template>
        <template #footer>
          <UButton
            v-if="selectedTaskId && editingTask?.agentStatus !== 'running'"
            class="mr-auto"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            type="button"
            :loading="taskSubmitting"
            @click.prevent.stop="requestDeleteTask"
          >
            {{ t.deleteTask }}
          </UButton>
          <UButton color="neutral" variant="ghost" type="button" @click="taskModalOpen = false">{{ t.cancel }}</UButton>
          <UButton
            v-if="!hasAgentActivity || canSendGuidance"
            icon="i-lucide-clipboard-plus"
            type="submit"
            form="task-form"
            :loading="taskSubmitting"
          >
            {{ canSendGuidance ? t.sendMessage : selectedTaskId ? t.updateTask : t.createTask }}
          </UButton>
        </template>
      </UModal>

      <UModal
        v-if="deleteTaskModalOpen"
        v-model:open="deleteTaskModalOpen"
        :title="t.deleteTask"
        :description="t.deleteTaskConfirm"
        :ui="{ content: 'max-w-md' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <div class="grid gap-5">
            <div class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
              <UIcon name="i-lucide-trash-2" class="mt-0.5 size-5 shrink-0" />
              <p class="text-sm leading-6">{{ t.deleteTaskWarning }}</p>
            </div>
            <div class="flex justify-end gap-3">
              <UButton color="neutral" variant="ghost" type="button" @click="deleteTaskModalOpen = false">{{ t.cancel }}</UButton>
              <UButton color="error" icon="i-lucide-trash-2" type="button" :loading="taskSubmitting" @click="confirmDeleteTaskAction">
                {{ t.deleteTask }}
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </div>
  </div>
</template>
