<script setup lang="ts">
import type { EditorToolbarItem, TableColumn } from '@nuxt/ui';

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

interface Oberthema {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
}

interface Unterthema {
  id: string;
  oberthemaId: string;
  name: string;
  description: string | null;
  position: number;
}

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  annotatedUrl: string | null;
  annotation: {
    data: string;
    updatedAt: string;
  } | null;
}

interface Task {
  id: string;
  key: string;
  title: string;
  description: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  position: number;
  columnId: string;
  oberthemaId: string;
  unterthemaId: string | null;
  swimlaneId: string | null;
  assigneeId: string | null;
  agentEnabled: boolean;
  agentStatus: 'idle' | 'queued' | 'running' | 'failed' | 'done';
  attachments: Attachment[];
  tags: string[];
  updatedAt: string;
}

interface TaskComment {
  id: string;
  userName: string;
  kind: 'comment' | 'steering';
  body: string;
  createdAt: string;
}

interface TaskEvent {
  id: string;
  action: string;
  metadata: string | null;
  createdAt: string;
}

interface TaskDetail {
  projectTags: string[];
  hierarchy: { oberthema: Oberthema; unterthema: Unterthema | null } | null;
  task: Task;
  comments: TaskComment[];
  events: TaskEvent[];
}

interface Board {
  project: Project;
  projectTags: string[];
  columns: BoardColumn[];
  oberthemen: Oberthema[];
  unterthemen: Unterthema[];
  swimlanes: Swimlane[];
  members: User[];
  tasks: Task[];
}

interface TaskPlacement {
  oberthemaId: string;
  unterthemaId: string | null;
}

interface AnnotationPoint {
  x: number;
  y: number;
}

interface AnnotationStroke {
  color: string;
  width: number;
  points: AnnotationPoint[];
}

interface AnnotationData {
  version: 1;
  strokes: AnnotationStroke[];
}

interface PendingTaskFile {
  id: string;
  file: File;
  url: string;
  annotation: AnnotationData;
  annotatedUrl: string | null;
  renderedFile: File | null;
}

const dictionary = {
  en: {
    app: 'Agent Kanban',
    subtitle: 'From strategic topics to focused tasks',
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
    assignee: 'Responsible',
    unassigned: 'Nobody',
    you: 'You',
    priority: 'Priority',
    files: 'Files',
    pasteHint: 'Paste screenshots into description or attach files.',
    createTask: 'Create task',
    editTask: 'Edit task',
    updateTask: 'Save task',
    deleteTask: 'Delete task',
    deleteTaskConfirm: 'Delete this task permanently?',
    deleteTaskWarning: 'This cannot be undone. Attachments and activity for this task will be removed with it.',
    unsavedTaskChanges: 'Discard unsaved changes?',
    unsavedTaskChangesDescription: 'Your current changes will be lost if you close this task.',
    keepEditing: 'Keep editing',
    discardChanges: 'Discard changes',
    editProject: 'Edit project',
    updateProject: 'Save project',
    role: 'Role',
    memberRole: 'Member',
    adminRole: 'Admin',
    activity: 'Progress',
    activityReadableHint: 'Send steering while the agent is running and keep the latest AI update in view.',
    latestUpdate: 'Latest update',
    noAgentUpdate: 'No AI update yet.',
    steeringHelp: 'Use steering to correct direction while the agent is running. Follow-up work can be requested after review.',
    steeringUnavailable: 'Steering is available once the task is queued or in progress.',
    guidance: 'Guidance',
    sendMessage: 'Send message',
    lockedTask: 'Work is in progress. Title and description are locked.',
    todoAutomationHint: 'Tasks marked for AI are processed here from top to bottom. Human tasks stay untouched.',
    todoAutomationShort: 'AI tasks start automatically',
    activityTab: 'Progress',
    taskTab: 'Task brief',
    commentsTab: 'Comments',
    readonlyTask: 'This is the original task brief. It stays unchanged once work has started.',
    dropHere: 'Drop here',
    noGuidanceAfterFinish: 'Work is finished. New guidance is closed, but the progress history remains available.',
    refresh: 'Refresh',
    noProject: 'No project selected',
    hierarchy: 'Topic structure',
    hierarchyHint: 'Navigate from a parent topic into its sub-topics and shared workflow.',
    hierarchyReorderHint: 'Drag topics by the handle to reorder them.',
    projectOverview: 'All topics',
    allTasks: 'All project tasks',
    oberthema: 'Parent topic',
    oberthemen: 'Parent topics',
    unterthema: 'Sub-topic',
    unterthemen: 'Sub-topics',
    newOberthema: 'New parent topic',
    editOberthema: 'Edit parent topic',
    newUnterthema: 'New sub-topic',
    editUnterthema: 'Edit sub-topic',
    topicName: 'Topic name',
    topicDescription: 'What belongs in this topic?',
    topicColor: 'Accent color',
    chooseUnterthema: 'Choose a topic assignment',
    topicAssignment: 'Topic assignment',
    directTasks: 'Direct tasks',
    showCompleted: 'Show older completed',
    hideCompleted: 'Hide older completed',
    completedHidden: 'older completed hidden',
    completedRetentionHint: 'Completed tasks stay visible for 30 minutes.',
    expandSubtopic: 'Expand sub-topic',
    collapseSubtopic: 'Collapse sub-topic',
    aiTask: 'AI task',
    humanTask: 'Human task',
    aiExecution: 'Let the AI agent execute this task',
    aiExecutionHelp: 'Off by default. Only enabled tasks are started automatically in To Do.',
    noOberthemen: 'No parent topics yet',
    noUnterthemen: 'This parent topic has no sub-topics yet',
    scopeTasks: 'tasks in this view',
    openTopic: 'Open topic',
    deleteOberthema: 'Delete parent topic',
    deleteUnterthema: 'Delete sub-topic',
    deleteTopicConfirm: 'Delete this empty topic?',
    topicDialog: 'Build the hierarchy used to organize every status column.',
    expandTopic: 'Expand parent topic',
    collapseTopic: 'Collapse parent topic',
    moveOberthema: 'Move parent topic',
    moveUnterthema: 'Move sub-topic',
    topicProgress: 'Topic progress',
    completedTasks: 'completed',
    folder: 'Location',
    attachments: 'attachments',
    tags: 'Tags',
    projectTags: 'Project tags',
    projectTagsHelp: 'Define the fixed tags available for tasks in this project. Separate tags with commas.',
    tagsHelp: 'Choose one or more project tags.',
    chooseTags: 'Choose tags',
    editTags: 'Edit tags',
    noTags: 'No tags',
    noProjectTags: 'No project tags defined',
    comments: 'Comments',
    commentPlaceholder: 'Write a comment for the team.',
    sendComment: 'Send comment',
    noComments: 'No comments yet',
    followUp: 'Follow-up task',
    followUpHelp: 'Add what was not good enough and send the task back to the agent.',
    followUpPlaceholder: 'Describe what should be improved or continued.',
    followUpFilesOnlyMessage: 'Continue with the attached follow-up material.',
    requestFollowUp: 'Continue work',
    images: 'Images',
    editImage: 'Edit image',
    annotateImage: 'Annotate image',
    annotationHelp: 'Mark the image for the agent. The drawing stays editable and an annotated copy is passed to the agent.',
    undo: 'Undo',
    redo: 'Redo',
    formatting: 'Formatting',
    paragraph: 'Paragraph',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bold: 'Bold',
    italic: 'Italic',
    bulletList: 'Bullet list',
    orderedList: 'Numbered list',
    quote: 'Quote',
    link: 'Link',
    markdownEditorHelp: 'Formatting is stored as Markdown.',
    clear: 'Clear',
    saveAnnotation: 'Save annotation',
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
    app: 'Agent Kanban',
    subtitle: 'Von strategischen Themen zu klaren Aufgaben',
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
    assignee: 'Verantwortlich',
    unassigned: 'Niemand',
    you: 'Du',
    priority: 'Priorität',
    files: 'Dateien',
    pasteHint: 'Screenshots in die Beschreibung einfügen oder Dateien anhängen.',
    createTask: 'Aufgabe erstellen',
    editTask: 'Aufgabe bearbeiten',
    updateTask: 'Aufgabe speichern',
    deleteTask: 'Aufgabe löschen',
    deleteTaskConfirm: 'Diese Aufgabe dauerhaft löschen?',
    deleteTaskWarning: 'Das kann nicht rückgängig gemacht werden. Anhänge und Aktivitäten dieser Aufgabe werden mitgelöscht.',
    unsavedTaskChanges: 'Ungespeicherte Änderungen verwerfen?',
    unsavedTaskChangesDescription: 'Wenn du die Aufgabe schließt, gehen deine aktuellen Änderungen verloren.',
    keepEditing: 'Weiter bearbeiten',
    discardChanges: 'Änderungen verwerfen',
    editProject: 'Projekt bearbeiten',
    updateProject: 'Projekt speichern',
    role: 'Rolle',
    memberRole: 'Mitglied',
    adminRole: 'Admin',
    activity: 'Fortschritt',
    activityReadableHint: 'Sende Hinweise während der Bearbeitung und behalte das letzte KI-Update im Blick.',
    latestUpdate: 'Letztes Update',
    noAgentUpdate: 'Noch kein KI-Update vorhanden.',
    steeringHelp: 'Nutze Hinweise, um während der Bearbeitung die Richtung zu korrigieren. Folgearbeit kann nach der Prüfung angefordert werden.',
    steeringUnavailable: 'Hinweise sind verfügbar, sobald die Aufgabe vorgemerkt oder in Bearbeitung ist.',
    guidance: 'Hinweis',
    sendMessage: 'Nachricht senden',
    lockedTask: 'Die Aufgabe wird bearbeitet. Titel und Beschreibung sind gesperrt.',
    todoAutomationHint: 'Für KI markierte Aufgaben werden hier von oben nach unten bearbeitet. Menschliche Aufgaben bleiben unberührt.',
    todoAutomationShort: 'KI-Aufgaben starten automatisch',
    activityTab: 'Fortschritt',
    taskTab: 'Auftrag',
    commentsTab: 'Kommentare',
    readonlyTask: 'Das ist der ursprüngliche Auftrag. Er bleibt unverändert, sobald die Bearbeitung begonnen hat.',
    dropHere: 'Hier ablegen',
    noGuidanceAfterFinish: 'Die Bearbeitung ist abgeschlossen. Neue Hinweise sind geschlossen, der Verlauf bleibt sichtbar.',
    refresh: 'Aktualisieren',
    noProject: 'Kein Projekt ausgewählt',
    hierarchy: 'Themenstruktur',
    hierarchyHint: 'Navigiere vom Oberthema in seine Unterthemen und den gemeinsamen Workflow.',
    hierarchyReorderHint: 'Themen am Griff ziehen, um sie zu sortieren.',
    projectOverview: 'Alle Themen',
    allTasks: 'Alle Projektaufgaben',
    oberthema: 'Oberthema',
    oberthemen: 'Oberthemen',
    unterthema: 'Unterthema',
    unterthemen: 'Unterthemen',
    newOberthema: 'Neues Oberthema',
    editOberthema: 'Oberthema bearbeiten',
    newUnterthema: 'Neues Unterthema',
    editUnterthema: 'Unterthema bearbeiten',
    topicName: 'Themenname',
    topicDescription: 'Was gehört in dieses Thema?',
    topicColor: 'Akzentfarbe',
    chooseUnterthema: 'Themenzuordnung wählen',
    topicAssignment: 'Themenzuordnung',
    directTasks: 'Direkte Aufgaben',
    showCompleted: 'Ältere Erledigte einblenden',
    hideCompleted: 'Ältere Erledigte ausblenden',
    completedHidden: 'ältere Erledigte ausgeblendet',
    completedRetentionHint: 'Erledigte Aufgaben bleiben 30 Minuten sichtbar.',
    expandSubtopic: 'Unterthema aufklappen',
    collapseSubtopic: 'Unterthema zuklappen',
    aiTask: 'KI-Aufgabe',
    humanTask: 'Menschliche Aufgabe',
    aiExecution: 'Diesen Task vom KI-Agenten bearbeiten lassen',
    aiExecutionHelp: 'Standardmäßig aus. Nur aktivierte Tasks starten in „Zu erledigen“ automatisch.',
    noOberthemen: 'Noch keine Oberthemen',
    noUnterthemen: 'Dieses Oberthema hat noch keine Unterthemen',
    scopeTasks: 'Aufgaben in dieser Ansicht',
    openTopic: 'Thema öffnen',
    deleteOberthema: 'Oberthema löschen',
    deleteUnterthema: 'Unterthema löschen',
    deleteTopicConfirm: 'Dieses leere Thema löschen?',
    topicDialog: 'Baue die Hierarchie, die alle Statusspalten strukturiert.',
    expandTopic: 'Oberthema aufklappen',
    collapseTopic: 'Oberthema zuklappen',
    moveOberthema: 'Oberthema verschieben',
    moveUnterthema: 'Unterthema verschieben',
    topicProgress: 'Themenfortschritt',
    completedTasks: 'erledigt',
    folder: 'Ablage',
    attachments: 'Anhänge',
    tags: 'Tags',
    projectTags: 'Projekt-Tags',
    projectTagsHelp: 'Definiere die festen Tags, die in diesem Projekt für Aufgaben verfügbar sind. Tags mit Kommas trennen.',
    tagsHelp: 'Wähle ein oder mehrere Projekt-Tags.',
    chooseTags: 'Tags auswählen',
    editTags: 'Tags bearbeiten',
    noTags: 'Keine Tags',
    noProjectTags: 'Keine Projekt-Tags definiert',
    comments: 'Kommentare',
    commentPlaceholder: 'Kommentar für das Team schreiben.',
    sendComment: 'Kommentar senden',
    noComments: 'Noch keine Kommentare',
    followUp: 'Folgeaufgabe',
    followUpHelp: 'Beschreibe, was noch nicht gut genug war, und gib die Aufgabe zurück an den Agenten.',
    followUpPlaceholder: 'Beschreibe, was verbessert oder weiterbearbeitet werden soll.',
    followUpFilesOnlyMessage: 'Bitte mit dem angehängten Folge-Material weiterarbeiten.',
    requestFollowUp: 'Weiterarbeiten lassen',
    images: 'Bilder',
    editImage: 'Bild bearbeiten',
    annotateImage: 'Bild markieren',
    annotationHelp: 'Markiere das Bild für den Agenten. Die Zeichnung bleibt editierbar und eine markierte Kopie wird an den Agenten übergeben.',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    formatting: 'Formatierung',
    paragraph: 'Absatz',
    heading1: 'Überschrift 1',
    heading2: 'Überschrift 2',
    heading3: 'Überschrift 3',
    bold: 'Fett',
    italic: 'Kursiv',
    bulletList: 'Aufzählung',
    orderedList: 'Nummerierte Liste',
    quote: 'Zitat',
    link: 'Link',
    markdownEditorHelp: 'Die Formatierung wird als Markdown gespeichert.',
    clear: 'Leeren',
    saveAnnotation: 'Markierung speichern',
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
const selectedOberthemaId = ref<string | null>(null);
const selectedUnterthemaId = ref<string | null>(null);
const collapsedOberthemaIds = ref<string[]>([]);
const collapsedUnterthemaIds = ref<string[]>([]);
const showAllDone = ref(false);
const boardClock = ref(Date.now());
const board = ref<Board | null>(null);
const busy = ref(false);
const refreshingBoard = ref(false);
const errorMessage = ref<string | null>(null);
const draggedTaskId = ref<string | null>(null);
const dragOverPlacementKey = ref<string | null>(null);
const dragOverTaskId = ref<string | null>(null);
const draggedOberthemaId = ref<string | null>(null);
const draggedUnterthemaId = ref<string | null>(null);
const hierarchyDragOverId = ref<string | null>(null);
const hierarchyReordering = ref(false);
const projectModalOpen = ref(false);
const userModalOpen = ref(false);
const taskModalOpen = ref(false);
const discardTaskModalOpen = ref(false);
const oberthemaModalOpen = ref(false);
const unterthemaModalOpen = ref(false);
const deleteTaskModalOpen = ref(false);
const annotationModalOpen = ref(false);
const taskSubmitting = ref(false);
const hierarchySubmitting = ref(false);
const annotationSubmitting = ref(false);
const sidebarCollapsed = ref(false);
const editingProjectId = ref<string | null>(null);
const editingOberthemaId = ref<string | null>(null);
const editingUnterthemaId = ref<string | null>(null);
const selectedTaskId = ref<string | null>(null);
const selectedTaskDetail = ref<TaskDetail | null>(null);
const taskMessage = ref('');
const commentMessage = ref('');
const followUpMessage = ref('');
const activeTaskTab = ref<'activity' | 'task' | 'comments'>('activity');
const tagDropdownOpen = ref(false);
const selectedAnnotationAttachment = ref<Attachment | null>(null);
const selectedAnnotationPendingFile = ref<PendingTaskFile | null>(null);
const annotationImageEl = ref<HTMLImageElement | null>(null);
const annotationCanvas = ref<HTMLCanvasElement | null>(null);
const annotationData = ref<AnnotationData>({ version: 1, strokes: [] });
const annotationColor = ref('#ef4444');
const annotationWidth = ref(5);
const drawingStroke = ref<AnnotationStroke | null>(null);
const annotationColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827'];
let boardRefreshTimer: ReturnType<typeof setInterval> | null = null;
let taskEventSource: EventSource | null = null;
const DONE_RETENTION_MS = 30 * 60 * 1000;
const UNASSIGNED_ID = '__unassigned__';

const loginForm = reactive({ email: '', password: '' });
const userForm = reactive({ name: '', email: '', password: '', role: 'member' as User['role'] });
const projectForm = reactive({ name: '', key: '', folderPath: '', description: '', userIds: [] as string[], tags: '' });
const oberthemaForm = reactive({ name: '', description: '', color: 'teal' });
const unterthemaForm = reactive({ name: '', description: '', oberthemaId: '' });
const taskForm = reactive({
  title: '',
  description: '',
  columnId: '',
  placementId: '',
  swimlaneId: '',
  assigneeId: UNASSIGNED_ID,
  agentEnabled: false,
  priority: 'normal' as Task['priority'],
  tags: [] as string[],
});
const taskFiles = ref<PendingTaskFile[]>([]);
const taskModalBaseline = ref('');
let taskModalBaselineVersion = 0;

function taskDraftFingerprint() {
  return JSON.stringify({
    title: taskForm.title,
    description: taskForm.description.replace(/\r\n/g, '\n').trimEnd(),
    columnId: taskForm.columnId,
    placementId: taskForm.placementId,
    swimlaneId: taskForm.swimlaneId,
    assigneeId: taskForm.assigneeId,
    agentEnabled: taskForm.agentEnabled,
    priority: taskForm.priority,
    tags: [...taskForm.tags].sort((left, right) => left.localeCompare(right)),
    files: taskFiles.value.map((item) => ({
      name: item.file.name,
      size: item.file.size,
      type: item.file.type,
      lastModified: item.file.lastModified,
      annotated: Boolean(item.renderedFile),
    })),
    taskMessage: taskMessage.value,
    commentMessage: commentMessage.value,
    followUpMessage: followUpMessage.value,
  });
}

function markTaskModalClean() {
  taskModalBaseline.value = taskDraftFingerprint();
}

async function establishTaskModalBaseline() {
  const version = ++taskModalBaselineVersion;
  taskModalBaseline.value = '';
  await nextTick();
  if (import.meta.client) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  } else {
    await nextTick();
  }
  if (version === taskModalBaselineVersion && taskModalOpen.value) markTaskModalClean();
}

function closeTaskModalImmediately() {
  taskModalBaselineVersion += 1;
  taskModalBaseline.value = '';
  discardTaskModalOpen.value = false;
  tagDropdownOpen.value = false;
  taskModalOpen.value = false;
  closeTaskEventStream();
  clearTaskFiles();
}

function requestCloseTaskModal() {
  if (!taskModalOpen.value || taskSubmitting.value) return;
  if (!taskModalBaseline.value || taskDraftFingerprint() === taskModalBaseline.value) {
    closeTaskModalImmediately();
    return;
  }
  discardTaskModalOpen.value = true;
}

function discardTaskChanges() {
  closeTaskModalImmediately();
}

const taskModalModel = computed({
  get: () => taskModalOpen.value,
  set: (open: boolean) => {
    if (open) {
      taskModalOpen.value = true;
      return;
    }
    requestCloseTaskModal();
  },
});

const t = computed(() => dictionary[locale.value]);
const isDarkMode = computed(() => colorMode.value === 'dark');
const themeToggleLabel = computed(() => isDarkMode.value ? t.value.lightMode : t.value.darkMode);
const themeToggleIcon = computed(() => isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon');
const isAdmin = computed(() => user.value?.role === 'admin');
const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value) ?? null);
const selectedOberthema = computed(() => board.value?.oberthemen.find((topic) => topic.id === selectedOberthemaId.value) ?? null);
const selectedUnterthema = computed(() => board.value?.unterthemen.find((topic) => topic.id === selectedUnterthemaId.value) ?? null);
const selectedTopicUnterthemen = computed(() => board.value?.unterthemen.filter((topic) => topic.oberthemaId === selectedOberthemaId.value) ?? []);
const scopeTitle = computed(() => selectedProject.value?.name ?? t.value.projectOverview);
const scopeDescription = computed(() => selectedProject.value?.description ?? t.value.hierarchyHint);
const defaultSwimlaneId = computed(() => board.value?.swimlanes[0]?.id ?? '');
const defaultPlacementId = computed(() => selectedUnterthemaId.value
  ? `unterthema:${selectedUnterthemaId.value}`
  : selectedOberthemaId.value
    ? `oberthema:${selectedOberthemaId.value}`
    : board.value?.oberthemen[0]?.id
      ? `oberthema:${board.value.oberthemen[0].id}`
      : '');
const editingTask = computed(() => selectedTaskDetail.value?.task ?? null);
const backlogColumn = computed(() => board.value?.columns.find((column) => column.key === 'backlog') ?? board.value?.columns[0] ?? null);
const hasAgentActivity = computed(() => {
  const status = editingTask.value?.agentStatus;
  if (status === 'running' || status === 'done' || status === 'failed') return true;
  return selectedTaskDetail.value?.events.some((event) => ['codex_started', 'codex_text_update', 'codex_completed', 'codex_failed'].includes(event.action)) ?? false;
});
const canSendGuidance = computed(() => {
  const status = editingTask.value?.agentStatus;
  return status === 'queued' || status === 'running';
});
const canRequestFollowUp = computed(() => {
  const status = editingTask.value?.agentStatus;
  return status === 'done' || status === 'failed';
});
const currentProjectTags = computed(() => selectedTaskDetail.value?.projectTags ?? board.value?.projectTags ?? []);
const taskTagPreview = computed(() => taskForm.tags);
const assigneeItems = computed(() => [
  { label: t.value.unassigned, value: UNASSIGNED_ID, icon: 'i-lucide-user-round-x' },
  ...(board.value?.members ?? []).map((member) => ({
    label: member.id === user.value?.id ? `${member.name} (${t.value.you})` : member.name,
    value: member.id,
    icon: 'i-lucide-user-round',
  })),
]);
const editorToolbarItems = computed<EditorToolbarItem[][]>(() => [
  [
    { kind: 'paragraph', icon: 'i-lucide-pilcrow', tooltip: { text: t.value.paragraph }, 'aria-label': t.value.paragraph },
    { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', tooltip: { text: t.value.heading1 }, 'aria-label': t.value.heading1 },
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: t.value.heading2 }, 'aria-label': t.value.heading2 },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', tooltip: { text: t.value.heading3 }, 'aria-label': t.value.heading3 },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: t.value.bold }, 'aria-label': t.value.bold },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: t.value.italic }, 'aria-label': t.value.italic },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: t.value.bulletList }, 'aria-label': t.value.bulletList },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: t.value.orderedList }, 'aria-label': t.value.orderedList },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: t.value.quote }, 'aria-label': t.value.quote },
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: t.value.link }, 'aria-label': t.value.link },
  ],
  [
    { kind: 'undo', icon: 'i-lucide-undo-2', tooltip: { text: t.value.undo }, 'aria-label': t.value.undo },
    { kind: 'redo', icon: 'i-lucide-redo-2', tooltip: { text: t.value.redo }, 'aria-label': t.value.redo },
  ],
]);
const teamComments = computed(() => (selectedTaskDetail.value?.comments ?? []).filter((comment) => comment.kind === 'comment'));
const commentCount = computed(() => teamComments.value.length);
const taskTabs = computed(() => [
  { key: 'activity' as const, label: t.value.activityTab },
  { key: 'task' as const, label: t.value.taskTab },
  { key: 'comments' as const, label: `${t.value.commentsTab} (${commentCount.value})` },
]);
const latestAgentUpdate = computed(() => latestTextUpdate(selectedTaskDetail.value?.events ?? []));
const taskImageAttachments = computed(() => (editingTask.value?.attachments ?? []).filter(isImageAttachment));
const selectedAnnotationName = computed(() => selectedAnnotationAttachment.value?.fileName ?? selectedAnnotationPendingFile.value?.file.name ?? '');
const selectedAnnotationImageUrl = computed(() => selectedAnnotationAttachment.value?.url ?? selectedAnnotationPendingFile.value?.url ?? '');
const boardStats = computed(() => ({
  tasks: visibleTasks.value.length,
  columns: board.value?.columns.length ?? 0,
  members: board.value?.members.length ?? 0,
  oberthemen: board.value?.oberthemen.length ?? 0,
  unterthemen: board.value?.unterthemen.length ?? 0,
}));
const columnItems = computed(() => board.value?.columns.map((column) => ({
  label: columnName(column),
  value: column.id,
})) ?? []);
const placementItems = computed(() => board.value?.oberthemen.flatMap((topic) => [
  { label: `${t.value.oberthema}: ${topic.name}`, value: `oberthema:${topic.id}` },
  ...unterthemenFor(topic.id).map((subtopic) => ({
    label: `↳ ${subtopic.name}`,
    value: `unterthema:${subtopic.id}`,
  })),
]) ?? []);
const oberthemaItems = computed(() => board.value?.oberthemen.map((topic) => ({ label: topic.name, value: topic.id })) ?? []);
const topicColorItems = [
  { label: 'Lagoon', value: 'teal' },
  { label: 'Signal', value: 'coral' },
  { label: 'Sun', value: 'amber' },
  { label: 'Iris', value: 'indigo' },
  { label: 'Moss', value: 'emerald' },
];
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
  sidebarCollapsed.value = window.matchMedia('(max-width: 767px)').matches
    || localStorage.getItem('ak_sidebar_collapsed') === 'true';
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
  clearTaskFiles();
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
  restoreBoardViewState(projectId);
  if (selectedOberthemaId.value && !board.value.oberthemen.some((topic) => topic.id === selectedOberthemaId.value)) {
    selectedOberthemaId.value = null;
  }
  if (selectedUnterthemaId.value && !board.value.unterthemen.some((topic) => topic.id === selectedUnterthemaId.value)) {
    selectedUnterthemaId.value = null;
  }
  if (selectedUnterthemaId.value) {
    selectedOberthemaId.value = board.value.unterthemen.find((topic) => topic.id === selectedUnterthemaId.value)?.oberthemaId ?? null;
  }
  const firstColumnId = board.value.columns[0]?.id ?? '';
  if (!board.value.columns.some((column) => column.id === taskForm.columnId)) taskForm.columnId = firstColumnId;
  taskForm.swimlaneId = taskForm.swimlaneId || defaultSwimlaneId.value;
  if (!placementItems.value.some((item) => item.value === taskForm.placementId)) {
    taskForm.placementId = defaultPlacementId.value;
  }
  taskForm.tags = taskForm.tags.filter((tag) => board.value?.projectTags.includes(tag));
  boardClock.value = Date.now();
};

const refreshCurrentBoard = async () => {
  if (!user.value || activeView.value !== 'board' || !selectedProjectId.value || refreshingBoard.value || hierarchyReordering.value) return;
  refreshingBoard.value = true;
  boardClock.value = Date.now();
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
  if (selectedProjectId.value !== projectId) {
    selectedOberthemaId.value = null;
    selectedUnterthemaId.value = null;
  }
  selectedProjectId.value = projectId;
  activeView.value = 'board';
};

const selectProjectOverview = () => {
  selectedOberthemaId.value = null;
  selectedUnterthemaId.value = null;
  activeView.value = 'board';
};

const selectOberthema = (oberthemaId: string) => {
  selectedOberthemaId.value = oberthemaId;
  selectedUnterthemaId.value = null;
  activeView.value = 'board';
  collapsedOberthemaIds.value = collapsedOberthemaIds.value.filter((id) => id !== oberthemaId);
  persistBoardViewState();
  scrollToHierarchyRow(`topic-${oberthemaId}`);
};

const selectUnterthema = (unterthemaId: string) => {
  const subtopic = board.value?.unterthemen.find((topic) => topic.id === unterthemaId);
  if (!subtopic) return;
  selectedOberthemaId.value = subtopic.oberthemaId;
  selectedUnterthemaId.value = unterthemaId;
  activeView.value = 'board';
  collapsedOberthemaIds.value = collapsedOberthemaIds.value.filter((id) => id !== subtopic.oberthemaId);
  collapsedUnterthemaIds.value = collapsedUnterthemaIds.value.filter((id) => id !== unterthemaId);
  persistBoardViewState();
  scrollToHierarchyRow(`subtopic-${unterthemaId}`);
};

const toggleOberthemaExpanded = (oberthemaId: string) => {
  collapsedOberthemaIds.value = collapsedOberthemaIds.value.includes(oberthemaId)
    ? collapsedOberthemaIds.value.filter((id) => id !== oberthemaId)
    : [...collapsedOberthemaIds.value, oberthemaId];
  persistBoardViewState();
};

const toggleUnterthemaExpanded = (unterthemaId: string) => {
  collapsedUnterthemaIds.value = collapsedUnterthemaIds.value.includes(unterthemaId)
    ? collapsedUnterthemaIds.value.filter((id) => id !== unterthemaId)
    : [...collapsedUnterthemaIds.value, unterthemaId];
  persistBoardViewState();
};

const toggleCompletedVisibility = () => {
  showAllDone.value = !showAllDone.value;
  persistBoardViewState();
};

const boardViewStateKey = (projectId: string) => `ak_board_view:${projectId}`;

const restoreBoardViewState = (projectId: string) => {
  if (!import.meta.client || !board.value) return;
  try {
    const saved = JSON.parse(localStorage.getItem(boardViewStateKey(projectId)) ?? '{}') as {
      collapsedOberthemaIds?: string[];
      collapsedUnterthemaIds?: string[];
      showAllDone?: boolean;
    };
    const topicIds = new Set(board.value.oberthemen.map((topic) => topic.id));
    const subtopicIds = new Set(board.value.unterthemen.map((topic) => topic.id));
    collapsedOberthemaIds.value = (saved.collapsedOberthemaIds ?? []).filter((id) => topicIds.has(id));
    collapsedUnterthemaIds.value = (saved.collapsedUnterthemaIds ?? []).filter((id) => subtopicIds.has(id));
    showAllDone.value = saved.showAllDone ?? false;
  } catch {
    collapsedOberthemaIds.value = [];
    collapsedUnterthemaIds.value = [];
    showAllDone.value = false;
  }
};

const persistBoardViewState = () => {
  if (!import.meta.client || !selectedProjectId.value) return;
  localStorage.setItem(boardViewStateKey(selectedProjectId.value), JSON.stringify({
    collapsedOberthemaIds: collapsedOberthemaIds.value,
    collapsedUnterthemaIds: collapsedUnterthemaIds.value,
    showAllDone: showAllDone.value,
  }));
};

const scrollToHierarchyRow = (id: string) => nextTick(() => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

const openOberthemaModal = (topic?: Oberthema) => {
  errorMessage.value = null;
  editingOberthemaId.value = topic?.id ?? null;
  Object.assign(oberthemaForm, {
    name: topic?.name ?? '',
    description: topic?.description ?? '',
    color: topic?.color ?? 'teal',
  });
  oberthemaModalOpen.value = true;
};

const openUnterthemaModal = (oberthemaId?: string, subtopic?: Unterthema) => {
  errorMessage.value = null;
  editingUnterthemaId.value = subtopic?.id ?? null;
  Object.assign(unterthemaForm, {
    name: subtopic?.name ?? '',
    description: subtopic?.description ?? '',
    oberthemaId: subtopic?.oberthemaId ?? oberthemaId ?? selectedOberthemaId.value ?? board.value?.oberthemen[0]?.id ?? '',
  });
  unterthemaModalOpen.value = true;
};

const saveOberthemaAction = async () => {
  if (!selectedProjectId.value || !oberthemaForm.name.trim() || hierarchySubmitting.value) return;
  errorMessage.value = null;
  hierarchySubmitting.value = true;
  try {
    if (editingOberthemaId.value) {
      await $fetch(`/api/oberthemen/${editingOberthemaId.value}`, { method: 'PATCH', body: oberthemaForm });
      selectedOberthemaId.value = editingOberthemaId.value;
    } else {
      const response = await $fetch<{ oberthema: Oberthema }>(`/api/projects/${selectedProjectId.value}/oberthemen`, {
        method: 'POST',
        body: oberthemaForm,
      });
      selectedOberthemaId.value = response.oberthema.id;
      selectedUnterthemaId.value = null;
    }
    await loadBoard(selectedProjectId.value);
    oberthemaModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    hierarchySubmitting.value = false;
  }
};

const saveUnterthemaAction = async () => {
  if (!selectedProjectId.value || !unterthemaForm.name.trim() || !unterthemaForm.oberthemaId || hierarchySubmitting.value) return;
  errorMessage.value = null;
  hierarchySubmitting.value = true;
  try {
    if (editingUnterthemaId.value) {
      await $fetch(`/api/unterthemen/${editingUnterthemaId.value}`, { method: 'PATCH', body: unterthemaForm });
      selectedUnterthemaId.value = editingUnterthemaId.value;
    } else {
      const response = await $fetch<{ unterthema: Unterthema }>(`/api/oberthemen/${unterthemaForm.oberthemaId}/unterthemen`, {
        method: 'POST',
        body: { name: unterthemaForm.name, description: unterthemaForm.description },
      });
      selectedUnterthemaId.value = response.unterthema.id;
    }
    selectedOberthemaId.value = unterthemaForm.oberthemaId;
    await loadBoard(selectedProjectId.value);
    unterthemaModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    hierarchySubmitting.value = false;
  }
};

const deleteOberthemaAction = async () => {
  if (!editingOberthemaId.value || !selectedProjectId.value || hierarchySubmitting.value || !confirm(t.value.deleteTopicConfirm)) return;
  errorMessage.value = null;
  hierarchySubmitting.value = true;
  try {
    await $fetch(`/api/oberthemen/${editingOberthemaId.value}`, { method: 'DELETE' });
    selectedOberthemaId.value = null;
    selectedUnterthemaId.value = null;
    oberthemaModalOpen.value = false;
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    hierarchySubmitting.value = false;
  }
};

const deleteUnterthemaAction = async () => {
  if (!editingUnterthemaId.value || !selectedProjectId.value || hierarchySubmitting.value || !confirm(t.value.deleteTopicConfirm)) return;
  errorMessage.value = null;
  hierarchySubmitting.value = true;
  try {
    await $fetch(`/api/unterthemen/${editingUnterthemaId.value}`, { method: 'DELETE' });
    selectedUnterthemaId.value = null;
    unterthemaModalOpen.value = false;
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    hierarchySubmitting.value = false;
  }
};

const openProjectModal = async (project?: Project) => {
  editingProjectId.value = project?.id ?? null;
  Object.assign(projectForm, { name: '', key: '', folderPath: '', description: '', userIds: [], tags: '' });
  if (project) {
    Object.assign(projectForm, {
      name: project.name,
      key: project.key,
      folderPath: project.folderPath,
      description: project.description ?? '',
      userIds: [],
      tags: '',
    });
    const projectBoard = selectedProjectId.value === project.id && board.value
      ? board.value
      : await $fetch<Board>(`/api/projects/${project.id}/board`);
    projectForm.userIds = projectBoard.members.map((member) => member.id);
    projectForm.tags = projectBoard.projectTags.join(', ');
  }
  projectModalOpen.value = true;
};

const openUserModal = () => {
  Object.assign(userForm, { name: '', email: '', password: '', role: 'member' });
  userModalOpen.value = true;
};

const openTaskModal = async (columnId?: string, placement?: TaskPlacement) => {
  closeTaskEventStream();
  selectedTaskId.value = null;
  selectedTaskDetail.value = null;
  taskMessage.value = '';
  commentMessage.value = '';
  followUpMessage.value = '';
  tagDropdownOpen.value = false;
  activeTaskTab.value = 'task';
  Object.assign(taskForm, {
    title: '',
    description: '',
    columnId: columnId ?? backlogColumn.value?.id ?? '',
    placementId: placement ? placementIdFor(placement) : defaultPlacementId.value,
    swimlaneId: defaultSwimlaneId.value,
    assigneeId: user.value?.id ?? UNASSIGNED_ID,
    agentEnabled: false,
    priority: 'normal',
    tags: [],
  });
  clearTaskFiles();
  taskModalOpen.value = true;
  await establishTaskModalBaseline();
};

const openTaskDetail = async (task: Task) => {
  closeTaskEventStream();
  selectedTaskId.value = task.id;
  clearTaskFiles();
  taskMessage.value = '';
  commentMessage.value = '';
  followUpMessage.value = '';
  tagDropdownOpen.value = false;
  selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${task.id}`);
  activeTaskTab.value = hasAgentActivity.value ? 'activity' : 'task';
  const detailTask = selectedTaskDetail.value.task;
  Object.assign(taskForm, {
    title: detailTask.title,
    description: detailTask.description ?? '',
    columnId: detailTask.columnId,
    placementId: placementIdFor(detailTask),
    swimlaneId: detailTask.swimlaneId ?? defaultSwimlaneId.value,
    assigneeId: detailTask.assigneeId ?? UNASSIGNED_ID,
    agentEnabled: detailTask.agentEnabled,
    priority: 'normal',
    tags: detailTask.tags,
  });
  taskModalOpen.value = true;
  openTaskEventStream(task.id);
  await establishTaskModalBaseline();
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
  const body = {
    ...projectForm,
    tags: parseTagList(projectForm.tags),
  };
  try {
    if (editingProjectId.value) {
      await $fetch(`/api/projects/${editingProjectId.value}`, { method: 'PATCH', body });
    } else {
      await $fetch('/api/projects', { method: 'POST', body });
    }
    Object.assign(projectForm, { name: '', key: '', folderPath: '', description: '', userIds: [], tags: '' });
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
    const placement = parsePlacementId(taskForm.placementId);
    if (selectedTaskId.value) {
      const tags = taskForm.tags;
      const assigneeId = taskAssigneeIdForRequest();
      if (!hasAgentActivity.value) {
        await $fetch(`/api/tasks/${selectedTaskId.value}`, {
          method: 'PATCH',
          body: {
            title: taskForm.title,
            description: taskForm.description,
            columnId: taskForm.columnId,
            ...placement,
            assigneeId,
            agentEnabled: taskForm.agentEnabled,
            tags,
          },
        });
      } else {
        await $fetch(`/api/tasks/${selectedTaskId.value}`, {
          method: 'PATCH',
          body: { tags, ...placement, assigneeId, agentEnabled: taskForm.agentEnabled },
        });
      }
      if (taskFiles.value.length && (!hasAgentActivity.value || canSendGuidance.value)) {
        const attachmentForm = new FormData();
        for (const file of taskUploadFiles()) attachmentForm.append('files', file);
        await $fetch(`/api/tasks/${selectedTaskId.value}/attachments`, { method: 'POST', body: attachmentForm });
      }
      if (taskMessage.value.trim() && canSendGuidance.value) {
        await $fetch(`/api/tasks/${selectedTaskId.value}/messages`, { method: 'POST', body: { body: taskMessage.value } });
      }
      clearTaskFiles();
      taskMessage.value = '';
      closeTaskModalImmediately();
      await loadBoard(selectedProjectId.value);
    } else {
      taskForm.swimlaneId = taskForm.swimlaneId || defaultSwimlaneId.value;
      taskForm.placementId = taskForm.placementId || defaultPlacementId.value;
      const form = new FormData();
      form.append('title', taskForm.title);
      if (taskForm.description) form.append('description', taskForm.description);
      if (taskForm.columnId) form.append('columnId', taskForm.columnId);
      if (taskForm.swimlaneId) form.append('swimlaneId', taskForm.swimlaneId);
      form.append('oberthemaId', placement.oberthemaId);
      if (placement.unterthemaId) form.append('unterthemaId', placement.unterthemaId);
      form.append('assigneeId', taskAssigneeIdForRequest() ?? '');
      form.append('agentEnabled', String(taskForm.agentEnabled));
      form.append('tags', JSON.stringify(taskForm.tags));
      for (const file of taskUploadFiles()) form.append('files', file);
      await $fetch(`/api/projects/${selectedProjectId.value}/tasks`, { method: 'POST', body: form });
      closeTaskModalImmediately();
      await nextTick();
      Object.assign(taskForm, {
        title: '',
        description: '',
        columnId: backlogColumn.value?.id ?? '',
        placementId: defaultPlacementId.value,
        swimlaneId: defaultSwimlaneId.value,
        assigneeId: user.value?.id ?? UNASSIGNED_ID,
        agentEnabled: false,
        priority: 'normal',
        tags: [],
      });
      clearTaskFiles();
      await loadBoard(selectedProjectId.value);
    }
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const sendCommentAction = async () => {
  if (!selectedTaskId.value || !commentMessage.value.trim() || taskSubmitting.value) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  try {
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}/comments`, {
      method: 'POST',
      body: { body: commentMessage.value },
    });
    commentMessage.value = '';
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const requestFollowUpAction = async () => {
  if (!selectedTaskId.value || !selectedProjectId.value || taskSubmitting.value) return;
  if (!followUpMessage.value.trim() && !taskFiles.value.length) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  try {
    await $fetch(`/api/tasks/${selectedTaskId.value}`, {
      method: 'PATCH',
      body: { tags: taskForm.tags, assigneeId: taskAssigneeIdForRequest() },
    });
    if (taskFiles.value.length) {
      const attachmentForm = new FormData();
      for (const file of taskUploadFiles()) attachmentForm.append('files', file);
      await $fetch(`/api/tasks/${selectedTaskId.value}/attachments`, { method: 'POST', body: attachmentForm });
    }
    const body = followUpMessage.value.trim() || t.value.followUpFilesOnlyMessage;
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}/messages`, {
      method: 'POST',
      body: { body },
    });
    clearTaskFiles();
    followUpMessage.value = '';
    activeTaskTab.value = 'activity';
    await loadBoard(selectedProjectId.value);
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
    clearTaskFiles();
    taskMessage.value = '';
    commentMessage.value = '';
    followUpMessage.value = '';
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const moveTask = async (taskId: string, columnId: string, placement: TaskPlacement, beforeTaskId?: string) => {
  if (!selectedProjectId.value) return;
  if (beforeTaskId === taskId) {
    clearDragState();
    return;
  }
  const targetTasks = tasksForPlacementColumn(placement.oberthemaId, placement.unterthemaId, columnId).filter((task) => task.id !== taskId);
  const beforeIndex = beforeTaskId ? targetTasks.findIndex((task) => task.id === beforeTaskId) : -1;
  const beforeTask = beforeIndex >= 0 ? targetTasks[beforeIndex] : undefined;
  const position = beforeTask
    ? Math.floor(((targetTasks[beforeIndex - 1]?.position ?? 0) + beforeTask.position) / 2)
    : ((targetTasks.at(-1)?.position ?? 0) + 1000);
  await $fetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: { columnId, position, ...placement } });
  clearDragState();
  await loadBoard(selectedProjectId.value);
};

const taskDropPlacementKey = (columnId: string, placement: TaskPlacement) =>
  `${columnId}:${placement.oberthemaId}:${placement.unterthemaId ?? 'direct'}`;

const markColumnDropTarget = (columnId: string, placement: TaskPlacement) => {
  if (!draggedTaskId.value) return;
  dragOverPlacementKey.value = taskDropPlacementKey(columnId, placement);
  dragOverTaskId.value = null;
};

const markTaskDropTarget = (columnId: string, placement: TaskPlacement, taskId: string) => {
  if (!draggedTaskId.value) return;
  dragOverPlacementKey.value = taskDropPlacementKey(columnId, placement);
  dragOverTaskId.value = draggedTaskId.value === taskId ? null : taskId;
};

const leaveTaskDropCell = (event: DragEvent, placementKey: string) => {
  const cell = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (cell && nextTarget && cell.contains(nextTarget)) return;
  if (dragOverPlacementKey.value !== placementKey) return;
  dragOverPlacementKey.value = null;
  dragOverTaskId.value = null;
};

const clearDragState = () => {
  draggedTaskId.value = null;
  dragOverPlacementKey.value = null;
  dragOverTaskId.value = null;
};

const startTaskDrag = (taskId: string) => {
  clearHierarchyDragState();
  draggedTaskId.value = taskId;
};

const clearHierarchyDragState = () => {
  draggedOberthemaId.value = null;
  draggedUnterthemaId.value = null;
  hierarchyDragOverId.value = null;
};

const hierarchyDropAfter = (event: DragEvent) => {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return false;
  const bounds = target.getBoundingClientRect();
  return event.clientY > bounds.top + bounds.height / 2;
};

const startOberthemaDrag = (event: DragEvent, oberthemaId: string) => {
  clearDragState();
  draggedOberthemaId.value = oberthemaId;
  draggedUnterthemaId.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `oberthema:${oberthemaId}`);
  }
};

const startUnterthemaDrag = (event: DragEvent, unterthemaId: string) => {
  clearDragState();
  draggedUnterthemaId.value = unterthemaId;
  draggedOberthemaId.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `unterthema:${unterthemaId}`);
  }
};

const markHierarchyDropTarget = (event: DragEvent, targetId: string) => {
  if (!draggedOberthemaId.value && !draggedUnterthemaId.value) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  hierarchyDragOverId.value = targetId;
};

const hierarchyDragIdFromEvent = (event: DragEvent, kind: 'oberthema' | 'unterthema') => {
  const value = event.dataTransfer?.getData('text/plain') ?? '';
  return value.startsWith(`${kind}:`) ? value.slice(kind.length + 1) : null;
};

const persistHierarchyOrder = async () => {
  if (!selectedProjectId.value || !board.value || hierarchyReordering.value) return;
  hierarchyReordering.value = true;
  errorMessage.value = null;
  try {
    board.value = await $fetch<Board>(`/api/projects/${selectedProjectId.value}/hierarchy-order`, {
      method: 'PATCH',
      body: {
        oberthemaIds: board.value.oberthemen.map((topic) => topic.id),
        unterthemen: board.value.oberthemen.map((topic) => ({
          oberthemaId: topic.id,
          ids: unterthemenFor(topic.id).map((subtopic) => subtopic.id),
        })),
      },
    });
  } catch (error) {
    errorMessage.value = humanError(error);
    await loadBoard(selectedProjectId.value);
  } finally {
    hierarchyReordering.value = false;
    clearHierarchyDragState();
  }
};

const dropOnOberthema = async (event: DragEvent, targetOberthemaId: string) => {
  if (!board.value) return;
  const draggedTopicId = draggedOberthemaId.value ?? hierarchyDragIdFromEvent(event, 'oberthema');
  if (draggedTopicId) {
    const sourceId = draggedTopicId;
    if (sourceId === targetOberthemaId) {
      clearHierarchyDragState();
      return;
    }
    const reordered = board.value.oberthemen.filter((topic) => topic.id !== sourceId);
    const targetIndex = reordered.findIndex((topic) => topic.id === targetOberthemaId);
    const source = board.value.oberthemen.find((topic) => topic.id === sourceId);
    if (!source || targetIndex < 0) return;
    reordered.splice(targetIndex + (hierarchyDropAfter(event) ? 1 : 0), 0, source);
    board.value = { ...board.value, oberthemen: reordered };
    await persistHierarchyOrder();
    return;
  }

  const sourceId = draggedUnterthemaId.value ?? hierarchyDragIdFromEvent(event, 'unterthema');
  if (!sourceId) return;
  const source = board.value.unterthemen.find((subtopic) => subtopic.id === sourceId);
  if (!source) return;
  const remaining = board.value.unterthemen.filter((subtopic) => subtopic.id !== sourceId);
  const moved = { ...source, oberthemaId: targetOberthemaId };
  const nextSubtopics = board.value.oberthemen.flatMap((topic) => {
    const children = remaining.filter((subtopic) => subtopic.oberthemaId === topic.id);
    return topic.id === targetOberthemaId ? [...children, moved] : children;
  });
  board.value = {
    ...board.value,
    unterthemen: nextSubtopics,
    tasks: board.value.tasks.map((task) => task.unterthemaId === sourceId ? { ...task, oberthemaId: targetOberthemaId } : task),
  };
  await persistHierarchyOrder();
};

const dropOnUnterthema = async (event: DragEvent, targetOberthemaId: string, targetUnterthemaId: string) => {
  const draggedSubtopicId = draggedUnterthemaId.value ?? hierarchyDragIdFromEvent(event, 'unterthema');
  if (!board.value || !draggedSubtopicId || draggedSubtopicId === targetUnterthemaId) {
    clearHierarchyDragState();
    return;
  }
  const sourceId = draggedSubtopicId;
  const source = board.value.unterthemen.find((subtopic) => subtopic.id === sourceId);
  if (!source) return;
  const remaining = board.value.unterthemen.filter((subtopic) => subtopic.id !== sourceId);
  const moved = { ...source, oberthemaId: targetOberthemaId };
  const nextSubtopics = board.value.oberthemen.flatMap((topic) => {
    const children = remaining.filter((subtopic) => subtopic.oberthemaId === topic.id);
    if (topic.id !== targetOberthemaId) return children;
    const targetIndex = children.findIndex((subtopic) => subtopic.id === targetUnterthemaId);
    children.splice(targetIndex + (hierarchyDropAfter(event) ? 1 : 0), 0, moved);
    return children;
  });
  board.value = {
    ...board.value,
    unterthemen: nextSubtopics,
    tasks: board.value.tasks.map((task) => task.unterthemaId === sourceId ? { ...task, oberthemaId: targetOberthemaId } : task),
  };
  await persistHierarchyOrder();
};

const handlePaste = (event: ClipboardEvent) => {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) addTaskFiles(files);
};

const handleFileInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  addTaskFiles(input.files ? [...input.files] : []);
  input.value = '';
};

const handleFileDrop = (event: DragEvent) => {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) addTaskFiles(files);
};

const addTaskFiles = (files: File[]) => {
  const items: PendingTaskFile[] = files.map((file) => ({
    id: fileId(),
    file,
    url: URL.createObjectURL(file),
    annotation: { version: 1, strokes: [] },
    annotatedUrl: null,
    renderedFile: null,
  }));
  taskFiles.value = [...taskFiles.value, ...items];
};

function clearTaskFiles() {
  for (const item of taskFiles.value) {
    URL.revokeObjectURL(item.url);
    if (item.annotatedUrl) URL.revokeObjectURL(item.annotatedUrl);
  }
  taskFiles.value = [];
  selectedAnnotationPendingFile.value = null;
}

const taskUploadFiles = () => taskFiles.value.map((item) => item.renderedFile ?? item.file);

const fileId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const parseTagList = (value: string) => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of value.split(/[,;\n]/)) {
    const tag = rawTag.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 40);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
};

const toggleTaskTag = (tag: string) => {
  taskForm.tags = taskForm.tags.includes(tag)
    ? taskForm.tags.filter((item) => item !== tag)
    : [...taskForm.tags, tag];
};
const taskAssigneeIdForRequest = () => taskForm.assigneeId === UNASSIGNED_ID ? null : taskForm.assigneeId;

const isImageAttachment = (attachment: Attachment) => attachment.mimeType.startsWith('image/');
const isPendingImageFile = (item: PendingTaskFile) => item.file.type.startsWith('image/');

const columnName = (column: BoardColumn) => locale.value === 'de' ? column.nameDe : column.nameEn;
const oberthemaFor = (subtopic: Unterthema | null | undefined) => subtopic
  ? board.value?.oberthemen.find((topic) => topic.id === subtopic.oberthemaId) ?? null
  : null;
const unterthemaForTask = (task: Task) => board.value?.unterthemen.find((topic) => topic.id === task.unterthemaId) ?? null;
const oberthemaForTask = (task: Task) => board.value?.oberthemen.find((topic) => topic.id === task.oberthemaId) ?? null;
const taskHierarchyLabel = (task: Task) => {
  const topic = oberthemaForTask(task);
  const subtopic = unterthemaForTask(task);
  return [topic?.name, subtopic?.name ?? t.value.directTasks].filter(Boolean).join(' › ');
};
const unterthemenFor = (oberthemaId: string) => board.value?.unterthemen.filter((topic) => topic.oberthemaId === oberthemaId) ?? [];
const isRecentDoneTask = (task: Task) => boardClock.value - new Date(task.updatedAt).getTime() < DONE_RETENTION_MS;
const isTaskVisible = (task: Task) => {
  const column = board.value?.columns.find((item) => item.id === task.columnId);
  return !column?.done || showAllDone.value || isRecentDoneTask(task);
};
const visibleTasks = computed(() => (board.value?.tasks ?? []).filter(isTaskVisible));
const hiddenDoneCount = computed(() => (board.value?.tasks ?? []).filter((task) => {
  const column = board.value?.columns.find((item) => item.id === task.columnId);
  return column?.done && !isRecentDoneTask(task);
}).length);
const placementIdFor = (placement: Pick<TaskPlacement, 'oberthemaId' | 'unterthemaId'>) => placement.unterthemaId
  ? `unterthema:${placement.unterthemaId}`
  : `oberthema:${placement.oberthemaId}`;
const parsePlacementId = (value: string): TaskPlacement => {
  const [kind, id] = value.split(':', 2);
  if (kind === 'unterthema') {
    const subtopic = board.value?.unterthemen.find((topic) => topic.id === id);
    if (subtopic) return { oberthemaId: subtopic.oberthemaId, unterthemaId: subtopic.id };
  }
  const topic = board.value?.oberthemen.find((item) => item.id === id);
  if (kind === 'oberthema' && topic) return { oberthemaId: topic.id, unterthemaId: null };
  const fallback = board.value?.oberthemen[0];
  if (!fallback) throw new Error('missing_oberthema');
  return { oberthemaId: fallback.id, unterthemaId: null };
};
const taskCountForUnterthema = (unterthemaId: string) => visibleTasks.value.filter((task) => task.unterthemaId === unterthemaId).length;
const taskCountForOberthema = (oberthemaId: string) => visibleTasks.value.filter((task) => task.oberthemaId === oberthemaId).length;
const doneCountForOberthema = (oberthemaId: string) => {
  const doneColumnId = board.value?.columns.find((column) => column.done)?.id;
  return visibleTasks.value.filter((task) => task.oberthemaId === oberthemaId && task.columnId === doneColumnId).length;
};
const doneCountForUnterthema = (unterthemaId: string) => {
  const doneColumnId = board.value?.columns.find((column) => column.done)?.id;
  return visibleTasks.value.filter((task) => task.unterthemaId === unterthemaId && task.columnId === doneColumnId).length;
};
const completionPercent = (done: number, total: number) => total ? Math.round((done / total) * 100) : 0;
const topicAccent = (topic: Oberthema | null) => ({
  teal: '#0f9f92',
  coral: '#ef6a55',
  amber: '#d99518',
  indigo: '#6470d9',
  emerald: '#29936f',
}[topic?.color ?? 'teal'] ?? '#0f9f92');
const tasksForColumn = (columnId: string) =>
  [...visibleTasks.value.filter((task) => task.columnId === columnId)].sort((a, b) => a.position - b.position);
const tasksForPlacementColumn = (oberthemaId: string, unterthemaId: string | null, columnId: string) =>
  tasksForColumn(columnId).filter((task) => task.oberthemaId === oberthemaId && task.unterthemaId === unterthemaId);
const tasksForOberthemaColumn = (oberthemaId: string, columnId: string) =>
  tasksForColumn(columnId).filter((task) => task.oberthemaId === oberthemaId);
const hierarchyRowsFor = (oberthemaId: string) => [
  {
    key: `direct-${oberthemaId}`,
    label: t.value.directTasks,
    description: t.value.oberthema,
    oberthemaId,
    unterthemaId: null as string | null,
    subtopic: null as Unterthema | null,
    collapsed: false,
  },
  ...unterthemenFor(oberthemaId).map((subtopic) => ({
    key: subtopic.id,
    label: subtopic.name,
    description: subtopic.description ?? t.value.unterthema,
    oberthemaId,
    unterthemaId: subtopic.id as string | null,
    subtopic,
    collapsed: collapsedUnterthemaIds.value.includes(subtopic.id),
  })),
];

const columnIcon = (column: BoardColumn) => ({
  backlog: 'i-lucide-inbox',
  todo: 'i-lucide-list-todo',
  in_progress: 'i-lucide-loader-circle',
  in_review: 'i-lucide-scan-search',
  done: 'i-lucide-circle-check',
}[column.key] ?? 'i-lucide-columns-3');

const assigneeForTask = (task: Task) => board.value?.members.find((member) => member.id === task.assigneeId) ?? null;
const taskAssigneeLabel = (task: Task) => assigneeForTask(task)?.name ?? t.value.unassigned;
const taskCardLabel = (task: Task) => [task.key, task.title, taskHierarchyLabel(task), `${t.value.assignee}: ${taskAssigneeLabel(task)}`].filter(Boolean).join(' · ');
const plainTextDescription = (value: string | null) => (value ?? '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/^\s*(?:[-*+] |\d+\. )/gm, '')
  .replace(/[*_~`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

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

const latestTextUpdate = (events: TaskEvent[]) => {
  for (const event of [...events].reverse()) {
    if (event.action !== 'codex_text_update') continue;
    const body = metadataString(parseMetadata(event.metadata).body);
    if (body) return { body, createdAt: event.createdAt };
  }
  return null;
};

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

const parseAnnotationData = (value?: string | null): AnnotationData => {
  if (!value) return { version: 1, strokes: [] };
  try {
    const parsed = JSON.parse(value) as Partial<AnnotationData>;
    if (parsed.version !== 1 || !Array.isArray(parsed.strokes)) return { version: 1, strokes: [] };
    const strokes = parsed.strokes
      .map((stroke) => ({
        color: typeof stroke.color === 'string' ? stroke.color : '#ef4444',
        width: typeof stroke.width === 'number' && Number.isFinite(stroke.width) ? Math.min(Math.max(stroke.width, 1), 24) : 5,
        points: Array.isArray(stroke.points)
          ? stroke.points
            .map((point) => ({
              x: typeof point.x === 'number' && Number.isFinite(point.x) ? Math.min(Math.max(point.x, 0), 1) : 0,
              y: typeof point.y === 'number' && Number.isFinite(point.y) ? Math.min(Math.max(point.y, 0), 1) : 0,
            }))
            .filter((point) => point.x >= 0 && point.y >= 0)
          : [],
      }))
      .filter((stroke) => stroke.points.length > 0);
    return { version: 1, strokes };
  } catch {
    return { version: 1, strokes: [] };
  }
};

const openAnnotationEditor = async (attachment: Attachment) => {
  selectedAnnotationAttachment.value = attachment;
  selectedAnnotationPendingFile.value = null;
  annotationData.value = parseAnnotationData(attachment.annotation?.data);
  drawingStroke.value = null;
  annotationModalOpen.value = true;
  await nextTick();
  if (annotationImageEl.value?.complete) onAnnotationImageLoad();
};

const openPendingAnnotationEditor = async (item: PendingTaskFile) => {
  if (!isPendingImageFile(item)) return;
  selectedAnnotationAttachment.value = null;
  selectedAnnotationPendingFile.value = item;
  annotationData.value = cloneAnnotationData(item.annotation);
  drawingStroke.value = null;
  annotationModalOpen.value = true;
  await nextTick();
  if (annotationImageEl.value?.complete) onAnnotationImageLoad();
};

const onAnnotationImageLoad = () => {
  resizeAnnotationCanvas();
  redrawAnnotationCanvas();
};

const resizeAnnotationCanvas = () => {
  const canvas = annotationCanvas.value;
  const image = annotationImageEl.value;
  if (!canvas || !image) return;
  const rect = image.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
};

const redrawAnnotationCanvas = () => {
  const canvas = annotationCanvas.value;
  const image = annotationImageEl.value;
  if (!canvas || !image) return;
  const rect = image.getBoundingClientRect();
  const context = canvas.getContext('2d');
  if (!context) return;
  const dpr = window.devicePixelRatio || 1;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of [...annotationData.value.strokes, ...(drawingStroke.value ? [drawingStroke.value] : [])]) {
    drawStroke(context, stroke, rect.width, rect.height, 1);
  }
};

const drawStroke = (
  context: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  width: number,
  height: number,
  lineScale: number,
) => {
  if (!stroke.points.length) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width * lineScale;
  context.beginPath();
  const firstPoint = stroke.points[0];
  if (!firstPoint) return;
  context.moveTo(firstPoint.x * width, firstPoint.y * height);
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x * width, point.y * height);
  }
  context.stroke();
};

const annotationPointerPosition = (event: PointerEvent): AnnotationPoint | null => {
  const canvas = annotationCanvas.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
    y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
  };
};

const startAnnotationStroke = (event: PointerEvent) => {
  const point = annotationPointerPosition(event);
  if (!point) return;
  try {
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  } catch {
    // Synthetic tests and some touch handoffs can start without capturable pointers.
  }
  drawingStroke.value = {
    color: annotationColor.value,
    width: annotationWidth.value,
    points: [point],
  };
  redrawAnnotationCanvas();
};

const moveAnnotationStroke = (event: PointerEvent) => {
  const point = annotationPointerPosition(event);
  if (!point || !drawingStroke.value) return;
  drawingStroke.value.points = [...drawingStroke.value.points, point];
  redrawAnnotationCanvas();
};

const finishAnnotationStroke = (event: PointerEvent) => {
  if (!drawingStroke.value) return;
  try {
    (event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can already be released if the pointer leaves the canvas.
  }
  if (drawingStroke.value.points.length > 1) {
    annotationData.value = {
      version: 1,
      strokes: [...annotationData.value.strokes, drawingStroke.value],
    };
  }
  drawingStroke.value = null;
  redrawAnnotationCanvas();
};

const undoAnnotationStroke = () => {
  annotationData.value = {
    version: 1,
    strokes: annotationData.value.strokes.slice(0, -1),
  };
  redrawAnnotationCanvas();
};

const clearAnnotationStrokes = () => {
  annotationData.value = { version: 1, strokes: [] };
  drawingStroke.value = null;
  redrawAnnotationCanvas();
};

const saveAnnotationAction = async () => {
  if (annotationSubmitting.value) return;
  const image = annotationImageEl.value;
  if (!image) return;
  annotationSubmitting.value = true;
  errorMessage.value = null;
  try {
    const renderedImage = renderAnnotatedImage(image);
    if (selectedAnnotationPendingFile.value) {
      const pendingId = selectedAnnotationPendingFile.value.id;
      const renderedFile = await dataUrlToFile(renderedImage, annotatedFileName(selectedAnnotationPendingFile.value.file.name));
      taskFiles.value = taskFiles.value.map((item) => {
        if (item.id !== pendingId) return item;
        if (item.annotatedUrl) URL.revokeObjectURL(item.annotatedUrl);
        return {
          ...item,
          annotation: cloneAnnotationData(annotationData.value),
          annotatedUrl: URL.createObjectURL(renderedFile),
          renderedFile,
        };
      });
      selectedAnnotationPendingFile.value = taskFiles.value.find((item) => item.id === pendingId) ?? null;
      annotationModalOpen.value = false;
      return;
    }
    if (!selectedTaskId.value || !selectedProjectId.value || !selectedAnnotationAttachment.value) return;
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}/attachments/${selectedAnnotationAttachment.value.id}/annotation`, {
      method: 'POST',
      body: {
        annotationData: annotationData.value,
        renderedImage,
      },
    });
    await loadBoard(selectedProjectId.value);
    const updatedAttachment = selectedTaskDetail.value.task.attachments.find((attachment) => attachment.id === selectedAnnotationAttachment.value?.id);
    selectedAnnotationAttachment.value = updatedAttachment ?? null;
    annotationModalOpen.value = false;
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    annotationSubmitting.value = false;
  }
};

const renderAnnotatedImage = (image: HTMLImageElement) => {
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('annotation_canvas_unavailable');
  context.drawImage(image, 0, 0, width, height);
  const displayed = annotationImageEl.value?.getBoundingClientRect();
  const displayScale = displayed?.width ? width / displayed.width : 1;
  for (const stroke of annotationData.value.strokes) {
    drawStroke(context, stroke, width, height, Math.max(displayScale, 1));
  }
  return canvas.toDataURL('image/png');
};

const cloneAnnotationData = (data: AnnotationData): AnnotationData => ({
  version: 1,
  strokes: data.strokes.map((stroke) => ({
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({ ...point })),
  })),
});

const dataUrlToFile = async (dataUrl: string, fileName: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: 'image/png' });
};

const annotatedFileName = (fileName: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'image';
  return `${baseName}-annotated.png`;
};

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
    missing_todo_column: { en: 'The board is missing its work queue.', de: 'Dem Board fehlt die Bearbeitungs-Warteschlange.' },
    invalid_column: { en: 'Please choose a valid board area.', de: 'Bitte wähle einen gültigen Board-Bereich.' },
    invalid_assignee: { en: 'Choose a responsible person from this project or nobody.', de: 'Wähle eine verantwortliche Person aus diesem Projekt oder niemanden.' },
    invalid_project_key: { en: 'Please use a short project key with letters and numbers.', de: 'Bitte verwende ein kurzes Projektkürzel mit Buchstaben und Zahlen.' },
    oberthema_not_found: { en: 'The parent topic could not be found.', de: 'Das Oberthema wurde nicht gefunden.' },
    unterthema_not_found: { en: 'The sub-topic could not be found.', de: 'Das Unterthema wurde nicht gefunden.' },
    invalid_unterthema: { en: 'Please choose a sub-topic from this project.', de: 'Bitte wähle ein Unterthema dieses Projekts.' },
    invalid_oberthema: { en: 'A sub-topic can only be moved inside its project.', de: 'Ein Unterthema kann nur innerhalb seines Projekts verschoben werden.' },
    missing_unterthema: { en: 'Create a sub-topic before adding tasks.', de: 'Erstelle ein Unterthema, bevor du Aufgaben hinzufügst.' },
    oberthema_name_exists: { en: 'A parent topic with this name already exists.', de: 'Ein Oberthema mit diesem Namen existiert bereits.' },
    unterthema_name_exists: { en: 'A sub-topic with this name already exists in this parent topic.', de: 'Ein Unterthema mit diesem Namen existiert in diesem Oberthema bereits.' },
    oberthema_not_empty: { en: 'Move or delete its tasks before deleting this parent topic.', de: 'Verschiebe oder lösche die Aufgaben, bevor du dieses Oberthema löschst.' },
    unterthema_not_empty: { en: 'Move or delete its tasks before deleting this sub-topic.', de: 'Verschiebe oder lösche die Aufgaben, bevor du dieses Unterthema löschst.' },
  };
  return messages[key]?.[locale.value] ?? label('The action could not be completed.', 'Die Aktion konnte nicht abgeschlossen werden.');
};
</script>

<template>
  <div class="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 ak-grid-bg">
    <section v-if="!user" class="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10 sm:px-6">
      <div class="absolute inset-0 ak-login-surface" />
      <div class="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-teal-100 bg-white/95 shadow-2xl shadow-teal-950/12 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 lg:grid-cols-[1.05fr_0.95fr]">
        <div class="relative hidden min-h-[620px] overflow-hidden bg-teal-50/90 p-10 text-zinc-950 dark:bg-zinc-950 dark:text-white lg:flex lg:flex-col lg:justify-between">
          <div class="absolute inset-0 ak-login-panel" />
          <div class="relative">
            <div class="mb-8 flex items-center gap-3">
              <div class="grid size-11 place-items-center rounded-xl bg-teal-600 text-white shadow-lg shadow-teal-700/20">
                <UIcon name="i-lucide-kanban-square" class="size-5" />
              </div>
              <div class="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-teal-800 shadow-sm dark:border-white/10 dark:bg-white/8 dark:text-teal-100">
                <span class="size-2 rounded-full bg-teal-500 dark:bg-teal-300" />
                {{ t.loginStatus }}
              </div>
            </div>
            <h1 class="max-w-md text-4xl font-semibold leading-tight tracking-tight">{{ t.app }}</h1>
            <p class="mt-4 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ t.loginCopy }}</p>
          </div>
          <div class="ak-login-preview relative grid gap-3 rounded-2xl border border-teal-200/80 bg-white/75 p-4 shadow-xl shadow-teal-900/10 backdrop-blur-sm dark:border-white/10 dark:bg-white/8 dark:shadow-black/30">
            <div class="grid grid-cols-3 gap-2">
              <div class="h-28 rounded-xl border border-teal-100 bg-teal-50/80 p-2 dark:border-white/10 dark:bg-white/10">
                <div class="mb-2 h-2 w-14 rounded-full bg-teal-500/75" />
                <div class="space-y-1.5">
                  <div class="h-8 rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-white/12" />
                  <div class="h-8 rounded-lg border border-zinc-200/70 bg-white/80 dark:border-white/10 dark:bg-white/8" />
                </div>
              </div>
              <div class="h-28 rounded-xl border border-amber-100 bg-amber-50/70 p-2 dark:border-white/10 dark:bg-white/10">
                <div class="mb-2 h-2 w-16 rounded-full bg-amber-400/85" />
                <div class="space-y-1.5">
                  <div class="h-8 rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-white/14" />
                  <div class="h-8 rounded-lg border border-zinc-200/70 bg-white/80 dark:border-white/10 dark:bg-white/8" />
                </div>
              </div>
              <div class="h-28 rounded-xl border border-emerald-100 bg-emerald-50/70 p-2 dark:border-white/10 dark:bg-white/10">
                <div class="mb-2 h-2 w-12 rounded-full bg-emerald-500/70" />
                <div class="space-y-1.5">
                  <div class="h-8 rounded-lg border border-zinc-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-white/12" />
                  <div class="h-8 rounded-lg border border-zinc-200/70 bg-white/80 dark:border-white/10 dark:bg-white/8" />
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-xl border border-teal-200/80 bg-teal-50/80 p-3 dark:border-white/10 dark:bg-black/20">
              <UIcon name="i-lucide-shield-check" class="size-5 text-teal-700 dark:text-teal-200" />
              <p class="text-sm leading-5 text-teal-950/75 dark:text-zinc-200">{{ t.loginStatusDetail }}</p>
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
          <UButton block class="shadow-lg shadow-teal-700/15" size="xl" type="submit" icon="i-lucide-log-in">{{ t.login }}</UButton>
        </form>
      </div>
    </section>

    <div v-else class="flex min-h-screen">
      <button
        v-if="!sidebarCollapsed"
        class="fixed inset-0 z-30 bg-zinc-950/35 backdrop-blur-[1px] md:hidden"
        :aria-label="t.closeSidebar"
        @click="sidebarCollapsed = true"
      />
      <aside
        class="ak-sidebar sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-zinc-200/80 bg-white/95 shadow-xl shadow-zinc-950/5 transition-[width,padding] duration-200 max-md:fixed max-md:inset-y-0 max-md:left-0 dark:border-zinc-800 dark:bg-zinc-950/95"
        :class="sidebarCollapsed ? 'w-[76px] p-3 max-md:w-[72px]' : 'w-[320px] p-4 max-md:w-[min(320px,86vw)]'"
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
            <div
              v-for="project in projects"
              :key="project.id"
              class="overflow-hidden rounded-xl border transition"
              :class="project.id === selectedProjectId && activeView === 'board'
                ? 'border-teal-500/40 bg-white shadow-lg shadow-teal-950/5 dark:bg-zinc-900'
                : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'"
            >
              <button
                class="group w-full text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
                :class="sidebarCollapsed ? 'grid h-11 place-items-center p-0' : 'p-3'"
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

              <div v-if="!sidebarCollapsed && project.id === selectedProjectId && board" class="border-t border-zinc-200 p-2 dark:border-zinc-800">
                <div class="mb-1 flex items-center justify-between px-2 py-1.5">
                  <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{{ t.hierarchy }}</p>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="t.newOberthema" @click.stop="openOberthemaModal()" />
                </div>
                <button
                  class="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition"
                  :class="!selectedOberthemaId ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
                  @click="selectProjectOverview"
                >
                  <UIcon name="i-lucide-layout-dashboard" class="size-3.5" />
                  <span class="min-w-0 flex-1 truncate">{{ t.allTasks }}</span>
                  <span class="text-[10px] opacity-70">{{ boardStats.tasks }}</span>
                </button>

                <div v-for="topic in board.oberthemen" :key="topic.id" class="mb-1">
                  <div
                    class="group flex items-center rounded-lg border pr-1 transition"
                    :class="selectedOberthemaId === topic.id ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800' : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/60'"
                  >
                    <button
                      class="grid size-8 shrink-0 place-items-center rounded-md"
                      :aria-label="collapsedOberthemaIds.includes(topic.id) ? t.expandTopic : t.collapseTopic"
                      :aria-expanded="!collapsedOberthemaIds.includes(topic.id)"
                      @click="toggleOberthemaExpanded(topic.id)"
                    >
                      <UIcon :name="collapsedOberthemaIds.includes(topic.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3.5 text-zinc-400" />
                    </button>
                    <button class="min-w-0 flex-1 rounded-md py-2 text-left" :aria-current="selectedOberthemaId === topic.id ? 'page' : undefined" @click="selectOberthema(topic.id)">
                      <span class="flex items-center gap-2 truncate text-xs font-semibold">
                        <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: topicAccent(topic) }" />
                        <span class="truncate">{{ topic.name }}</span>
                      </span>
                      <span class="block text-[10px] text-zinc-400">{{ taskCountForOberthema(topic.id) }} {{ t.tasks }}</span>
                    </button>
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="t.newUnterthema" @click.stop="openUnterthemaModal(topic.id)" />
                  </div>
                  <div v-if="!collapsedOberthemaIds.includes(topic.id)" class="ml-4 border-l border-zinc-200 pl-2 dark:border-zinc-700">
                    <button
                      v-for="subtopic in unterthemenFor(topic.id)"
                      :key="subtopic.id"
                      class="my-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition"
                      :class="selectedUnterthemaId === subtopic.id ? 'bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-200' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'"
                      :aria-current="selectedUnterthemaId === subtopic.id ? 'page' : undefined"
                      @click="selectUnterthema(subtopic.id)"
                    >
                      <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: topicAccent(topic) }" />
                      <span class="min-w-0 flex-1 truncate">{{ subtopic.name }}</span>
                      <span class="text-[10px] opacity-70">{{ taskCountForUnterthema(subtopic.id) }}</span>
                    </button>
                    <p v-if="!unterthemenFor(topic.id).length" class="px-2 py-2 text-[11px] leading-4 text-zinc-400">{{ t.noUnterthemen }}</p>
                  </div>
                </div>
                <p v-if="!board.oberthemen.length" class="px-2 py-3 text-xs text-zinc-400">{{ t.noOberthemen }}</p>
              </div>
            </div>
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

      <main class="ak-main min-w-0 flex-1 p-4 transition-[margin] duration-200 max-md:w-full lg:p-5" :class="sidebarCollapsed ? 'max-md:ml-[72px]' : ''">
        <header class="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 pb-3 dark:border-zinc-800">
          <div class="flex min-w-0 items-center gap-3">
            <UBadge variant="soft" color="neutral">{{ activeView === 'board' ? selectedProject?.key ?? t.workspace : t.admin }}</UBadge>
            <div class="min-w-0">
              <h1 class="ak-display truncate text-xl font-semibold tracking-tight">
                {{ activeView === 'board' ? scopeTitle : activeView === 'projects' ? t.projects : t.users }}
              </h1>
              <p class="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {{ activeView === 'board' ? scopeDescription : activeView === 'projects' ? t.projectTableHint : t.userTableHint }}
              </p>
            </div>
          </div>
          <div v-if="activeView === 'board'" class="flex flex-wrap gap-2">
            <UBadge color="neutral" variant="soft">{{ boardStats.columns }} {{ t.columns }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ boardStats.tasks }} {{ t.tasks }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ boardStats.oberthemen }} {{ t.oberthemen }}</UBadge>
            <UBadge color="neutral" variant="soft">{{ boardStats.unterthemen }} {{ t.unterthemen }}</UBadge>
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

        <section v-else-if="board" class="grid gap-3">
          <div class="ak-scope-panel flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span class="inline-flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-100">
                <span class="grid size-7 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                  <UIcon name="i-lucide-layout-panel-top" class="size-4" />
                </span>
                {{ t.hierarchy }}
              </span>
              <span class="text-zinc-500 dark:text-zinc-400">{{ boardStats.oberthemen }} {{ t.oberthemen }} · {{ boardStats.unterthemen }} {{ t.unterthemen }}</span>
              <span class="hidden items-center gap-1.5 text-zinc-400 lg:inline-flex">
                <UIcon name="i-lucide-grip-vertical" class="size-3.5" />
                {{ t.hierarchyReorderHint }}
              </span>
              <span v-if="hiddenDoneCount && !showAllDone" class="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                <UIcon name="i-lucide-archive" class="size-3.5" />
                {{ hiddenDoneCount }} {{ t.completedHidden }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :icon="showAllDone ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  @click="toggleCompletedVisibility"
                >
                  {{ showAllDone ? t.hideCompleted : t.showCompleted }}
                  <UBadge v-if="hiddenDoneCount" color="neutral" variant="soft">{{ hiddenDoneCount }}</UBadge>
                </UButton>
                <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-network" @click="openOberthemaModal()">
                  {{ t.newOberthema }}
                </UButton>
                <UButton size="sm" icon="i-lucide-plus" :disabled="!board.oberthemen.length" @click="openTaskModal(backlogColumn?.id)">
                  {{ t.newTask }}
                </UButton>
            </div>
          </div>

          <div v-if="board.oberthemen.length" class="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div
              class="grid"
              :style="{
                gridTemplateColumns: `250px repeat(${board.columns.length}, minmax(230px, 1fr))`,
                minWidth: `${250 + board.columns.length * 230}px`,
              }"
            >
              <div class="sticky left-0 top-0 z-30 flex min-h-16 items-center border-b border-r border-teal-100 bg-teal-50/95 px-3 text-teal-950 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100">
                <div>
                  <p class="text-sm font-semibold">{{ t.hierarchy }}</p>
                  <p class="mt-0.5 text-[11px] text-teal-700/70 dark:text-zinc-400">{{ boardStats.oberthemen }} + {{ boardStats.unterthemen }}</p>
                </div>
              </div>
              <div
                v-for="column in board.columns"
                :key="`header-${column.id}`"
                :data-column-id="column.id"
                :data-column-key="column.key"
                class="sticky top-0 z-20 min-h-16 border-b border-r border-zinc-200 bg-zinc-100/95 px-3 py-2 text-zinc-900 backdrop-blur last:border-r-0 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="flex items-center gap-2 text-sm font-semibold">
                      <UIcon :name="columnIcon(column)" class="size-4 text-zinc-500 dark:text-zinc-400" :class="column.key === 'in_progress' ? 'ak-spin-when-active' : ''" />
                      {{ columnName(column) }}
                    </p>
                    <p v-if="column.key === 'todo'" class="mt-0.5 text-[10px] leading-4 text-amber-700 dark:text-amber-300">{{ t.todoAutomationShort }}</p>
                    <p v-else class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{{ tasksForColumn(column.id).length }} {{ t.tasks }}</p>
                  </div>
                  <span class="grid size-7 place-items-center rounded-lg border border-zinc-200 bg-white text-xs font-semibold shadow-sm dark:border-zinc-700 dark:bg-zinc-800">{{ tasksForColumn(column.id).length }}</span>
                </div>
              </div>

              <template v-for="topic in board.oberthemen" :key="topic.id">
                <div
                  :id="`topic-${topic.id}`"
                  :data-topic-id="topic.id"
                  :data-topic-order="board.oberthemen.findIndex((item) => item.id === topic.id)"
                  class="sticky left-0 z-10 flex min-h-16 items-center gap-1.5 border-b border-r border-zinc-200 bg-zinc-100 px-2.5 py-2 transition dark:border-zinc-800 dark:bg-zinc-900"
                  :class="[
                    selectedOberthemaId === topic.id ? 'ring-2 ring-inset ring-teal-500/50' : '',
                    hierarchyDragOverId === `oberthema:${topic.id}` ? 'ak-hierarchy-drop-target' : '',
                    draggedOberthemaId === topic.id ? 'opacity-45' : '',
                  ]"
                  @dragover.prevent="markHierarchyDropTarget($event, `oberthema:${topic.id}`)"
                  @dragenter.prevent="markHierarchyDropTarget($event, `oberthema:${topic.id}`)"
                  @drop.prevent.stop="dropOnOberthema($event, topic.id)"
                >
                  <button
                    type="button"
                    draggable="true"
                    class="ak-hierarchy-drag-handle grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    :aria-label="`${t.moveOberthema}: ${topic.name}`"
                    :title="t.hierarchyReorderHint"
                    @click.stop.prevent
                    @dragstart.stop="startOberthemaDrag($event, topic.id)"
                    @dragend.stop="clearHierarchyDragState"
                  >
                    <UIcon name="i-lucide-grip-vertical" class="size-4" />
                  </button>
                  <button
                    type="button"
                    class="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-white dark:hover:bg-zinc-800"
                    :aria-label="collapsedOberthemaIds.includes(topic.id) ? t.expandTopic : t.collapseTopic"
                    :aria-expanded="!collapsedOberthemaIds.includes(topic.id)"
                    @click="toggleOberthemaExpanded(topic.id)"
                  >
                    <UIcon :name="collapsedOberthemaIds.includes(topic.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-4" />
                  </button>
                  <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: topicAccent(topic) }" />
                  <button type="button" class="min-w-0 flex-1 text-left" @click="selectOberthema(topic.id)">
                    <span class="block truncate text-sm font-semibold">{{ topic.name }}</span>
                    <span class="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ taskCountForOberthema(topic.id) }} {{ t.tasks }}</span>
                  </button>
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t.editOberthema" @click.stop="openOberthemaModal(topic)" />
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="t.newUnterthema" @click.stop="openUnterthemaModal(topic.id)" />
                </div>
                <div
                  v-for="column in board.columns"
                  :key="`${topic.id}-summary-${column.id}`"
                  class="flex min-h-16 items-center justify-between border-b border-r border-zinc-200 bg-zinc-100 px-3 last:border-r-0 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span class="text-xs font-medium text-zinc-500 dark:text-zinc-400">{{ columnName(column) }}</span>
                  <span class="grid size-8 place-items-center rounded-lg bg-white text-sm font-semibold shadow-sm dark:bg-zinc-800">
                    {{ tasksForOberthemaColumn(topic.id, column.id).length }}
                  </span>
                </div>

                <template v-if="!collapsedOberthemaIds.includes(topic.id)">
                  <template v-for="row in hierarchyRowsFor(topic.id)" :key="row.key">
                    <div
                      :id="row.subtopic ? `subtopic-${row.subtopic.id}` : undefined"
                      :data-subtopic-id="row.subtopic?.id"
                      class="sticky left-0 z-10 flex min-h-20 items-start gap-1.5 border-b border-r border-zinc-200 bg-white px-2.5 py-2.5 transition dark:border-zinc-800 dark:bg-zinc-950"
                      :class="[
                        row.subtopic && selectedUnterthemaId === row.subtopic.id ? 'ring-2 ring-inset ring-teal-500/40' : '',
                        row.subtopic && hierarchyDragOverId === `unterthema:${row.subtopic.id}` ? 'ak-hierarchy-drop-target' : '',
                        row.subtopic && draggedUnterthemaId === row.subtopic.id ? 'opacity-45' : '',
                      ]"
                      @dragover.prevent="row.subtopic && markHierarchyDropTarget($event, `unterthema:${row.subtopic.id}`)"
                      @dragenter.prevent="row.subtopic && markHierarchyDropTarget($event, `unterthema:${row.subtopic.id}`)"
                      @drop.prevent.stop="row.subtopic && dropOnUnterthema($event, topic.id, row.subtopic.id)"
                    >
                      <button
                        v-if="row.subtopic"
                        type="button"
                        draggable="true"
                        class="ak-hierarchy-drag-handle grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                        :aria-label="`${t.moveUnterthema}: ${row.subtopic.name}`"
                        :title="t.hierarchyReorderHint"
                        @click.stop.prevent
                        @dragstart.stop="startUnterthemaDrag($event, row.subtopic.id)"
                        @dragend.stop="clearHierarchyDragState"
                      >
                        <UIcon name="i-lucide-grip-vertical" class="size-4" />
                      </button>
                      <button
                        v-if="row.subtopic"
                        type="button"
                        class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        :aria-label="row.collapsed ? t.expandSubtopic : t.collapseSubtopic"
                        :aria-expanded="!row.collapsed"
                        @click="toggleUnterthemaExpanded(row.subtopic.id)"
                      >
                        <UIcon :name="row.collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3.5 text-zinc-400" />
                      </button>
                      <span v-else class="mt-0.5 grid size-7 shrink-0 place-items-center">
                        <UIcon name="i-lucide-corner-down-right" class="size-3.5 text-zinc-400" />
                      </span>
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left"
                        @click="row.subtopic ? selectUnterthema(row.subtopic.id) : selectOberthema(topic.id)"
                      >
                        <span class="block truncate text-sm font-medium">{{ row.label }}</span>
                        <span class="mt-1 block line-clamp-2 text-[11px] leading-4 text-zinc-400">{{ row.description }}</span>
                      </button>
                      <UButton v-if="row.subtopic" size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="t.editUnterthema" @click.stop="openUnterthemaModal(topic.id, row.subtopic)" />
                      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="t.newTask" @click.stop="openTaskModal(backlogColumn?.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })" />
                    </div>

                    <div
                      v-for="column in board.columns"
                      :key="`${row.key}-${column.id}`"
                      :data-drop-column-id="column.id"
                      :data-drop-column-key="column.key"
                      :data-drop-oberthema-id="topic.id"
                      :data-drop-unterthema-id="row.unterthemaId ?? ''"
                      class="ak-task-drop-cell relative min-h-24 border-b border-r border-zinc-200 bg-zinc-50/60 p-2.5 transition-colors last:border-r-0 dark:border-zinc-800 dark:bg-zinc-900/30"
                      :class="draggedTaskId && dragOverPlacementKey === taskDropPlacementKey(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }) ? 'ak-task-drop-cell-active' : ''"
                      @dragover.prevent="markColumnDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                      @dragenter.prevent="markColumnDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                      @dragleave="leaveTaskDropCell($event, taskDropPlacementKey(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }))"
                      @drop.prevent="draggedTaskId && moveTask(draggedTaskId, column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                    >
                      <div v-if="row.collapsed" class="flex h-full min-h-16 items-center justify-center">
                        <span class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          {{ tasksForPlacementColumn(topic.id, row.unterthemaId, column.id).length }} {{ t.tasks }}
                        </span>
                      </div>
                      <div v-else class="grid gap-2.5">
                        <template v-for="task in tasksForPlacementColumn(topic.id, row.unterthemaId, column.id)" :key="task.id">
                          <div class="ak-task-card-slot relative">
                            <div
                              v-if="draggedTaskId && dragOverTaskId === task.id"
                              class="ak-task-insertion-marker pointer-events-none absolute z-10 flex items-center"
                              aria-hidden="true"
                            >
                              <span class="ak-task-insertion-label inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                                <UIcon name="i-lucide-move-down" class="size-3" />
                                {{ t.dropHere }}
                              </span>
                            </div>
                            <UCard
                              :data-task-id="task.id"
                              :data-task-key="task.key"
                              :data-agent-enabled="String(task.agentEnabled)"
                              :data-assignee-id="task.assigneeId ?? ''"
                              class="ak-task-card cursor-pointer overflow-hidden"
                              :style="{ '--task-accent': topicAccent(topic) }"
                              :class="{
                                'opacity-80 ring-1 ring-amber-300 dark:ring-amber-700': task.agentStatus === 'running',
                                'opacity-50': draggedTaskId === task.id,
                              }"
                              :ui="{ body: 'p-3 sm:p-3' }"
                              role="button"
                              tabindex="0"
                              :aria-label="taskCardLabel(task)"
                              draggable="true"
                              @click="openTaskDetail(task)"
                              @keydown.enter.prevent="openTaskDetail(task)"
                              @keydown.space.prevent="openTaskDetail(task)"
                              @dragover.prevent.stop="markTaskDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }, task.id)"
                              @dragenter.prevent.stop="markTaskDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }, task.id)"
                              @dragstart="startTaskDrag(task.id)"
                              @dragend="clearDragState"
                              @drop.stop.prevent="draggedTaskId && moveTask(draggedTaskId, column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }, task.id)"
                            >
                              <div class="mb-2 flex items-center justify-between gap-2">
                                <UBadge variant="subtle" color="neutral" class="shrink-0 whitespace-nowrap">{{ task.key }}</UBadge>
                                <span
                                  class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                                  :class="task.agentEnabled ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'"
                                >
                                  <UIcon :name="task.agentEnabled ? 'i-lucide-sparkles' : 'i-lucide-user-round'" class="size-3" />
                                  {{ task.agentEnabled ? t.aiTask : t.humanTask }}
                                </span>
                              </div>
                              <h3 class="text-sm font-semibold leading-snug">{{ task.title }}</h3>
                              <p v-if="task.description" class="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ plainTextDescription(task.description) }}</p>
                              <div class="mt-3 flex flex-wrap gap-1.5">
                                <UBadge
                                  color="neutral"
                                  variant="soft"
                                  :icon="task.assigneeId ? 'i-lucide-user-round-check' : 'i-lucide-user-round-x'"
                                  class="max-w-full"
                                  :title="`${t.assignee}: ${taskAssigneeLabel(task)}`"
                                >
                                  <span class="max-w-32 truncate">{{ taskAssigneeLabel(task) }}</span>
                                </UBadge>
                                <UBadge v-for="tag in task.tags" :key="tag" color="primary" variant="soft" class="max-w-full">#{{ tag }}</UBadge>
                                <UBadge v-if="task.attachments.length" color="neutral" variant="outline">{{ task.attachments.length }} {{ t.attachments }}</UBadge>
                              </div>
                            </UCard>
                          </div>
                        </template>
                        <button
                          v-if="column.key === 'backlog' && !tasksForPlacementColumn(topic.id, row.unterthemaId, column.id).length"
                          type="button"
                          class="flex min-h-14 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 transition hover:border-teal-400 hover:text-teal-700 dark:border-zinc-700 dark:hover:text-teal-300"
                          @click="openTaskModal(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                        >
                          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ t.newTask }}
                        </button>
                      </div>
                      <div
                        v-if="draggedTaskId && dragOverPlacementKey === taskDropPlacementKey(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }) && !dragOverTaskId"
                        class="ak-task-cell-drop-overlay pointer-events-none absolute z-10 flex items-center justify-center rounded-lg border border-teal-500/70 bg-teal-50/95 text-xs font-semibold text-teal-800 shadow-sm dark:bg-teal-950/90 dark:text-teal-100"
                        :class="row.collapsed || !tasksForPlacementColumn(topic.id, row.unterthemaId, column.id).length ? 'inset-2.5' : 'inset-x-2.5 bottom-2.5 h-10'"
                        aria-hidden="true"
                      >
                        <span class="inline-flex items-center gap-1.5">
                          <UIcon name="i-lucide-corner-down-left" class="size-3.5" />
                          {{ t.dropHere }}
                        </span>
                      </div>
                    </div>
                  </template>
                </template>
              </template>
            </div>
          </div>

          <button v-else class="w-full rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500 transition hover:border-teal-500 hover:text-teal-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:text-teal-300" @click="openOberthemaModal()">
            <UIcon name="i-lucide-network" class="mx-auto mb-3 size-7" />
            <span class="block font-semibold">{{ t.noOberthemen }}</span>
            <span class="mt-1 block">{{ t.newOberthema }}</span>
          </button>
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

              <UFormField :label="t.projectTags" :description="t.projectTagsHelp" size="lg">
                <UTextarea v-model="projectForm.tags" class="w-full" :rows="3" size="lg" />
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
        v-model:open="oberthemaModalOpen"
        :title="editingOberthemaId ? t.editOberthema : t.newOberthema"
        :description="t.topicDialog"
        :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <form @submit.prevent="saveOberthemaAction">
            <div class="border-b border-zinc-200 bg-zinc-50/80 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="flex items-center gap-3">
                <span class="grid size-9 place-items-center rounded-lg text-white" :style="{ backgroundColor: topicAccent({ color: oberthemaForm.color } as Oberthema) }">
                  <UIcon name="i-lucide-layers-3" class="size-4" />
                </span>
                <div>
                  <p class="ak-display font-semibold">{{ t.oberthema }}</p>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t.topicDialog }}</p>
                </div>
              </div>
            </div>
            <div class="grid gap-5 p-6">
              <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-circle" :description="errorMessage" />
              <UFormField :label="t.topicName" required size="lg">
                <UInput v-model="oberthemaForm.name" class="w-full" size="xl" icon="i-lucide-network" required autofocus />
              </UFormField>
              <UFormField :label="t.topicDescription" size="lg">
                <UTextarea v-model="oberthemaForm.description" class="w-full" :rows="4" size="lg" />
              </UFormField>
              <UFormField :label="t.topicColor" size="lg">
                <USelect v-model="oberthemaForm.color" class="w-full" :items="topicColorItems" size="lg" />
              </UFormField>
            </div>
            <div class="flex justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <UButton v-if="editingOberthemaId" color="error" variant="soft" icon="i-lucide-trash-2" type="button" :loading="hierarchySubmitting" @click="deleteOberthemaAction">{{ t.deleteOberthema }}</UButton>
              <span v-else />
              <div class="flex gap-2">
                <UButton color="neutral" variant="ghost" type="button" @click="oberthemaModalOpen = false">{{ t.cancel }}</UButton>
                <UButton icon="i-lucide-save" type="submit" :loading="hierarchySubmitting">{{ t.save }}</UButton>
              </div>
            </div>
          </form>
        </template>
      </UModal>

      <UModal
        v-model:open="unterthemaModalOpen"
        :title="editingUnterthemaId ? t.editUnterthema : t.newUnterthema"
        :description="t.topicDialog"
        :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <form @submit.prevent="saveUnterthemaAction">
            <div class="border-b border-zinc-200 bg-zinc-50/80 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="flex items-center gap-3">
                <span class="grid size-9 place-items-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
                  <UIcon name="i-lucide-list-tree" class="size-4" />
                </span>
                <div>
                  <p class="ak-display font-semibold">{{ t.unterthema }}</p>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400">{{ t.topicDialog }}</p>
                </div>
              </div>
            </div>
            <div class="grid gap-5 p-6">
              <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-lucide-alert-circle" :description="errorMessage" />
              <UFormField :label="t.oberthema" required size="lg">
                <USelect v-model="unterthemaForm.oberthemaId" class="w-full" :items="oberthemaItems" size="xl" required />
              </UFormField>
              <UFormField :label="t.topicName" required size="lg">
                <UInput v-model="unterthemaForm.name" class="w-full" size="xl" icon="i-lucide-list-tree" required autofocus />
              </UFormField>
              <UFormField :label="t.topicDescription" size="lg">
                <UTextarea v-model="unterthemaForm.description" class="w-full" :rows="4" size="lg" />
              </UFormField>
            </div>
            <div class="flex justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <UButton v-if="editingUnterthemaId" color="error" variant="soft" icon="i-lucide-trash-2" type="button" :loading="hierarchySubmitting" @click="deleteUnterthemaAction">{{ t.deleteUnterthema }}</UButton>
              <span v-else />
              <div class="flex gap-2">
                <UButton color="neutral" variant="ghost" type="button" @click="unterthemaModalOpen = false">{{ t.cancel }}</UButton>
                <UButton icon="i-lucide-save" type="submit" :loading="hierarchySubmitting">{{ t.save }}</UButton>
              </div>
            </div>
          </form>
        </template>
      </UModal>

      <UModal
        v-if="taskModalOpen"
        v-model:open="taskModalModel"
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
                <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {{ selectedTaskId && selectedTaskDetail ? (selectedTaskDetail.task.agentEnabled ? taskStatusLabel(selectedTaskDetail.task.agentStatus) : t.humanTask) : t.pasteHint }}
                </p>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <UFormField :label="t.topicAssignment" required size="sm">
                  <USelect v-model="taskForm.placementId" class="w-64 max-w-full" :items="placementItems" size="lg" :placeholder="t.chooseUnterthema" required />
                </UFormField>
                <UFormField :label="t.area" required size="sm">
                  <USelect v-model="taskForm.columnId" class="w-48 max-w-full" :items="columnItems" size="lg" :disabled="!selectedTaskId || hasAgentActivity" />
                </UFormField>
                <UFormField :label="t.assignee" size="sm">
                  <USelect
                    v-model="taskForm.assigneeId"
                    data-assignee-select
                    class="w-56 max-w-full"
                    :items="assigneeItems"
                    size="lg"
                    icon="i-lucide-user-round-check"
                  />
                </UFormField>
              </div>
            </div>

            <div v-if="selectedTaskId" class="grid gap-5 p-6">
              <div class="flex min-h-10 flex-wrap items-center gap-2 px-1">
                <span class="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  <UIcon name="i-lucide-tags" class="size-4 text-zinc-400" />
                  {{ t.tags }}
                </span>
                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <UBadge v-for="tag in taskTagPreview" :key="tag" color="primary" variant="soft">#{{ tag }}</UBadge>
                  <span v-if="!taskTagPreview.length" class="text-xs text-zinc-500 dark:text-zinc-400">{{ t.noTags }}</span>
                </div>
                <UPopover v-model:open="tagDropdownOpen" :content="{ align: 'end', side: 'bottom' }">
                  <UButton type="button" color="neutral" variant="outline" size="sm" icon="i-lucide-list-filter">
                    {{ t.editTags }}
                  </UButton>
                  <template #content>
                    <div class="w-64 p-2">
                      <label
                        v-for="tag in currentProjectTags"
                        :key="tag"
                        class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <input
                          type="checkbox"
                          class="size-4 accent-teal-600"
                          :checked="taskForm.tags.includes(tag)"
                          @change="toggleTaskTag(tag)"
                        >
                        <span class="min-w-0 truncate">#{{ tag }}</span>
                      </label>
                      <p v-if="!currentProjectTags.length" class="p-3 text-sm text-zinc-500 dark:text-zinc-400">
                        {{ t.noProjectTags }}
                      </p>
                    </div>
                  </template>
                </UPopover>
              </div>

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
                <UAlert color="neutral" variant="soft" icon="i-lucide-route" :description="t.steeringHelp" />

                <div v-if="canSendGuidance" class="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <UFormField :label="t.guidance" size="lg">
                    <UTextarea v-model="taskMessage" class="w-full" :rows="3" size="lg" @paste="handlePaste" />
                  </UFormField>
                  <div
                    class="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    @dragover.prevent
                    @drop.prevent="handleFileDrop"
                  >
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
                      <div v-if="taskFiles.length" class="grid gap-2 sm:grid-cols-2">
                        <button
                          v-for="item in taskFiles"
                          :key="item.id"
                          type="button"
                          class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-left transition dark:border-zinc-800 dark:bg-zinc-900"
                          :class="isPendingImageFile(item) ? 'hover:border-teal-400' : 'cursor-default'"
                          :aria-disabled="!isPendingImageFile(item)"
                          @click="isPendingImageFile(item) && openPendingAnnotationEditor(item)"
                        >
                          <img v-if="isPendingImageFile(item)" :src="item.annotatedUrl || item.url" :alt="item.file.name" class="h-24 w-full object-contain bg-white dark:bg-zinc-950">
                          <div class="flex items-center justify-between gap-3 p-2">
                            <span class="flex min-w-0 items-center gap-2">
                              <UIcon :name="isPendingImageFile(item) ? 'i-lucide-image' : 'i-lucide-file'" class="size-4 shrink-0 text-zinc-400" />
                              <span class="truncate">{{ item.file.name }}</span>
                            </span>
                            <span v-if="isPendingImageFile(item)" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                              <UIcon name="i-lucide-paintbrush" class="size-3.5" />
                              {{ t.editImage }}
                            </span>
                          </div>
                        </button>
                      </div>
                      <span v-else>{{ t.pasteHint }}</span>
                    </div>
                  </div>
                  <div class="flex justify-end">
                    <UButton
                      type="button"
                      icon="i-lucide-send"
                      :loading="taskSubmitting"
                      :disabled="!taskMessage.trim() && !taskFiles.length"
                      @click="saveTaskAction"
                    >
                      {{ t.sendMessage }}
                    </UButton>
                  </div>
                </div>
                <UAlert v-else-if="!canRequestFollowUp" color="neutral" variant="soft" icon="i-lucide-lock" :description="t.steeringUnavailable" />

                <div v-if="canRequestFollowUp" class="grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <UFormField :label="t.followUp" :description="t.followUpHelp" size="lg">
                    <UTextarea v-model="followUpMessage" class="w-full" :rows="3" size="lg" :placeholder="t.followUpPlaceholder" @paste="handlePaste" />
                  </UFormField>
                  <div
                    class="rounded-xl border border-dashed border-amber-300 bg-white/70 p-4 dark:border-amber-900/70 dark:bg-zinc-950/70"
                    @dragover.prevent
                    @drop.prevent="handleFileDrop"
                  >
                    <div class="mb-3 flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-semibold">{{ t.evidence }}</p>
                        <p class="truncate text-xs text-amber-800/70 dark:text-amber-100/70">{{ t.pasteHint }}</p>
                      </div>
                      <label class="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white dark:bg-amber-500 dark:text-amber-950">
                        <UIcon name="i-lucide-paperclip" class="size-4" />
                        <span>{{ t.files }}</span>
                        <input type="file" multiple class="hidden" @change="handleFileInput">
                      </label>
                    </div>
                    <div class="min-h-12 rounded-lg border border-amber-200 bg-white p-3 text-sm text-zinc-500 dark:border-amber-900/60 dark:bg-zinc-950 dark:text-zinc-400">
                      <div v-if="taskFiles.length" class="grid gap-2 sm:grid-cols-2">
                        <button
                          v-for="item in taskFiles"
                          :key="item.id"
                          type="button"
                          class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-left transition dark:border-zinc-800 dark:bg-zinc-900"
                          :class="isPendingImageFile(item) ? 'hover:border-amber-400' : 'cursor-default'"
                          :aria-disabled="!isPendingImageFile(item)"
                          @click="isPendingImageFile(item) && openPendingAnnotationEditor(item)"
                        >
                          <img v-if="isPendingImageFile(item)" :src="item.annotatedUrl || item.url" :alt="item.file.name" class="h-24 w-full object-contain bg-white dark:bg-zinc-950">
                          <div class="flex items-center justify-between gap-3 p-2">
                            <span class="flex min-w-0 items-center gap-2">
                              <UIcon :name="isPendingImageFile(item) ? 'i-lucide-image' : 'i-lucide-file'" class="size-4 shrink-0 text-zinc-400" />
                              <span class="truncate">{{ item.file.name }}</span>
                            </span>
                            <span v-if="isPendingImageFile(item)" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                              <UIcon name="i-lucide-paintbrush" class="size-3.5" />
                              {{ t.editImage }}
                            </span>
                          </div>
                        </button>
                      </div>
                      <span v-else>{{ t.pasteHint }}</span>
                    </div>
                  </div>
                  <div class="flex justify-end">
                    <UButton
                      type="button"
                      color="warning"
                      icon="i-lucide-rotate-ccw"
                      :loading="taskSubmitting"
                      :disabled="!followUpMessage.trim() && !taskFiles.length"
                      @click="requestFollowUpAction"
                    >
                      {{ t.requestFollowUp }}
                    </UButton>
                  </div>
                </div>

                <div class="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">{{ t.latestUpdate }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ t.activityReadableHint }}</p>
                    </div>
                  </div>
                  <div v-if="latestAgentUpdate" class="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-950 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-100">
                    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div class="flex items-center gap-2 text-sm font-semibold">
                        <UIcon name="i-lucide-sparkles" class="size-4" />
                        {{ t.latestUpdate }}
                      </div>
                      <time class="text-xs opacity-70">{{ formatActivityTime(latestAgentUpdate.createdAt) }}</time>
                    </div>
                    <p class="whitespace-pre-wrap break-words text-sm leading-6">{{ latestAgentUpdate.body }}</p>
                  </div>
                  <p v-else class="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {{ t.noAgentUpdate }}
                  </p>
                </div>
              </section>

              <section v-else-if="activeTaskTab === 'task'" class="grid gap-4">
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/20"
                  :class="editingTask?.agentStatus === 'running' ? 'cursor-not-allowed opacity-60' : ''"
                >
                  <input v-model="taskForm.agentEnabled" type="checkbox" class="mt-0.5 size-4 accent-violet-600" :disabled="editingTask?.agentStatus === 'running'">
                  <span class="grid min-w-0 gap-1">
                    <span class="flex items-center gap-2 text-sm font-semibold">
                      <UIcon name="i-lucide-sparkles" class="size-4 text-violet-600 dark:text-violet-300" />
                      {{ t.aiExecution }}
                    </span>
                    <span class="text-xs leading-5 text-violet-800/75 dark:text-violet-200/75">{{ t.aiExecutionHelp }}</span>
                  </span>
                </label>

                <template v-if="hasAgentActivity">
                  <UAlert color="neutral" variant="soft" icon="i-lucide-file-text" :description="t.readonlyTask" />
                  <div class="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                    <div>
                      <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.title }}</p>
                      <p class="mt-1 text-base font-semibold">{{ taskForm.title }}</p>
                    </div>
                    <div>
                      <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.description }}</p>
                      <UEditor
                        v-if="taskForm.description"
                        :model-value="taskForm.description"
                        content-type="markdown"
                        :editable="false"
                        :image="false"
                        :mention="false"
                        class="ak-markdown-readonly mt-1 text-sm text-zinc-600 dark:text-zinc-300"
                        :ui="{ content: 'px-0 py-0', base: 'px-0 sm:px-0 text-sm text-zinc-600 dark:text-zinc-300' }"
                      />
                      <p v-else class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">-</p>
                    </div>
                    <div>
                      <p class="text-xs font-bold uppercase tracking-wide text-zinc-400">{{ t.files }}</p>
                      <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{{ editingTask?.attachments.length ?? 0 }} {{ t.attachments }}</p>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <UFormField :label="t.title" required size="lg">
                    <UInput v-model="taskForm.title" class="w-full" size="xl" required />
                  </UFormField>

                  <UFormField :label="t.description" :description="t.markdownEditorHelp" size="lg">
                    <div class="ak-markdown-editor overflow-hidden rounded-xl border border-zinc-300 bg-white transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950">
                      <UEditor
                        v-slot="{ editor }"
                        v-model="taskForm.description"
                        content-type="markdown"
                        :image="false"
                        :mention="false"
                        :placeholder="t.description"
                        :ui="{ content: 'min-h-44', base: 'min-h-44 px-4 py-3 sm:px-4' }"
                        @paste="handlePaste"
                      >
                        <UEditorToolbar
                          layout="fixed"
                          :editor="editor"
                          :items="editorToolbarItems"
                          class="border-b border-zinc-200 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/80"
                        />
                      </UEditor>
                    </div>
                  </UFormField>

                  <div
                    class="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
                    @dragover.prevent
                    @drop.prevent="handleFileDrop"
                  >
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
                      <div v-if="taskFiles.length" class="grid gap-2 sm:grid-cols-2">
                        <button
                          v-for="item in taskFiles"
                          :key="item.id"
                          type="button"
                          class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-left transition dark:border-zinc-800 dark:bg-zinc-900"
                          :class="isPendingImageFile(item) ? 'hover:border-teal-400' : 'cursor-default'"
                          :aria-disabled="!isPendingImageFile(item)"
                          @click="isPendingImageFile(item) && openPendingAnnotationEditor(item)"
                        >
                          <img v-if="isPendingImageFile(item)" :src="item.annotatedUrl || item.url" :alt="item.file.name" class="h-24 w-full object-contain bg-white dark:bg-zinc-950">
                          <div class="flex items-center justify-between gap-3 p-2">
                            <span class="flex min-w-0 items-center gap-2">
                              <UIcon :name="isPendingImageFile(item) ? 'i-lucide-image' : 'i-lucide-file'" class="size-4 shrink-0 text-zinc-400" />
                              <span class="truncate">{{ item.file.name }}</span>
                            </span>
                            <span v-if="isPendingImageFile(item)" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                              <UIcon name="i-lucide-paintbrush" class="size-3.5" />
                              {{ t.editImage }}
                            </span>
                          </div>
                        </button>
                      </div>
                      <span v-else>{{ t.pasteHint }}</span>
                    </div>
                  </div>
                </template>

                <div v-if="taskImageAttachments.length" class="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">{{ t.images }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ t.annotationHelp }}</p>
                    </div>
                    <UBadge color="neutral" variant="soft">{{ taskImageAttachments.length }}</UBadge>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <button
                      v-for="attachment in taskImageAttachments"
                      :key="attachment.id"
                      type="button"
                      class="group overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 text-left transition hover:border-teal-400 dark:border-zinc-800 dark:bg-zinc-900"
                      @click="openAnnotationEditor(attachment)"
                    >
                      <img :src="attachment.annotatedUrl || attachment.url" :alt="attachment.fileName" class="h-36 w-full object-contain bg-white dark:bg-zinc-950">
                      <div class="flex items-center justify-between gap-3 p-3">
                        <span class="min-w-0 truncate text-sm font-medium">{{ attachment.fileName }}</span>
                        <span class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 group-hover:text-teal-700 dark:text-zinc-400 dark:group-hover:text-teal-300">
                          <UIcon name="i-lucide-paintbrush" class="size-3.5" />
                          {{ t.editImage }}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              <section v-else class="grid gap-4">
                <div class="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">{{ t.comments }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ commentCount }} {{ t.total }}</p>
                    </div>
                    <UIcon name="i-lucide-messages-square" class="size-5 text-zinc-400" />
                  </div>
                  <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <UFormField :label="t.comments" size="lg">
                      <UTextarea v-model="commentMessage" class="w-full" :rows="2" size="lg" :placeholder="t.commentPlaceholder" />
                    </UFormField>
                    <UButton
                      type="button"
                      icon="i-lucide-send"
                      :loading="taskSubmitting"
                      :disabled="!commentMessage.trim()"
                      @click="sendCommentAction"
                    >
                      {{ t.sendComment }}
                    </UButton>
                  </div>
                  <div class="grid max-h-72 gap-3 overflow-y-auto pr-1">
                    <div
                      v-for="comment in teamComments"
                      :key="comment.id"
                      class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70"
                    >
                      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p class="text-sm font-semibold">{{ comment.userName }}</p>
                        <time class="text-xs text-zinc-500 dark:text-zinc-400">{{ formatActivityTime(comment.createdAt) }}</time>
                      </div>
                      <p class="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700 dark:text-zinc-200">{{ comment.body }}</p>
                    </div>
                    <p v-if="!teamComments.length" class="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">
                      {{ t.noComments }}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div v-else class="grid gap-5 p-6">
              <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
                <input v-model="taskForm.agentEnabled" type="checkbox" class="mt-0.5 size-4 accent-violet-600">
                <span class="grid min-w-0 gap-1">
                  <span class="flex items-center gap-2 text-sm font-semibold">
                    <UIcon name="i-lucide-sparkles" class="size-4 text-violet-600 dark:text-violet-300" />
                    {{ t.aiExecution }}
                  </span>
                  <span class="text-xs leading-5 text-violet-800/75 dark:text-violet-200/75">{{ t.aiExecutionHelp }}</span>
                </span>
              </label>

              <UFormField :label="t.title" required size="lg">
                <UInput v-model="taskForm.title" class="w-full" size="xl" required />
              </UFormField>

              <UFormField :label="t.description" :description="t.markdownEditorHelp" size="lg">
                <div class="ak-markdown-editor overflow-hidden rounded-xl border border-zinc-300 bg-white transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950">
                  <UEditor
                    v-slot="{ editor }"
                    v-model="taskForm.description"
                    content-type="markdown"
                    :image="false"
                    :mention="false"
                    :placeholder="t.description"
                    :ui="{ content: 'min-h-44', base: 'min-h-44 px-4 py-3 sm:px-4' }"
                    @paste="handlePaste"
                  >
                    <UEditorToolbar
                      layout="fixed"
                      :editor="editor"
                      :items="editorToolbarItems"
                      class="border-b border-zinc-200 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/80"
                    />
                  </UEditor>
                </div>
              </UFormField>

              <div class="flex min-h-10 flex-wrap items-center gap-2 px-1">
                <span class="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  <UIcon name="i-lucide-tags" class="size-4 text-zinc-400" />
                  {{ t.tags }}
                </span>
                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <UBadge v-for="tag in taskTagPreview" :key="tag" color="primary" variant="soft">#{{ tag }}</UBadge>
                  <span v-if="!taskTagPreview.length" class="text-xs text-zinc-500 dark:text-zinc-400">{{ t.noTags }}</span>
                </div>
                <UPopover v-model:open="tagDropdownOpen" :content="{ align: 'end', side: 'bottom' }">
                  <UButton type="button" color="neutral" variant="outline" size="sm" icon="i-lucide-list-filter">
                    {{ t.editTags }}
                  </UButton>
                  <template #content>
                    <div class="w-64 p-2">
                      <label
                        v-for="tag in currentProjectTags"
                        :key="tag"
                        class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <input
                          type="checkbox"
                          class="size-4 accent-teal-600"
                          :checked="taskForm.tags.includes(tag)"
                          @change="toggleTaskTag(tag)"
                        >
                        <span class="min-w-0 truncate">#{{ tag }}</span>
                      </label>
                      <p v-if="!currentProjectTags.length" class="p-3 text-sm text-zinc-500 dark:text-zinc-400">
                        {{ t.noProjectTags }}
                      </p>
                    </div>
                  </template>
                </UPopover>
              </div>

              <div
                class="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
                @dragover.prevent
                @drop.prevent="handleFileDrop"
              >
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
                  <div v-if="taskFiles.length" class="grid gap-2 sm:grid-cols-2">
                    <button
                      v-for="item in taskFiles"
                      :key="item.id"
                      type="button"
                      class="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-left transition dark:border-zinc-800 dark:bg-zinc-900"
                      :class="isPendingImageFile(item) ? 'hover:border-teal-400' : 'cursor-default'"
                      :aria-disabled="!isPendingImageFile(item)"
                      @click="isPendingImageFile(item) && openPendingAnnotationEditor(item)"
                    >
                      <img v-if="isPendingImageFile(item)" :src="item.annotatedUrl || item.url" :alt="item.file.name" class="h-24 w-full object-contain bg-white dark:bg-zinc-950">
                      <div class="flex items-center justify-between gap-3 p-2">
                        <span class="flex min-w-0 items-center gap-2">
                          <UIcon :name="isPendingImageFile(item) ? 'i-lucide-image' : 'i-lucide-file'" class="size-4 shrink-0 text-zinc-400" />
                          <span class="truncate">{{ item.file.name }}</span>
                        </span>
                        <span v-if="isPendingImageFile(item)" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                          <UIcon name="i-lucide-paintbrush" class="size-3.5" />
                          {{ t.editImage }}
                        </span>
                      </div>
                    </button>
                  </div>
                  <span v-else>{{ t.pasteHint }}</span>
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
          <UButton color="neutral" variant="ghost" type="button" @click="requestCloseTaskModal">{{ t.cancel }}</UButton>
          <UButton
            icon="i-lucide-clipboard-plus"
            type="submit"
            form="task-form"
            :loading="taskSubmitting"
          >
            {{ !selectedTaskId ? t.createTask : canSendGuidance && taskMessage.trim() ? t.sendMessage : t.save }}
          </UButton>
        </template>
      </UModal>

      <UModal
        v-if="discardTaskModalOpen"
        v-model:open="discardTaskModalOpen"
        :title="t.unsavedTaskChanges"
        :description="t.unsavedTaskChangesDescription"
        :ui="{ content: 'max-w-md' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <div class="flex justify-end gap-3">
            <UButton color="neutral" variant="ghost" type="button" @click="discardTaskModalOpen = false">
              {{ t.keepEditing }}
            </UButton>
            <UButton color="error" variant="soft" icon="i-lucide-log-out" type="button" @click="discardTaskChanges">
              {{ t.discardChanges }}
            </UButton>
          </div>
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

      <UModal
        v-if="annotationModalOpen"
        v-model:open="annotationModalOpen"
        :title="t.annotateImage"
        :description="selectedAnnotationName"
        :ui="{ content: 'max-w-5xl', body: 'p-0 sm:p-0', footer: 'justify-between border-t border-zinc-200 bg-zinc-50/95 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/90' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <div class="grid gap-4 p-5">
            <UAlert color="neutral" variant="soft" icon="i-lucide-paintbrush" :description="t.annotationHelp" />
            <div class="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div class="flex items-center gap-2">
                <button
                  v-for="color in annotationColors"
                  :key="color"
                  type="button"
                  class="size-8 rounded-full border-2 transition"
                  :class="annotationColor === color ? 'border-zinc-950 ring-2 ring-teal-500 dark:border-white' : 'border-white dark:border-zinc-900'"
                  :style="{ backgroundColor: color }"
                  @click="annotationColor = color"
                />
              </div>
              <div class="flex min-w-48 items-center gap-3">
                <UIcon name="i-lucide-pencil-line" class="size-4 text-zinc-400" />
                <input v-model.number="annotationWidth" type="range" min="2" max="18" class="w-36 accent-teal-600">
                <span class="w-8 text-sm text-zinc-500 dark:text-zinc-400">{{ annotationWidth }}</span>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <UButton
                  type="button"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-undo-2"
                  :disabled="!annotationData.strokes.length"
                  @click="undoAnnotationStroke"
                >
                  {{ t.undo }}
                </UButton>
                <UButton
                  type="button"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-eraser"
                  :disabled="!annotationData.strokes.length"
                  @click="clearAnnotationStrokes"
                >
                  {{ t.clear }}
                </UButton>
              </div>
            </div>
            <div class="overflow-auto rounded-xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div class="relative mx-auto inline-block max-w-full">
                <img
                  ref="annotationImageEl"
                  :src="selectedAnnotationImageUrl"
                  :alt="selectedAnnotationName"
                  class="block max-h-[62vh] max-w-full select-none"
                  draggable="false"
                  @load="onAnnotationImageLoad"
                >
                <canvas
                  ref="annotationCanvas"
                  class="absolute inset-0 size-full touch-none cursor-crosshair"
                  @pointerdown.prevent="startAnnotationStroke"
                  @pointermove.prevent="moveAnnotationStroke"
                  @pointerup.prevent="finishAnnotationStroke"
                  @pointercancel.prevent="finishAnnotationStroke"
                />
              </div>
            </div>
          </div>
        </template>
        <template #footer>
          <UButton color="neutral" variant="ghost" type="button" @click="annotationModalOpen = false">{{ t.cancel }}</UButton>
          <UButton
            type="button"
            icon="i-lucide-save"
            :loading="annotationSubmitting"
            @click="saveAnnotationAction"
          >
            {{ t.saveAnnotation }}
          </UButton>
        </template>
      </UModal>
    </div>
  </div>
</template>
