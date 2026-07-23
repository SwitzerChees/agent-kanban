<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, CommandPaletteProps, EditorToolbarItem, ModalProps, TableColumn } from '@nuxt/ui';
import Fuse from 'fuse.js';

type Locale = 'en' | 'de';
type View = 'board' | 'projects' | 'users';
type TaskTab = 'activity' | 'task' | 'refinement' | 'comments';

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
  clientRequestId: string | null;
  oberthemaId: string;
  unterthemaId: string | null;
  swimlaneId: string | null;
  assigneeId: string | null;
  agentEnabled: boolean;
  agentStatus: 'idle' | 'queued' | 'running' | 'failed' | 'done';
  attachments: Attachment[];
  tags: string[];
  unreadMentionCount?: number;
  latestUnreadMentionAt?: string | null;
  updatedAt: string;
}

interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  kind: 'comment' | 'steering';
  body: string;
  createdAt: string;
  mentions: Array<{
    userId: string;
    userName: string;
  }>;
  mentionedCurrentUser: boolean;
  unreadMention: boolean;
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
  unreadMentionCount: number;
  events: TaskEvent[];
}

interface TaskRefinementQuestionApi {
  id: string;
  question: string;
  rationale?: string | null;
  type?: 'text' | 'single_choice' | 'multiple_choice' | 'boolean';
  options?: string[];
  required: boolean;
  round: number;
  answer?: string | string[] | boolean | null;
  answeredAt?: string | null;
}

interface TaskRefinementVisualApi {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  prompt?: string | null;
  caption?: string | null;
  createdAt?: string | null;
}

interface TaskRefinementApi {
  id: string;
  taskId: string;
  version: number;
  status: 'queued' | 'running' | 'awaiting_input' | 'completed' | 'failed';
  requestedBy: string;
  requestedByName?: string | null;
  brief?: string | null;
  visualMode: 'auto' | 'off' | 'force';
  sourceDescription?: string | null;
  sourceTaskUpdatedAt: string;
  sourceCodeRevision?: string | null;
  resultCodeRevision?: string | null;
  round: number;
  resultMarkdown?: string | null;
  complexity?: string | null;
  threadId?: string | null;
  error?: string | null;
  questions: TaskRefinementQuestionApi[];
  visuals: TaskRefinementVisualApi[];
  createdAt: string;
  startedAt?: string | null;
  awaitingInputAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  appliedAt?: string | null;
  updatedAt: string;
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

interface CommandPaletteTask {
  id: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  key: string;
  title: string;
  description: string | null;
  priority: Task['priority'];
  columnId: string;
  columnKey: string | null;
  columnNameEn: string | null;
  columnNameDe: string | null;
  columnDone: boolean;
  oberthemaId: string;
  oberthemaName: string | null;
  unterthemaId: string | null;
  unterthemaName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  agentEnabled: boolean;
  agentStatus: Task['agentStatus'];
  tags: string[];
  updatedAt: string;
}

interface CommandPaletteTopic {
  id: string;
  kind: 'oberthema' | 'unterthema';
  name: string;
  description: string | null;
  projectId: string;
  projectKey: string;
  projectName: string;
  oberthemaId: string;
  oberthemaName: string;
  updatedAt: string;
}

interface CommandPaletteIndex {
  tasks: CommandPaletteTask[];
  topics: CommandPaletteTopic[];
}

interface AppCommandPaletteItem extends CommandPaletteItem {
  id: string;
  keywords?: string;
  searchText?: string;
}

interface KeyboardHintTarget {
  code: string;
  element: HTMLElement;
  label: string;
  left: number;
  top: number;
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
  purpose: 'task' | 'guidance' | 'follow-up';
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
    projectNavigation: 'Project navigation',
    jumpToTopic: 'Jump to topic',
    searchTasks: 'Search tasks',
    searchTasksPlaceholder: 'Search title or description…',
    allResponsible: 'All responsible',
    selectedCount: 'selected',
    searchResponsible: 'Search responsible…',
    responsibilityFilterHint: 'Select one or more. No selection shows every task.',
    boardFilters: 'Board filters',
    clearSearch: 'Clear search',
    clearFilters: 'Clear filters',
    matchingTasks: 'matching tasks',
    commandPalette: 'Search and commands',
    commandPaletteTitle: 'Search, navigate, or run a command',
    commandPaletteDescription: 'Find work across your projects and control the board without leaving the keyboard.',
    commandPalettePlaceholder: 'Search tasks, projects, topics, or commands…',
    commandGroupActions: 'Quick actions',
    commandGroupRecentTasks: 'Recently updated tasks',
    commandGroupTasks: 'Tasks',
    commandGroupProjects: 'Projects',
    commandGroupTopics: 'Topics',
    commandGroupFilters: 'Filters',
    commandGroupNavigation: 'Navigation and display',
    commandNoResults: 'Nothing matches this search',
    commandNoResultsHint: 'Try a task key, a word from its description, a project, topic, or command.',
    commandLoadError: 'Global results could not be loaded. Local actions are still available.',
    commandCreateWithTitle: 'Create task “{query}”',
    commandCreateWithTitleDescription: 'Start a new task in the current project with this title.',
    commandFilterBoardBy: 'Filter this board by “{query}”',
    commandFilterBoardDescription: 'Show matching titles and descriptions in the current Kanban.',
    commandCurrentProject: 'Current project',
    commandActive: 'Active',
    commandRefreshBoard: 'Refresh current board',
    commandToggleSidebar: 'Toggle sidebar',
    commandFocusBoardSearch: 'Focus board search',
    commandNextTask: 'Focus next task',
    commandPreviousTask: 'Focus previous task',
    commandOpenBoardOverview: 'Open project overview',
    commandGoToProjects: 'Manage projects',
    commandGoToUsers: 'Manage users',
    commandKeyboardHint: 'Navigate with arrows, run with Enter, clear or close with Esc',
    fullKeyboardMode: 'Full keyboard mode',
    fullKeyboardModeDescription: 'Show a short code on every visible control and type it to interact.',
    keyboardHintsActive: 'Keyboard mode',
    keyboardHintsInstruction: 'Type a code · Esc closes · {modifier} toggles',
    keyboardHintsCount: '{count} visible controls',
    keyboardHintsNoControls: 'No interactive controls are visible.',
    keyboardMovePosition: '{name} moved to position {position} of {total}.',
    navTagline: 'Work in flow',
    createProject: 'Create project',
    createUser: 'Create user',
    editUser: 'Edit user',
    updateUser: 'Save changes',
    deleteUser: 'Delete user',
    deleteUserConfirm: 'Remove this user’s access?',
    deleteUserWarning: 'The user will be signed out, removed from all projects, and cleared from open responsibilities. Historical contributions remain visible.',
    deleteUserSelfProtected: 'You cannot delete your own account.',
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
    deleteAttachment: 'Delete file',
    deleteAttachmentConfirm: 'Delete this attached file?',
    deleteAttachmentWarning: 'The file will be removed permanently and will no longer be available to people or the AI agent.',
    openAttachment: 'Open file',
    downloadAttachment: 'Download file',
    downloadAttachmentError: 'The file could not be downloaded.',
    attachedFiles: 'Attached files',
    unsavedTaskChanges: 'Discard unsaved changes?',
    unsavedTaskChangesDescription: 'Your current changes will be lost if you close this task.',
    finishInlineDraft: 'Send or remove the open progress or comment draft before saving the task.',
    keepEditing: 'Keep editing',
    discardChanges: 'Discard changes',
    editProject: 'Edit project',
    updateProject: 'Save project',
    newPassword: 'New password',
    passwordCreateHint: 'At least 8 characters.',
    passwordEditHint: 'Leave empty to keep the current password.',
    selfAdminRoleLocked: 'Your own admin role is protected and cannot be changed.',
    userEmailExists: 'This email address is already used by another user.',
    userNotFound: 'This user no longer exists.',
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
    refinementTab: 'Refinement',
    refineTask: 'Refine with Codex',
    refinementCtaHint: 'Turn the current idea into an implementation-ready brief. Open changes are saved when refinement starts.',
    refinementTitleRequired: 'Add a title to the task first. Your refinement text has been kept.',
    refinementCreatedButNotStarted: 'The task was saved, but refinement did not start. Try again; no duplicate task will be created.',
    refinementOverwriteTitle: 'Replace the current description?',
    refinementOverwriteDescription: 'This refinement was created from an earlier description. Applying it replaces the current description. The title and all other task details stay unchanged.',
    refinementOverwriteConfirm: 'Apply anyway',
    commentsTab: 'Comments',
    readonlyTask: 'This is the original task brief. It stays unchanged once work has started.',
    dropHere: 'Drop here',
    noGuidanceAfterFinish: 'Work is finished. New guidance is closed, but the progress history remains available.',
    refresh: 'Refresh',
    noProject: 'No project selected',
    hierarchy: 'Topic structure',
    hierarchyHint: 'Navigate from a parent topic into its sub-topics and shared workflow.',
    hierarchyReorderHint: 'Drag to reorder, or focus the handle and use the arrow keys.',
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
    aiTaskShort: 'AI',
    humanTaskShort: 'Human',
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
    taskKeyboardMoveHint: 'Shift + Up/Down reorders within this status. Press Enter to change status or topic in task details.',
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
    commentPlaceholder: 'Write a comment for the team. Type @ to mention someone.',
    commentMentionHint: 'Mention a project member with @. They will see this task highlighted until they view the comment.',
    commentMentionedYou: 'Mentioned you',
    commentMentionNotification: '{count} unread mentions',
    commentMentionNotificationSingle: '1 unread mention',
    commentMentionSuggestions: 'Mention someone',
    sendComment: 'Send comment',
    noComments: 'No comments yet',
    agentRunFailed: 'The latest AI run failed: {error}',
    agentRunCompleted: 'The AI run finished and is ready for review.',
    agentRunStarted: 'A new AI run has started.',
    agentWorktreeResumeFailed: 'The existing task worktree could not be resumed because its branch name changed.',
    followUp: 'Follow-up task',
    followUpHelp: 'Add what was not good enough and send the task back to the agent.',
    followUpPlaceholder: 'Describe what should be improved or continued.',
    followUpFilesOnlyMessage: 'Continue with the attached follow-up material.',
    requestFollowUp: 'Continue work',
    images: 'Images',
    editImage: 'Edit image',
    annotateImage: 'Annotate image',
    annotationHelp: 'Mark the image for the agent. The drawing stays editable and an annotated copy is passed to the agent.',
    drawingColor: 'Drawing color',
    strokeWidth: 'Stroke width',
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
    projectNavigation: 'Projektnavigation',
    jumpToTopic: 'Zu einem Thema springen',
    searchTasks: 'Aufgaben suchen',
    searchTasksPlaceholder: 'Titel oder Beschreibung suchen…',
    allResponsible: 'Alle Verantwortlichen',
    selectedCount: 'ausgewählt',
    searchResponsible: 'Verantwortliche suchen…',
    responsibilityFilterHint: 'Wähle eine oder mehrere Personen. Ohne Auswahl werden alle Aufgaben gezeigt.',
    boardFilters: 'Board-Filter',
    clearSearch: 'Suche leeren',
    clearFilters: 'Filter zurücksetzen',
    matchingTasks: 'passende Aufgaben',
    commandPalette: 'Suchen und Befehle',
    commandPaletteTitle: 'Suchen, navigieren oder Befehl ausführen',
    commandPaletteDescription: 'Finde Arbeit projektübergreifend und bediene das Board vollständig per Tastatur.',
    commandPalettePlaceholder: 'Aufgaben, Projekte, Themen oder Befehle suchen…',
    commandGroupActions: 'Schnellaktionen',
    commandGroupRecentTasks: 'Zuletzt aktualisierte Aufgaben',
    commandGroupTasks: 'Aufgaben',
    commandGroupProjects: 'Projekte',
    commandGroupTopics: 'Themen',
    commandGroupFilters: 'Filter',
    commandGroupNavigation: 'Navigation und Darstellung',
    commandNoResults: 'Keine passenden Ergebnisse',
    commandNoResultsHint: 'Versuche ein Aufgabenkürzel, ein Wort aus der Beschreibung, ein Projekt, Thema oder einen Befehl.',
    commandLoadError: 'Globale Ergebnisse konnten nicht geladen werden. Lokale Aktionen bleiben verfügbar.',
    commandCreateWithTitle: 'Aufgabe „{query}“ erstellen',
    commandCreateWithTitleDescription: 'Neue Aufgabe mit diesem Titel im aktuellen Projekt beginnen.',
    commandFilterBoardBy: 'Dieses Board nach „{query}“ filtern',
    commandFilterBoardDescription: 'Passende Titel und Beschreibungen im aktuellen Kanban anzeigen.',
    commandCurrentProject: 'Aktuelles Projekt',
    commandActive: 'Aktiv',
    commandRefreshBoard: 'Aktuelles Board aktualisieren',
    commandToggleSidebar: 'Sidebar ein- oder ausklappen',
    commandFocusBoardSearch: 'Board-Suche fokussieren',
    commandNextTask: 'Nächste Aufgabe fokussieren',
    commandPreviousTask: 'Vorherige Aufgabe fokussieren',
    commandOpenBoardOverview: 'Projektübersicht öffnen',
    commandGoToProjects: 'Projekte verwalten',
    commandGoToUsers: 'Benutzer verwalten',
    commandKeyboardHint: 'Mit Pfeilen navigieren, mit Enter ausführen, mit Esc leeren oder schließen',
    fullKeyboardMode: 'Vollständiger Tastaturmodus',
    fullKeyboardModeDescription: 'Zeigt auf jedem sichtbaren Bedienelement einen kurzen Code, den du direkt tippen kannst.',
    keyboardHintsActive: 'Tastaturmodus',
    keyboardHintsInstruction: 'Code tippen · Esc schließt · {modifier} schaltet um',
    keyboardHintsCount: '{count} sichtbare Bedienelemente',
    keyboardHintsNoControls: 'Keine sichtbaren Bedienelemente verfügbar.',
    keyboardMovePosition: '{name} wurde an Position {position} von {total} verschoben.',
    navTagline: 'Arbeit im Fluss',
    createProject: 'Projekt erstellen',
    createUser: 'Benutzer erstellen',
    editUser: 'Benutzer bearbeiten',
    updateUser: 'Änderungen speichern',
    deleteUser: 'Benutzer löschen',
    deleteUserConfirm: 'Zugriff dieses Benutzers entfernen?',
    deleteUserWarning: 'Der Benutzer wird abgemeldet, aus allen Projekten entfernt und aus offenen Verantwortlichkeiten gelöscht. Historische Beiträge bleiben sichtbar.',
    deleteUserSelfProtected: 'Du kannst dein eigenes Benutzerkonto nicht löschen.',
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
    deleteAttachment: 'Datei löschen',
    deleteAttachmentConfirm: 'Diese angehängte Datei löschen?',
    deleteAttachmentWarning: 'Die Datei wird dauerhaft entfernt und steht danach weder Personen noch dem KI-Agenten zur Verfügung.',
    openAttachment: 'Datei öffnen',
    downloadAttachment: 'Datei herunterladen',
    downloadAttachmentError: 'Die Datei konnte nicht heruntergeladen werden.',
    attachedFiles: 'Angehängte Dateien',
    unsavedTaskChanges: 'Ungespeicherte Änderungen verwerfen?',
    unsavedTaskChangesDescription: 'Wenn du die Aufgabe schließt, gehen deine aktuellen Änderungen verloren.',
    finishInlineDraft: 'Sende oder entferne zuerst den offenen Fortschritts- oder Kommentarentwurf, bevor du die Aufgabe speicherst.',
    keepEditing: 'Weiter bearbeiten',
    discardChanges: 'Änderungen verwerfen',
    editProject: 'Projekt bearbeiten',
    updateProject: 'Projekt speichern',
    newPassword: 'Neues Passwort',
    passwordCreateHint: 'Mindestens 8 Zeichen.',
    passwordEditHint: 'Leer lassen, um das aktuelle Passwort beizubehalten.',
    selfAdminRoleLocked: 'Deine eigene Adminrolle ist geschützt und kann nicht geändert werden.',
    userEmailExists: 'Diese E-Mail-Adresse wird bereits von einem anderen Benutzer verwendet.',
    userNotFound: 'Dieser Benutzer existiert nicht mehr.',
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
    refinementTab: 'Refinement',
    refineTask: 'Mit Codex refinen',
    refinementCtaHint: 'Die Idee mit Projekt- und Codekontext ausarbeiten. Offene Änderungen werden beim Start automatisch gespeichert.',
    refinementTitleRequired: 'Gib der Aufgabe zuerst einen Titel. Dein Refinement-Text wurde beibehalten.',
    refinementCreatedButNotStarted: 'Die Aufgabe wurde gespeichert, das Refinement aber nicht gestartet. Versuche es erneut; es wird keine doppelte Aufgabe erstellt.',
    refinementOverwriteTitle: 'Aktuelle Beschreibung ersetzen?',
    refinementOverwriteDescription: 'Dieses Refinement wurde mit einer früheren Beschreibung erstellt. Beim Übernehmen wird die aktuelle Beschreibung ersetzt. Titel und alle anderen Aufgabendaten bleiben unverändert.',
    refinementOverwriteConfirm: 'Trotzdem übernehmen',
    commentsTab: 'Kommentare',
    readonlyTask: 'Das ist der ursprüngliche Auftrag. Er bleibt unverändert, sobald die Bearbeitung begonnen hat.',
    dropHere: 'Hier ablegen',
    noGuidanceAfterFinish: 'Die Bearbeitung ist abgeschlossen. Neue Hinweise sind geschlossen, der Verlauf bleibt sichtbar.',
    refresh: 'Aktualisieren',
    noProject: 'Kein Projekt ausgewählt',
    hierarchy: 'Themenstruktur',
    hierarchyHint: 'Navigiere vom Oberthema in seine Unterthemen und den gemeinsamen Workflow.',
    hierarchyReorderHint: 'Zum Sortieren ziehen oder den Griff fokussieren und die Pfeiltasten nutzen.',
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
    aiTaskShort: 'KI',
    humanTaskShort: 'Mensch',
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
    taskKeyboardMoveHint: 'Umschalt + Hoch/Runter sortiert innerhalb dieses Status. Mit Enter lassen sich Status oder Thema in den Aufgabendetails ändern.',
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
    commentPlaceholder: 'Kommentar für das Team schreiben. Mit @ jemanden erwähnen.',
    commentMentionHint: 'Erwähne ein Projektmitglied mit @. Die Aufgabe bleibt hervorgehoben, bis die Person den Kommentar angesehen hat.',
    commentMentionedYou: 'Du wurdest erwähnt',
    commentMentionNotification: '{count} ungelesene Erwähnungen',
    commentMentionNotificationSingle: '1 ungelesene Erwähnung',
    commentMentionSuggestions: 'Person erwähnen',
    sendComment: 'Kommentar senden',
    noComments: 'Noch keine Kommentare',
    agentRunFailed: 'Der letzte KI-Lauf ist fehlgeschlagen: {error}',
    agentRunCompleted: 'Der KI-Lauf ist abgeschlossen und bereit zur Prüfung.',
    agentRunStarted: 'Ein neuer KI-Lauf wurde gestartet.',
    agentWorktreeResumeFailed: 'Der vorhandene Task-Worktree konnte wegen eines geänderten Branch-Namens nicht wiederaufgenommen werden.',
    followUp: 'Folgeaufgabe',
    followUpHelp: 'Beschreibe, was noch nicht gut genug war, und gib die Aufgabe zurück an den Agenten.',
    followUpPlaceholder: 'Beschreibe, was verbessert oder weiterbearbeitet werden soll.',
    followUpFilesOnlyMessage: 'Bitte mit dem angehängten Folge-Material weiterarbeiten.',
    requestFollowUp: 'Weiterarbeiten lassen',
    images: 'Bilder',
    editImage: 'Bild bearbeiten',
    annotateImage: 'Bild markieren',
    annotationHelp: 'Markiere das Bild für den Agenten. Die Zeichnung bleibt editierbar und eine markierte Kopie wird an den Agenten übergeben.',
    drawingColor: 'Zeichenfarbe',
    strokeWidth: 'Strichstärke',
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
const refinementOverwriteModalOpen = ref(false);
const oberthemaModalOpen = ref(false);
const unterthemaModalOpen = ref(false);
const deleteUserModalOpen = ref(false);
const deleteTaskModalOpen = ref(false);
const deleteAttachmentModalOpen = ref(false);
const annotationModalOpen = ref(false);
const taskSubmitting = ref(false);
const hierarchySubmitting = ref(false);
const userSubmitting = ref(false);
const annotationSubmitting = ref(false);
const attachmentSubmitting = ref(false);
const downloadingAttachmentId = ref<string | null>(null);
const sidebarCollapsed = ref(false);
const isMobileViewport = ref(false);
const editingProjectId = ref<string | null>(null);
const editingUserId = ref<string | null>(null);
const selectedUserForDeletion = ref<User | null>(null);
const editingOberthemaId = ref<string | null>(null);
const editingUnterthemaId = ref<string | null>(null);
const selectedTaskId = ref<string | null>(null);
const taskCreateRequestId = ref('');
const selectedTaskDetail = ref<TaskDetail | null>(null);
const taskRefinements = ref<TaskRefinementApi[]>([]);
const selectedRefinementId = ref<string | null>(null);
const pendingRefinementApplyId = ref<string | null>(null);
const refinementBusy = ref(false);
const taskMessage = ref('');
const commentMessage = ref('');
const commentMentionUserIds = ref<string[]>([]);
const commentMentionOpen = ref(false);
const commentMentionQuery = ref('');
const commentMentionStart = ref<number | null>(null);
const commentMentionEnd = ref<number | null>(null);
const commentMentionActiveIndex = ref(0);
const commentComposerEl = ref<HTMLElement | null>(null);
const followUpMessage = ref('');
const activeTaskTab = ref<TaskTab>('activity');
const tagDropdownOpen = ref(false);
const boardFilterPopoverOpen = ref(false);
const boardSearchQuery = ref('');
const selectedBoardAssigneeIds = ref<string[]>([]);
const commandPaletteOpen = ref(false);
const commandPaletteQuery = ref('');
const commandPaletteLoading = ref(false);
const commandPaletteError = ref(false);
const commandPaletteIndex = ref<CommandPaletteIndex>({ tasks: [], topics: [] });
const keyboardHintMode = ref(false);
const keyboardHintPrefix = ref('');
const keyboardHintTargets = shallowRef<KeyboardHintTarget[]>([]);
const keyboardActionAnnouncement = ref('');
const keyboardReorderingTaskId = ref<string | null>(null);
const isMacPlatform = ref(false);
let commandPaletteRequestId = 0;
let keyboardHintModifierArmed = false;
let keyboardHintRefreshFrame: number | null = null;
let keyboardHintActionTimers: ReturnType<typeof setTimeout>[] = [];
let keyboardHintMutationObserver: MutationObserver | null = null;
const selectedAnnotationAttachment = ref<Attachment | null>(null);
const selectedAttachmentForDeletion = ref<Attachment | null>(null);
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
let taskDetailRefreshInFlight: Promise<void> | null = null;
let taskDetailRefreshQueued = false;
let commentMentionVisibilityObserver: IntersectionObserver | null = null;
const commentMentionSeenTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCommentMentionAckIds = new Set<string>();
let commentMentionAckInFlight: Promise<void> | null = null;
let lastAutoFocusedMentionKey = '';
let refinementPollTimer: ReturnType<typeof setTimeout> | null = null;
let annotationResizeObserver: ResizeObserver | null = null;
let annotationResizeFrame: number | null = null;
const DONE_RETENTION_MS = 30 * 60 * 1000;
const UNASSIGNED_ID = '__unassigned__';

const loginForm = reactive({ email: '', password: '' });
const userForm = reactive({ name: '', email: '', password: '', role: 'member' as User['role'] });
const userFormError = ref<string | null>(null);
const userFormElement = ref<HTMLFormElement | null>(null);
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
const taskDetailsBaseline = ref('');
const refinementDraftDirty = ref(false);
let taskModalBaselineVersion = 0;

const pendingFileFingerprint = (items: PendingTaskFile[]) => items.map((item) => ({
  name: item.file.name,
  size: item.file.size,
  type: item.file.type,
  lastModified: item.file.lastModified,
  purpose: item.purpose,
  annotated: Boolean(item.renderedFile),
}));

// Nuxt UI's Markdown editor currently renders task-list markers as ordinary
// bullets. Treat that lossless-for-the-editor normalization as equivalent so
// simply opening a Codex refinement with acceptance checkboxes does not create
// a false unsaved-change state.
const normalizeEditorMarkdown = (value: string) => value
  .replace(/\r\n/g, '\n')
  .replace(/^(\s*[-+*])\s+\[(?: |x|X)\]\s+/gm, '$1 ')
  .trimEnd();

function taskDetailsFingerprint() {
  return JSON.stringify({
    title: taskForm.title,
    description: normalizeEditorMarkdown(taskForm.description),
    columnId: taskForm.columnId,
    placementId: taskForm.placementId,
    swimlaneId: taskForm.swimlaneId,
    assigneeId: taskForm.assigneeId,
    agentEnabled: taskForm.agentEnabled,
    priority: taskForm.priority,
    tags: [...taskForm.tags].sort((left, right) => left.localeCompare(right)),
    files: pendingFileFingerprint(taskFiles.value.filter((item) => item.purpose === 'task')),
  });
}

function taskDraftFingerprint() {
  return JSON.stringify({
    details: taskDetailsFingerprint(),
    inlineFiles: pendingFileFingerprint(taskFiles.value.filter((item) => item.purpose !== 'task')),
    taskMessage: taskMessage.value,
    commentMessage: commentMessage.value,
    followUpMessage: followUpMessage.value,
    refinementDraftDirty: refinementDraftDirty.value,
  });
}

const taskModalDirty = computed(() => Boolean(
  taskModalBaseline.value
  && taskDraftFingerprint() !== taskModalBaseline.value,
));
const taskDetailsDirty = computed(() => Boolean(
  taskDetailsBaseline.value
  && taskDetailsFingerprint() !== taskDetailsBaseline.value,
));

function markTaskModalClean() {
  taskModalBaseline.value = taskDraftFingerprint();
  taskDetailsBaseline.value = taskDetailsFingerprint();
}

function markTaskDetailsPersisted() {
  const details = taskDetailsFingerprint();
  taskDetailsBaseline.value = details;
  if (!taskModalBaseline.value) return;
  try {
    const baseline = JSON.parse(taskModalBaseline.value) as Record<string, unknown>;
    taskModalBaseline.value = JSON.stringify({ ...baseline, details });
  } catch {
    // A missing/corrupt local baseline must never block a successfully saved
    // task. The next modal open establishes a fresh snapshot.
    taskModalBaseline.value = '';
  }
}

async function establishTaskModalBaseline() {
  const version = ++taskModalBaselineVersion;
  taskModalBaseline.value = '';
  taskDetailsBaseline.value = '';
  refinementDraftDirty.value = false;
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
  taskDetailsBaseline.value = '';
  discardTaskModalOpen.value = false;
  refinementOverwriteModalOpen.value = false;
  pendingRefinementApplyId.value = null;
  deleteAttachmentModalOpen.value = false;
  selectedAttachmentForDeletion.value = null;
  tagDropdownOpen.value = false;
  taskModalOpen.value = false;
  taskCreateRequestId.value = '';
  closeTaskEventStream();
  stopRefinementPolling();
  taskRefinements.value = [];
  selectedRefinementId.value = null;
  clearTaskFiles();
}

function requestCloseTaskModal() {
  if (!taskModalOpen.value || taskSubmitting.value || refinementBusy.value) return;
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
// Nuxt UI forwards this object to DialogContent, while its public type omits global ARIA attributes.
const taskModalContentProps = { 'aria-modal': 'true' } as unknown as NonNullable<ModalProps['content']>;

const t = computed(() => dictionary[locale.value]);
const commandPaletteInputProps = computed(() => ({
  fixed: true,
  'aria-label': t.value.commandPalettePlaceholder,
}) as unknown as Exclude<CommandPaletteProps['input'], boolean | undefined>);
const isDarkMode = computed(() => colorMode.value === 'dark');
const themeToggleLabel = computed(() => isDarkMode.value ? t.value.lightMode : t.value.darkMode);
const themeToggleIcon = computed(() => isDarkMode.value ? 'i-lucide-sun' : 'i-lucide-moon');
const isAdmin = computed(() => user.value?.role === 'admin');
const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value) ?? null);
const selectedOberthema = computed(() => board.value?.oberthemen.find((topic) => topic.id === selectedOberthemaId.value) ?? null);
const selectedUnterthema = computed(() => board.value?.unterthemen.find((topic) => topic.id === selectedUnterthemaId.value) ?? null);
const userInitials = computed(() => {
  const source = user.value?.name?.trim() || user.value?.email?.split('@')[0] || 'AK';
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
});
const selectedTopicUnterthemen = computed(() => board.value?.unterthemen.filter((topic) => topic.oberthemaId === selectedOberthemaId.value) ?? []);
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
const taskAttachmentFiles = computed(() => taskFiles.value.filter((item) => item.purpose === 'task'));
const guidanceFiles = computed(() => taskFiles.value.filter((item) => item.purpose === 'guidance'));
const followUpFiles = computed(() => taskFiles.value.filter((item) => item.purpose === 'follow-up'));
const unsentInlineDraftTab = computed<'activity' | 'comments' | null>(() => {
  if (commentMessage.value.trim()) return 'comments';
  if (taskMessage.value.trim() || followUpMessage.value.trim() || guidanceFiles.value.length || followUpFiles.value.length) {
    return 'activity';
  }
  return null;
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
const defaultTaskAssigneeId = computed(() => (
  user.value
  && board.value?.project.id === selectedProjectId.value
  && board.value.members.some((member) => member.id === user.value?.id)
    ? user.value.id
    : UNASSIGNED_ID
));
const boardAssigneeItems = computed(() => [
  { label: t.value.unassigned, value: UNASSIGNED_ID, icon: 'i-lucide-user-round-x' },
  ...(board.value?.members ?? []).map((member) => ({
    label: member.id === user.value?.id ? `${member.name} (${t.value.you})` : member.name,
    value: member.id,
    icon: 'i-lucide-user-round',
  })),
]);
const selectedBoardAssigneeLabel = computed(() => {
  if (!selectedBoardAssigneeIds.value.length) return t.value.allResponsible;
  if (selectedBoardAssigneeIds.value.length > 1) {
    return `${selectedBoardAssigneeIds.value.length} ${t.value.selectedCount}`;
  }
  return boardAssigneeItems.value.find((item) => item.value === selectedBoardAssigneeIds.value[0])?.label
    ?? t.value.allResponsible;
});
const hasActiveBoardFilters = computed(() => Boolean(
  boardSearchQuery.value.trim() || selectedBoardAssigneeIds.value.length,
));
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
const unreadCommentMentionCount = computed(() => selectedTaskDetail.value?.unreadMentionCount ?? 0);
const selectedCommentMentionMembers = computed(() => (board.value?.members ?? [])
  .filter((member) => commentMentionUserIds.value.includes(member.id)));
const commentMentionSuggestions = computed(() => {
  const query = commentMentionQuery.value.trim().toLocaleLowerCase();
  return (board.value?.members ?? [])
    .filter((member) => member.id !== user.value?.id)
    .filter((member) => {
      if (!query) return true;
      return `${member.name} ${member.email}`.toLocaleLowerCase().includes(query);
    })
    .slice(0, 6);
});

function closeCommentMentionSuggestions() {
  commentMentionOpen.value = false;
  commentMentionQuery.value = '';
  commentMentionStart.value = null;
  commentMentionEnd.value = null;
  commentMentionActiveIndex.value = 0;
}

function resetCommentComposer() {
  commentMessage.value = '';
  commentMentionUserIds.value = [];
  closeCommentMentionSuggestions();
}

function syncSelectedCommentMentions(body: string) {
  const members = new Map((board.value?.members ?? []).map((member) => [member.id, member]));
  commentMentionUserIds.value = commentMentionUserIds.value.filter((userId) => {
    const member = members.get(userId);
    return Boolean(member && body.includes(`@${member.name}`));
  });
}

function handleCommentInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  const body = textarea.value;
  commentMessage.value = body;
  syncSelectedCommentMentions(body);
  const cursor = textarea.selectionStart ?? body.length;
  const prefix = body.slice(0, cursor);
  const mentionStart = prefix.lastIndexOf('@');
  const precedingCharacter = mentionStart > 0 ? prefix[mentionStart - 1] : '';
  const query = mentionStart >= 0 ? prefix.slice(mentionStart + 1) : '';
  const selectedMentionCompleted = selectedCommentMentionMembers.value
    .some((member) => query.startsWith(`${member.name} `));
  if (
    mentionStart < 0
    || (precedingCharacter && !/[\s([{]/.test(precedingCharacter))
    || query.includes('\n')
    || query.length > 50
    || selectedMentionCompleted
  ) {
    closeCommentMentionSuggestions();
    return;
  }
  commentMentionStart.value = mentionStart;
  commentMentionEnd.value = cursor;
  commentMentionQuery.value = query;
  commentMentionActiveIndex.value = 0;
  commentMentionOpen.value = true;
}

function selectCommentMention(member: User) {
  const start = commentMentionStart.value;
  const end = commentMentionEnd.value;
  if (start === null || end === null) return;
  const mention = `@${member.name}`;
  const before = commentMessage.value.slice(0, start);
  const after = commentMessage.value.slice(end).replace(/^\s+/, '');
  commentMessage.value = `${before}${mention} ${after}`;
  if (!commentMentionUserIds.value.includes(member.id)) {
    commentMentionUserIds.value = [...commentMentionUserIds.value, member.id];
  }
  const caret = before.length + mention.length + 1;
  closeCommentMentionSuggestions();
  void nextTick(() => {
    const textarea = commentComposerEl.value?.querySelector('textarea');
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
}

function removeCommentMention(member: User) {
  commentMentionUserIds.value = commentMentionUserIds.value.filter((userId) => userId !== member.id);
  commentMessage.value = commentMessage.value.replace(`@${member.name}`, member.name);
  closeCommentMentionSuggestions();
}

function handleCommentMentionKeydown(event: KeyboardEvent) {
  if (!commentMentionOpen.value || !commentMentionSuggestions.value.length) {
    if (event.key === 'Escape') closeCommentMentionSuggestions();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    commentMentionActiveIndex.value = (
      commentMentionActiveIndex.value
      + direction
      + commentMentionSuggestions.value.length
    ) % commentMentionSuggestions.value.length;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const member = commentMentionSuggestions.value[commentMentionActiveIndex.value];
    if (member) selectCommentMention(member);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCommentMentionSuggestions();
  }
}

function commentSegments(comment: TaskComment) {
  if (!comment.mentions.length) return [{ text: comment.body, mention: false, currentUser: false }];
  const mentions = comment.mentions
    .map((mention) => ({ ...mention, token: `@${mention.userName}` }))
    .sort((left, right) => right.token.length - left.token.length);
  const segments: Array<{ text: string; mention: boolean; currentUser: boolean }> = [];
  let cursor = 0;
  while (cursor < comment.body.length) {
    let nextMention: (typeof mentions)[number] | null = null;
    let nextIndex = -1;
    for (const mention of mentions) {
      const index = comment.body.indexOf(mention.token, cursor);
      if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
        nextIndex = index;
        nextMention = mention;
      }
    }
    if (!nextMention || nextIndex < 0) {
      segments.push({ text: comment.body.slice(cursor), mention: false, currentUser: false });
      break;
    }
    if (nextIndex > cursor) {
      segments.push({ text: comment.body.slice(cursor, nextIndex), mention: false, currentUser: false });
    }
    segments.push({
      text: nextMention.token,
      mention: true,
      currentUser: nextMention.userId === user.value?.id,
    });
    cursor = nextIndex + nextMention.token.length;
  }
  return segments;
}

function stopCommentMentionVisibilityObserver() {
  commentMentionVisibilityObserver?.disconnect();
  commentMentionVisibilityObserver = null;
  for (const timer of commentMentionSeenTimers.values()) clearTimeout(timer);
  commentMentionSeenTimers.clear();
}

function isCommentMostlyVisible(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.height <= 0 || rect.width <= 0) return false;
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  return visibleHeight / rect.height >= 0.6;
}

async function acknowledgeCommentMentions(commentIds: string[]) {
  for (const commentId of commentIds) pendingCommentMentionAckIds.add(commentId);
  if (commentMentionAckInFlight || !selectedTaskId.value) return;
  const taskId = selectedTaskId.value;
  commentMentionAckInFlight = (async () => {
    while (pendingCommentMentionAckIds.size && selectedTaskId.value === taskId) {
      const batch = [...pendingCommentMentionAckIds];
      pendingCommentMentionAckIds.clear();
      try {
        const response = await $fetch<{ ok: true; count: number }>(`/api/tasks/${taskId}/mentions/read`, {
          method: 'POST',
          body: { commentIds: batch },
        });
        const acknowledgedIds = new Set(batch);
        if (selectedTaskDetail.value?.task.id === taskId) {
          selectedTaskDetail.value = {
            ...selectedTaskDetail.value,
            unreadMentionCount: Math.max(0, selectedTaskDetail.value.unreadMentionCount - response.count),
            comments: selectedTaskDetail.value.comments.map((comment) => (
              acknowledgedIds.has(comment.id) ? { ...comment, unreadMention: false } : comment
            )),
          };
        }
        if (board.value) {
          board.value = {
            ...board.value,
            tasks: board.value.tasks.map((task) => task.id === taskId
              ? {
                ...task,
                unreadMentionCount: Math.max(0, (task.unreadMentionCount ?? 0) - response.count),
                latestUnreadMentionAt: response.count >= (task.unreadMentionCount ?? 0)
                  ? null
                  : task.latestUnreadMentionAt,
              }
              : task),
          };
        }
      } catch {
        for (const commentId of batch) pendingCommentMentionAckIds.add(commentId);
        window.setTimeout(() => void setupCommentMentionVisibilityObserver(), 2000);
        break;
      }
    }
  })().finally(() => {
    commentMentionAckInFlight = null;
  });
  await commentMentionAckInFlight;
}

async function setupCommentMentionVisibilityObserver() {
  stopCommentMentionVisibilityObserver();
  if (
    !import.meta.client
    || document.hidden
    || !taskModalOpen.value
    || activeTaskTab.value !== 'comments'
    || !selectedTaskId.value
    || !unreadCommentMentionCount.value
  ) return;
  await nextTick();
  if (document.hidden || activeTaskTab.value !== 'comments') return;
  const elements = [...document.querySelectorAll<HTMLElement>('#task-panel-comments [data-unread-mention="true"]')];
  if (!elements.length) return;
  commentMentionVisibilityObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const commentId = (entry.target as HTMLElement).dataset.commentId;
      if (!commentId) continue;
      if (!entry.isIntersecting || entry.intersectionRatio < 0.6) {
        const timer = commentMentionSeenTimers.get(commentId);
        if (timer) clearTimeout(timer);
        commentMentionSeenTimers.delete(commentId);
        continue;
      }
      if (commentMentionSeenTimers.has(commentId)) continue;
      commentMentionSeenTimers.set(commentId, setTimeout(() => {
        commentMentionSeenTimers.delete(commentId);
        if (isCommentMostlyVisible(entry.target)) void acknowledgeCommentMentions([commentId]);
      }, 450));
    }
  }, { threshold: [0.6] });
  for (const element of elements) commentMentionVisibilityObserver.observe(element);

  const firstUnread = elements[0];
  const focusKey = `${selectedTaskId.value}:${firstUnread?.dataset.commentId ?? ''}`;
  if (firstUnread && focusKey !== lastAutoFocusedMentionKey) {
    lastAutoFocusedMentionKey = focusKey;
    firstUnread.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
}

const selectedTaskRefinement = computed(() => taskRefinements.value.find((run) => run.id === selectedRefinementId.value)
  ?? taskRefinements.value[0]
  ?? null);
const activeTaskRefinement = computed(() => taskRefinements.value.find((run) => ['queued', 'running'].includes(run.status)) ?? null);
const refinementPanelRuns = computed(() => taskRefinements.value.map((run) => ({
  id: run.id,
  status: run.status,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  sourceCodeRevision: run.sourceCodeRevision,
  resultCodeRevision: run.resultCodeRevision,
  sourceDescription: run.sourceDescription,
  questions: run.questions
    .filter((question) => run.status !== 'awaiting_input' || !question.answeredAt)
    .map((question) => ({
      id: question.id,
      prompt: question.question,
      context: question.rationale,
      required: question.required,
      answer: typeof question.answer === 'string'
        ? question.answer
        : Array.isArray(question.answer)
          ? question.answer.join(', ')
          : question.answer === undefined || question.answer === null
            ? ''
            : String(question.answer),
    })),
  resultMarkdown: run.resultMarkdown,
  visuals: run.visuals.map((visual) => ({
    id: visual.attachmentId,
    url: `/api/tasks/${run.taskId}/attachments/${visual.attachmentId}`,
    downloadUrl: `/api/tasks/${run.taskId}/attachments/${visual.attachmentId}?download=1`,
    title: visual.fileName,
    description: visual.caption || visual.prompt,
    alt: visual.caption || visual.fileName,
  })),
  errorMessage: run.error,
  appliedAt: run.appliedAt,
})));
const selectedRefinementPanelRun = computed(() => refinementPanelRuns.value.find((run) => run.id === selectedTaskRefinement.value?.id) ?? null);
const selectedRefinementDescriptionChanged = computed(() => {
  const run = selectedTaskRefinement.value;
  if (!run || run.status !== 'completed' || run.appliedAt) return false;
  return normalizeEditorMarkdown(taskForm.description) !== normalizeEditorMarkdown(run.sourceDescription ?? '');
});

function cancelRefinementOverwrite() {
  if (refinementBusy.value) return;
  refinementOverwriteModalOpen.value = false;
  pendingRefinementApplyId.value = null;
}
const taskTabs = computed(() => [
  { key: 'task' as const, label: t.value.taskTab, icon: 'i-lucide-file-text' },
  { key: 'refinement' as const, label: t.value.refinementTab, icon: 'i-lucide-wand-sparkles' },
  ...(selectedTaskId.value && (editingTask.value?.agentEnabled || hasAgentActivity.value)
    ? [{ key: 'activity' as const, label: t.value.activityTab, icon: 'i-lucide-activity' }]
    : []),
  ...(selectedTaskId.value
    ? [{ key: 'comments' as const, label: t.value.commentsTab, icon: 'i-lucide-messages-square' }]
    : []),
]);
const handleTaskTabKeydown = async (event: KeyboardEvent, currentKey: TaskTab) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = taskTabs.value;
  const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.key === currentKey));
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];
  if (!nextTab) return;
  if (nextTab.key === 'refinement') openTaskRefinementTab();
  else activeTaskTab.value = nextTab.key;
  if (activeTaskTab.value !== nextTab.key) return;
  await nextTick();
  document.getElementById(`task-tab-${nextTab.key}`)?.focus();
};
const latestAgentUpdate = computed(() => latestAgentTimelineUpdate(selectedTaskDetail.value?.events ?? []));
const taskAttachments = computed(() => editingTask.value?.attachments ?? []);
const taskImageAttachments = computed(() => (editingTask.value?.attachments ?? []).filter(isImageAttachment));
const selectedAnnotationName = computed(() => selectedAnnotationAttachment.value?.fileName ?? selectedAnnotationPendingFile.value?.file.name ?? '');
const selectedAnnotationImageUrl = computed(() => selectedAnnotationAttachment.value?.url ?? selectedAnnotationPendingFile.value?.url ?? '');
const columnItems = computed(() => board.value?.columns.map((column) => ({
  label: columnName(column),
  value: column.id,
})) ?? []);
const taskModalDescription = computed(() => {
  const task = editingTask.value;
  if (!selectedTaskId.value || !task) return t.value.taskDialog;
  const execution = taskForm.agentEnabled ? taskStatusLabel(task.agentStatus) : t.value.humanTask;
  const column = columnItems.value.find((item) => item.value === taskForm.columnId)?.label;
  return [task.key, execution, column].filter(Boolean).join(' · ');
});
const placementItems = computed(() => board.value?.oberthemen.flatMap((topic) => [
  { label: `${t.value.oberthema}: ${topic.name}`, value: `oberthema:${topic.id}` },
  ...unterthemenFor(topic.id).map((subtopic) => ({
    label: `↳ ${subtopic.name}`,
    value: `unterthema:${subtopic.id}`,
  })),
]) ?? []);
const boardScopeItems = computed(() => [
  { label: t.value.allTasks, value: 'project' },
  ...(board.value?.oberthemen.flatMap((topic) => [
    { label: topic.name, value: `oberthema:${topic.id}` },
    ...unterthemenFor(topic.id).map((subtopic) => ({
      label: `${topic.name} › ${subtopic.name}`,
      value: `unterthema:${subtopic.id}`,
    })),
  ]) ?? []),
]);
const selectedBoardScope = computed(() => selectedUnterthemaId.value
  ? `unterthema:${selectedUnterthemaId.value}`
  : selectedOberthemaId.value
    ? `oberthema:${selectedOberthemaId.value}`
    : 'project');
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
const editingCurrentUser = computed(() => Boolean(editingUserId.value && editingUserId.value === user.value?.id));

useHead(() => ({
  title: t.value.app,
  link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  meta: [{ name: 'theme-color', content: isDarkMode.value ? '#09090b' : '#0f766e' }],
}));

const userColumns = computed<TableColumn<User & { roleLabel: string }>[]>(() => [
  { accessorKey: 'name', header: t.value.userName },
  { accessorKey: 'email', header: t.value.email },
  { accessorKey: 'role', header: t.value.role },
  { id: 'actions', header: '' },
]);

const formatUserInitials = (row: User) => row.name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || row.email.slice(0, 1).toUpperCase();

const focusSidebarElement = (selector: string) => nextTick(() => {
  requestAnimationFrame(() => (document.querySelector(selector) as HTMLElement | null)?.focus());
});

const openMobileSidebar = () => {
  sidebarCollapsed.value = false;
  focusSidebarElement('[data-mobile-sidebar-close]');
};

const closeMobileSidebar = (restoreFocus = true) => {
  sidebarCollapsed.value = true;
  if (!restoreFocus) return;
  focusSidebarElement(isMobileViewport.value ? '[data-mobile-sidebar-trigger]' : '[data-sidebar-expand]');
};

const closeSidebarOnMobile = () => {
  if (isMobileViewport.value) closeMobileSidebar();
};

const selectAdminView = (view: Extract<View, 'projects' | 'users'>) => {
  activeView.value = view;
  closeSidebarOnMobile();
};

const trapMobileSidebarFocus = (event: KeyboardEvent) => {
  if (event.key !== 'Tab' || sidebarCollapsed.value || !isMobileViewport.value) return;
  const sidebar = document.querySelector('.ak-sidebar');
  if (!sidebar) return;
  const focusable = [...sidebar.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('inert') && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
    event.preventDefault();
    first?.focus();
  }
};

const handleWindowKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) {
    keyboardHintModifierArmed = false;
    if (keyboardHintMode.value) deactivateKeyboardHintMode();
    return;
  }
  if (isKeyboardHintModifierEvent(event)) {
    if (!event.repeat) {
      keyboardHintModifierArmed = Boolean(
        user.value
        && !commandPaletteOpen.value
        && keyboardHintModifierIsAlone(event),
      );
    }
    return;
  }
  if (keyboardHintModifierArmed) keyboardHintModifierArmed = false;
  if (keyboardHintMode.value) {
    handleKeyboardHintModeKeydown(event);
    return;
  }
  if (event.key === 'Escape' && !sidebarCollapsed.value && isMobileViewport.value) {
    closeMobileSidebar();
    return;
  }
  trapMobileSidebarFocus(event);
};

const handleWindowKeyup = (event: KeyboardEvent) => {
  if (!isKeyboardHintModifierEvent(event)) return;
  const shouldToggle = keyboardHintModifierArmed;
  keyboardHintModifierArmed = false;
  if (!shouldToggle || !user.value || commandPaletteOpen.value) return;
  if (!isMacPlatform.value) event.preventDefault();
  toggleKeyboardHintMode();
};

const handleWindowPointerDown = () => {
  keyboardHintModifierArmed = false;
  if (keyboardHintMode.value) deactivateKeyboardHintMode();
};

const handleWindowScroll = () => {
  if (keyboardHintMode.value) scheduleKeyboardHintRefresh();
};

const handleWindowFocusIn = () => {
  if (keyboardHintMode.value) scheduleKeyboardHintRefresh();
};

const handleWindowTransitionEnd = (event: TransitionEvent) => {
  if (event.target instanceof Element && event.target.closest('[data-keyboard-hints]')) return;
  if (keyboardHintMode.value) scheduleKeyboardHintRefresh();
};

const handleWindowBlur = () => {
  keyboardHintModifierArmed = false;
  if (keyboardHintMode.value) deactivateKeyboardHintMode();
};

const handleVisibilityChange = () => {
  if (document.hidden) handleWindowBlur();
  else if (activeTaskTab.value === 'comments') void setupCommentMentionVisibilityObserver();
};

const syncMobileViewport = () => {
  const nextMobile = window.matchMedia('(max-width: 767px)').matches;
  const focusWasInSidebar = document.querySelector('.ak-sidebar')?.contains(document.activeElement) ?? false;
  if (nextMobile && !isMobileViewport.value) {
    sidebarCollapsed.value = true;
    if (focusWasInSidebar) focusSidebarElement('[data-mobile-sidebar-trigger]');
  }
  if (!nextMobile && isMobileViewport.value) {
    sidebarCollapsed.value = localStorage.getItem('ak_sidebar_collapsed') === 'true';
    if (sidebarCollapsed.value && focusWasInSidebar) focusSidebarElement('[data-sidebar-expand]');
  }
  isMobileViewport.value = nextMobile;
  if (annotationModalOpen.value) scheduleAnnotationCanvasSync();
  if (keyboardHintMode.value) scheduleKeyboardHintRefresh();
};

onMounted(async () => {
  const navigatorWithPlatform = navigator as Navigator & { userAgentData?: { platform?: string } };
  isMacPlatform.value = /Mac|iPhone|iPad|iPod/i.test(
    navigatorWithPlatform.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent,
  );
  locale.value = (localStorage.getItem('ak_locale') as Locale | null) ?? 'en';
  syncMobileViewport();
  sidebarCollapsed.value = isMobileViewport.value
    || localStorage.getItem('ak_sidebar_collapsed') === 'true';
  selectedProjectId.value = localStorage.getItem('ak_project');
  window.addEventListener('keydown', handleWindowKeydown, true);
  window.addEventListener('keyup', handleWindowKeyup, true);
  window.addEventListener('pointerdown', handleWindowPointerDown, true);
  window.addEventListener('scroll', handleWindowScroll, true);
  window.addEventListener('focusin', handleWindowFocusIn, true);
  window.addEventListener('transitionend', handleWindowTransitionEnd, true);
  window.addEventListener('resize', syncMobileViewport);
  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  await loadSession();
  startBoardRefresh();
});

watch(locale, (value) => localStorage.setItem('ak_locale', value));
watch(sidebarCollapsed, (value) => {
  if (!isMobileViewport.value) localStorage.setItem('ak_sidebar_collapsed', String(value));
});
watch(selectedProjectId, async (value) => {
  if (value) localStorage.setItem('ak_project', value);
  if (value && user.value) await loadBoard(value);
});
watch(taskModalOpen, (open) => {
  if (!open) {
    closeTaskEventStream();
    stopRefinementPolling();
    stopCommentMentionVisibilityObserver();
    pendingCommentMentionAckIds.clear();
    lastAutoFocusedMentionKey = '';
  }
});
watch(
  [activeTaskTab, selectedTaskId, unreadCommentMentionCount],
  () => void setupCommentMentionVisibilityObserver(),
);
watch(annotationModalOpen, (open) => {
  if (!open) stopAnnotationResizeObserver();
});

onBeforeUnmount(() => {
  if (boardRefreshTimer) clearInterval(boardRefreshTimer);
  if (import.meta.client) {
    window.removeEventListener('keydown', handleWindowKeydown, true);
    window.removeEventListener('keyup', handleWindowKeyup, true);
    window.removeEventListener('pointerdown', handleWindowPointerDown, true);
    window.removeEventListener('scroll', handleWindowScroll, true);
    window.removeEventListener('focusin', handleWindowFocusIn, true);
    window.removeEventListener('transitionend', handleWindowTransitionEnd, true);
    window.removeEventListener('resize', syncMobileViewport);
    window.removeEventListener('blur', handleWindowBlur);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
  deactivateKeyboardHintMode();
  closeTaskEventStream();
  stopCommentMentionVisibilityObserver();
  stopRefinementPolling();
  stopAnnotationResizeObserver();
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
  const allowedBoardAssignees = new Set([UNASSIGNED_ID, ...board.value.members.map((member) => member.id)]);
  selectedBoardAssigneeIds.value = selectedBoardAssigneeIds.value.filter((id) => allowedBoardAssignees.has(id));
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
  if (!user.value || activeView.value !== 'board' || !selectedProjectId.value || refreshingBoard.value || hierarchyReordering.value || commandPaletteOpen.value) return;
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

const clearBoardFilters = () => {
  boardSearchQuery.value = '';
  selectedBoardAssigneeIds.value = [];
};

const selectProject = async (projectId: string) => {
  if (selectedProjectId.value !== projectId) {
    selectedOberthemaId.value = null;
    selectedUnterthemaId.value = null;
    clearBoardFilters();
  }
  selectedProjectId.value = projectId;
  activeView.value = 'board';
  closeSidebarOnMobile();
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

const selectBoardScope = (value: string) => {
  if (value === 'project') {
    selectProjectOverview();
    return;
  }
  const [kind, id] = value.split(':', 2);
  if (!id) return;
  if (kind === 'oberthema') selectOberthema(id);
  if (kind === 'unterthema') selectUnterthema(id);
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

const openUserModal = (row?: User) => {
  editingUserId.value = row?.id ?? null;
  userFormError.value = null;
  Object.assign(userForm, {
    name: row?.name ?? '',
    email: row?.email ?? '',
    password: '',
    role: row?.role ?? 'member',
  });
  userModalOpen.value = true;
};

function stopRefinementPolling() {
  if (!refinementPollTimer) return;
  clearTimeout(refinementPollTimer);
  refinementPollTimer = null;
}

async function loadTaskRefinements(taskId: string, options: { silent?: boolean } = {}) {
  try {
    const response = await $fetch<{ refinements: TaskRefinementApi[] }>(`/api/tasks/${taskId}/refinements`);
    if (selectedTaskId.value !== taskId) return;
    taskRefinements.value = response.refinements;
    if (!selectedRefinementId.value || !response.refinements.some((run) => run.id === selectedRefinementId.value)) {
      selectedRefinementId.value = response.refinements[0]?.id ?? null;
    }
  } catch (error) {
    if (!options.silent) errorMessage.value = humanError(error);
  }
}

function scheduleRefinementPolling() {
  stopRefinementPolling();
  const taskId = selectedTaskId.value;
  if (!taskModalOpen.value || !taskId || !activeTaskRefinement.value) return;
  refinementPollTimer = setTimeout(async () => {
    refinementPollTimer = null;
    if (!taskModalOpen.value || selectedTaskId.value !== taskId) return;
    await loadTaskRefinements(taskId, { silent: true });
    scheduleRefinementPolling();
  }, 1800);
}

function openTaskRefinementTab() {
  errorMessage.value = null;
  activeTaskTab.value = 'refinement';
}

async function focusTaskTitleForRefinement() {
  errorMessage.value = t.value.refinementTitleRequired;
  activeTaskTab.value = 'task';
  await nextTick();
  document.getElementById('task-title')?.focus();
}

async function startTaskRefinement(payload: { brief: string; visualMode: 'auto' }) {
  if (refinementBusy.value || taskSubmitting.value) return;
  if (!taskForm.title.trim()) {
    await focusTaskTitleForRefinement();
    return;
  }
  const taskWasNew = !selectedTaskId.value;
  refinementBusy.value = true;
  errorMessage.value = null;
  try {
    const taskId = await persistTaskBeforeRefinement();
    const response = await $fetch<{ refinement: TaskRefinementApi }>(`/api/tasks/${taskId}/refinements`, {
      method: 'POST',
      body: payload,
    });
    taskRefinements.value = [response.refinement, ...taskRefinements.value.filter((run) => run.id !== response.refinement.id)];
    selectedRefinementId.value = response.refinement.id;
    refinementDraftDirty.value = false;
    scheduleRefinementPolling();
  } catch (error) {
    const persistedTaskId = selectedTaskId.value;
    if (persistedTaskId) {
      await loadTaskRefinements(persistedTaskId, { silent: true });
      const recoveredRun = activeTaskRefinement.value;
      if (recoveredRun) {
        selectedRefinementId.value = recoveredRun.id;
        refinementDraftDirty.value = false;
        scheduleRefinementPolling();
        return;
      }
    }
    errorMessage.value = taskWasNew && persistedTaskId
      ? t.value.refinementCreatedButNotStarted
      : humanError(error);
  } finally {
    refinementBusy.value = false;
  }
}

async function submitRefinementAnswers(payload: { runId: string; answers: Record<string, string> }) {
  const taskId = selectedTaskId.value;
  if (!taskId || refinementBusy.value) return;
  refinementBusy.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ refinement: TaskRefinementApi }>(`/api/tasks/${taskId}/refinements/${payload.runId}/answers`, {
      method: 'POST',
      body: { answers: payload.answers },
    });
    taskRefinements.value = taskRefinements.value.map((run) => run.id === response.refinement.id ? response.refinement : run);
    selectedRefinementId.value = response.refinement.id;
    scheduleRefinementPolling();
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    refinementBusy.value = false;
  }
}

function refinementDescriptionChangedFor(runId: string) {
  const run = taskRefinements.value.find((item) => item.id === runId);
  if (!run) return false;
  return normalizeEditorMarkdown(taskForm.description) !== normalizeEditorMarkdown(run.sourceDescription ?? '');
}

function requestApplyTaskRefinement(runId: string) {
  errorMessage.value = null;
  if (refinementDescriptionChangedFor(runId)) {
    pendingRefinementApplyId.value = runId;
    refinementOverwriteModalOpen.value = true;
    return;
  }
  void applyTaskRefinement(runId);
}

async function applyTaskRefinement(runId: string, allowDescriptionOverwrite = false) {
  const taskId = selectedTaskId.value;
  if (!taskId || !selectedTaskDetail.value?.task || refinementBusy.value) return false;
  refinementBusy.value = true;
  errorMessage.value = null;
  try {
    // Preserve title, placement, tags and other open details before replacing
    // the description. These edits do not invalidate a refinement.
    if (taskDetailsDirty.value) {
      await persistExistingTaskDetails(taskId);
      await refreshPersistedTaskState(taskId);
    }
    await $fetch(`/api/tasks/${taskId}/refinements/${runId}/apply`, {
      method: 'POST',
      body: { mode: 'replace', allowDescriptionOverwrite },
    });
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${taskId}`);
    taskForm.description = selectedTaskDetail.value.task.description ?? '';
    await loadTaskRefinements(taskId, { silent: true });
    if (selectedProjectId.value) await loadBoard(selectedProjectId.value);
    activeTaskTab.value = 'task';
    await establishTaskModalBaseline();
    refinementOverwriteModalOpen.value = false;
    pendingRefinementApplyId.value = null;
    return true;
  } catch (error) {
    if (!allowDescriptionOverwrite && errorStatusKey(error) === 'refinement_description_changed') {
      pendingRefinementApplyId.value = runId;
      refinementOverwriteModalOpen.value = true;
    } else {
      errorMessage.value = humanError(error);
    }
    return false;
  } finally {
    refinementBusy.value = false;
  }
}

async function confirmApplyTaskRefinement() {
  const runId = pendingRefinementApplyId.value;
  if (!runId) return;
  await applyTaskRefinement(runId, true);
}

async function retryTaskRefinement(runId: string) {
  const run = taskRefinements.value.find((item) => item.id === runId);
  await startTaskRefinement({ brief: run?.brief?.trim() || taskForm.title, visualMode: 'auto' });
}

function selectTaskRefinement(runId: string) {
  selectedRefinementId.value = runId;
}

function syncTaskFormFromDetail(detailTask: Task) {
  Object.assign(taskForm, {
    title: detailTask.title,
    description: detailTask.description ?? '',
    columnId: detailTask.columnId,
    placementId: placementIdFor(detailTask),
    swimlaneId: detailTask.swimlaneId ?? defaultSwimlaneId.value,
    assigneeId: detailTask.assigneeId ?? UNASSIGNED_ID,
    agentEnabled: detailTask.agentEnabled,
    priority: detailTask.priority,
    tags: detailTask.tags,
  });
}

const openTaskModal = async (columnId?: string, placement?: TaskPlacement) => {
  closeTaskEventStream();
  stopRefinementPolling();
  errorMessage.value = null;
  selectedTaskId.value = null;
  taskCreateRequestId.value = fileId();
  selectedTaskDetail.value = null;
  taskRefinements.value = [];
  selectedRefinementId.value = null;
  refinementDraftDirty.value = false;
  taskMessage.value = '';
  resetCommentComposer();
  followUpMessage.value = '';
  tagDropdownOpen.value = false;
  activeTaskTab.value = 'task';
  Object.assign(taskForm, {
    title: '',
    description: '',
    columnId: columnId ?? backlogColumn.value?.id ?? '',
    placementId: placement ? placementIdFor(placement) : defaultPlacementId.value,
    swimlaneId: defaultSwimlaneId.value,
    assigneeId: defaultTaskAssigneeId.value,
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
  stopRefinementPolling();
  errorMessage.value = null;
  refinementDraftDirty.value = false;
  selectedTaskId.value = task.id;
  taskCreateRequestId.value = '';
  taskRefinements.value = [];
  selectedRefinementId.value = null;
  clearTaskFiles();
  taskMessage.value = '';
  resetCommentComposer();
  followUpMessage.value = '';
  tagDropdownOpen.value = false;
  const [detail] = await Promise.all([
    $fetch<TaskDetail>(`/api/tasks/${task.id}`),
    loadTaskRefinements(task.id),
  ]);
  selectedTaskDetail.value = detail;
  const latestRefinement = taskRefinements.value[0];
  activeTaskTab.value = latestRefinement
    && !latestRefinement.appliedAt
    && ['queued', 'running', 'awaiting_input', 'completed'].includes(latestRefinement.status)
    ? 'refinement'
    : hasAgentActivity.value
      ? 'activity'
      : 'task';
  syncTaskFormFromDetail(selectedTaskDetail.value.task);
  taskModalOpen.value = true;
  openTaskEventStream(task.id);
  scheduleRefinementPolling();
  await establishTaskModalBaseline();
};

const closeTaskEventStream = () => {
  taskEventSource?.close();
  taskEventSource = null;
  taskDetailRefreshQueued = false;
};

const refreshTaskDetailFromActivity = (taskId: string) => {
  if (taskDetailRefreshInFlight) {
    taskDetailRefreshQueued = true;
    return taskDetailRefreshInFlight;
  }

  taskDetailRefreshInFlight = (async () => {
    do {
      taskDetailRefreshQueued = false;
      const detail = await $fetch<TaskDetail>(`/api/tasks/${taskId}`);
      if (selectedTaskId.value === taskId) selectedTaskDetail.value = detail;
    } while (taskDetailRefreshQueued && selectedTaskId.value === taskId);
  })()
    .catch(() => {
      // The regular board refresh and the next SSE invalidation retry this
      // transiently. Avoid an unhandled rejection while the modal is open.
    })
    .finally(() => {
      taskDetailRefreshInFlight = null;
    });

  return taskDetailRefreshInFlight;
};

const openTaskEventStream = (taskId: string) => {
  closeTaskEventStream();
  if (!import.meta.client) return;
  taskEventSource = new EventSource(`/api/tasks/${taskId}/events`);
  taskEventSource.addEventListener('activity', () => {
    if (selectedTaskId.value === taskId) void refreshTaskDetailFromActivity(taskId);
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
  deactivateKeyboardHintMode();
  commandPaletteOpen.value = false;
  commandPaletteQuery.value = '';
  commandPaletteIndex.value = { tasks: [], topics: [] };
  user.value = null;
  board.value = null;
  projects.value = [];
  boardFilterPopoverOpen.value = false;
  clearBoardFilters();
};

const saveUserAction = async () => {
  if (userSubmitting.value) return;
  userFormError.value = null;
  userSubmitting.value = true;
  try {
    const body = {
      name: userForm.name,
      email: userForm.email,
      password: userForm.password || undefined,
      role: userForm.role,
    };
    const response = editingUserId.value
      ? await $fetch<{ users: User[] }>(`/api/users/${editingUserId.value}`, { method: 'PATCH', body })
      : await $fetch<{ users: User[] }>('/api/users', { method: 'POST', body: { ...body, password: userForm.password } });
    users.value = response.users;
    const currentUser = response.users.find((row) => row.id === user.value?.id);
    if (currentUser && user.value) {
      user.value = {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
      };
    }
    Object.assign(userForm, { name: '', email: '', password: '', role: 'member' });
    editingUserId.value = null;
    userModalOpen.value = false;
  } catch (error) {
    userFormError.value = humanError(error);
  } finally {
    userSubmitting.value = false;
  }
};

const submitUserForm = () => {
  if (!userFormElement.value?.reportValidity()) return;
  void saveUserAction();
};

const requestDeleteUser = (row: User) => {
  if (row.id === user.value?.id) return;
  errorMessage.value = null;
  selectedUserForDeletion.value = row;
  deleteUserModalOpen.value = true;
};

const closeDeleteUserModal = () => {
  if (userSubmitting.value) return;
  deleteUserModalOpen.value = false;
  selectedUserForDeletion.value = null;
};

const confirmDeleteUserAction = async () => {
  const target = selectedUserForDeletion.value;
  if (!target || target.id === user.value?.id || userSubmitting.value) return;
  userSubmitting.value = true;
  errorMessage.value = null;
  try {
    const response = await $fetch<{ users: User[] }>(`/api/users/${target.id}`, { method: 'DELETE' });
    users.value = response.users;
    deleteUserModalOpen.value = false;
    selectedUserForDeletion.value = null;
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    userSubmitting.value = false;
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

async function createTaskFromCurrentForm() {
  const projectId = selectedProjectId.value;
  if (!projectId) throw new Error('missing_project');
  if (!taskForm.title.trim()) throw new Error('missing_title');

  taskForm.swimlaneId = taskForm.swimlaneId || defaultSwimlaneId.value;
  taskForm.placementId = taskForm.placementId || defaultPlacementId.value;
  taskCreateRequestId.value = taskCreateRequestId.value || fileId();
  const placement = parsePlacementId(taskForm.placementId);
  const files = [...taskAttachmentFiles.value];
  const form = new FormData();
  form.append('title', taskForm.title);
  if (taskForm.description) form.append('description', taskForm.description);
  if (taskForm.columnId) form.append('columnId', taskForm.columnId);
  if (taskForm.swimlaneId) form.append('swimlaneId', taskForm.swimlaneId);
  form.append('oberthemaId', placement.oberthemaId);
  if (placement.unterthemaId) form.append('unterthemaId', placement.unterthemaId);
  form.append('assigneeId', taskAssigneeIdForRequest() ?? '');
  form.append('agentEnabled', String(taskForm.agentEnabled));
  form.append('clientRequestId', taskCreateRequestId.value);
  form.append('priority', taskForm.priority);
  form.append('tags', JSON.stringify(taskForm.tags));
  await appendTaskFiles(form, files);

  const response = await $fetch<{ task: Task }>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: form });
  if (!response.task?.id) throw new Error('task_create_invalid_response');
  removePendingTaskFiles(files);
  return response.task;
}

async function persistExistingTaskDetails(taskId: string) {
  const placement = parsePlacementId(taskForm.placementId);
  const tags = taskForm.tags;
  const assigneeId = taskAssigneeIdForRequest();
  if (!hasAgentActivity.value) {
    await $fetch(`/api/tasks/${taskId}`, {
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
    await $fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: { tags, ...placement, assigneeId, agentEnabled: taskForm.agentEnabled },
    });
  }

  const files = [...taskAttachmentFiles.value];
  if (files.length) {
    const attachmentForm = new FormData();
    await appendTaskFiles(attachmentForm, files);
    await $fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: attachmentForm });
    removePendingTaskFiles(files);
  }
}

async function refreshPersistedTaskState(taskId: string) {
  const detail = await $fetch<TaskDetail>(`/api/tasks/${taskId}`);
  if (selectedTaskId.value !== taskId) return;
  selectedTaskDetail.value = detail;
  if (selectedProjectId.value) {
    try {
      await loadBoard(selectedProjectId.value);
    } catch {
      // Refreshing the board is presentational and must not prevent a saved
      // task from entering refinement. The regular board refresh retries it.
    }
  }
  syncTaskFormFromDetail(detail.task);
  markTaskDetailsPersisted();
  openTaskEventStream(taskId);
}

async function persistTaskBeforeRefinement() {
  let taskId = selectedTaskId.value;
  if (!taskId) {
    const createdTask = await createTaskFromCurrentForm();
    taskId = createdTask.id;
    // Adopt the persisted task before any follow-up request. A retry after a
    // transient detail/refinement failure must never create a duplicate task.
    selectedTaskId.value = taskId;
    await refreshPersistedTaskState(taskId);
  } else if (taskDetailsDirty.value) {
    await persistExistingTaskDetails(taskId);
    await refreshPersistedTaskState(taskId);
  }
  return taskId;
}

const saveTaskAction = async () => {
  if (!selectedProjectId.value || taskSubmitting.value) return;
  if (!selectedTaskId.value && !taskForm.title.trim()) return;
  if (selectedTaskId.value && unsentInlineDraftTab.value) {
    errorMessage.value = t.value.finishInlineDraft;
    activeTaskTab.value = unsentInlineDraftTab.value;
    return;
  }
  errorMessage.value = null;
  taskSubmitting.value = true;
  const keepOpenForRefinement = refinementDraftDirty.value;
  try {
    if (selectedTaskId.value) {
      const taskId = selectedTaskId.value;
      await persistExistingTaskDetails(taskId);
      if (keepOpenForRefinement) {
        await refreshPersistedTaskState(taskId);
        activeTaskTab.value = 'refinement';
        return;
      }
      closeTaskModalImmediately();
      await loadBoard(selectedProjectId.value);
    } else {
      const createdTask = await createTaskFromCurrentForm();
      if (keepOpenForRefinement) {
        selectedTaskId.value = createdTask.id;
        await refreshPersistedTaskState(createdTask.id);
        activeTaskTab.value = 'refinement';
        return;
      }
      closeTaskModalImmediately();
      await nextTick();
      Object.assign(taskForm, {
        title: '',
        description: '',
        columnId: backlogColumn.value?.id ?? '',
        placementId: defaultPlacementId.value,
        swimlaneId: defaultSwimlaneId.value,
        assigneeId: defaultTaskAssigneeId.value,
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
      body: {
        body: commentMessage.value,
        mentionUserIds: commentMentionUserIds.value,
      },
    });
    resetCommentComposer();
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const sendGuidanceAction = async () => {
  if (!selectedTaskId.value || !selectedProjectId.value || taskSubmitting.value || !canSendGuidance.value) return;
  if (!taskMessage.value.trim() && !guidanceFiles.value.length) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  try {
    if (guidanceFiles.value.length) {
      const filesToUpload = [...guidanceFiles.value];
      const attachmentForm = new FormData();
      await appendTaskFiles(attachmentForm, filesToUpload);
      await $fetch(`/api/tasks/${selectedTaskId.value}/attachments`, { method: 'POST', body: attachmentForm });
      removePendingTaskFiles(filesToUpload);
      selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}`);
    }
    if (taskMessage.value.trim()) {
      await $fetch(`/api/tasks/${selectedTaskId.value}/messages`, {
        method: 'POST',
        body: { body: taskMessage.value },
      });
    }
    taskMessage.value = '';
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}`);
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const requestFollowUpAction = async () => {
  if (!selectedTaskId.value || !selectedProjectId.value || taskSubmitting.value) return;
  if (!followUpMessage.value.trim() && !followUpFiles.value.length) return;
  errorMessage.value = null;
  taskSubmitting.value = true;
  const body = followUpMessage.value.trim() || t.value.followUpFilesOnlyMessage;
  let filesUploaded = false;
  try {
    if (followUpFiles.value.length) {
      const filesToUpload = [...followUpFiles.value];
      const attachmentForm = new FormData();
      await appendTaskFiles(attachmentForm, filesToUpload);
      await $fetch(`/api/tasks/${selectedTaskId.value}/attachments`, { method: 'POST', body: attachmentForm });
      removePendingTaskFiles(filesToUpload);
      filesUploaded = true;
      selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}`);
    }
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}/messages`, {
      method: 'POST',
      body: { body },
    });
    followUpMessage.value = '';
    activeTaskTab.value = 'activity';
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    if (filesUploaded && !followUpMessage.value.trim()) followUpMessage.value = body;
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
    resetCommentComposer();
    followUpMessage.value = '';
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    taskSubmitting.value = false;
  }
};

const requestDeleteAttachment = (attachment: Attachment) => {
  if (!selectedTaskId.value || attachmentSubmitting.value) return;
  selectedAttachmentForDeletion.value = attachment;
  deleteAttachmentModalOpen.value = true;
};

const downloadTaskAttachment = async (attachment: Attachment) => {
  if (downloadingAttachmentId.value || !import.meta.client) return;
  downloadingAttachmentId.value = attachment.id;
  errorMessage.value = null;
  try {
    const response = await fetch(attachmentDownloadUrl(attachment), { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`attachment_download_failed:${response.status}`);
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = attachment.fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    errorMessage.value = t.value.downloadAttachmentError;
  } finally {
    downloadingAttachmentId.value = null;
  }
};

const confirmDeleteAttachmentAction = async () => {
  const attachment = selectedAttachmentForDeletion.value;
  if (!selectedTaskId.value || !selectedProjectId.value || !attachment || attachmentSubmitting.value) return;
  errorMessage.value = null;
  attachmentSubmitting.value = true;
  try {
    selectedTaskDetail.value = await $fetch<TaskDetail>(`/api/tasks/${selectedTaskId.value}/attachments/${attachment.id}`, {
      method: 'DELETE',
    });
    if (selectedAnnotationAttachment.value?.id === attachment.id) {
      selectedAnnotationAttachment.value = null;
      annotationModalOpen.value = false;
    }
    deleteAttachmentModalOpen.value = false;
    selectedAttachmentForDeletion.value = null;
    await loadBoard(selectedProjectId.value);
  } catch (error) {
    errorMessage.value = humanError(error);
  } finally {
    attachmentSubmitting.value = false;
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

const announceKeyboardMove = (name: string, position: number, total: number) => {
  keyboardActionAnnouncement.value = '';
  void nextTick(() => {
    keyboardActionAnnouncement.value = t.value.keyboardMovePosition
      .replace('{name}', name)
      .replace('{position}', String(position))
      .replace('{total}', String(total));
  });
};

const focusTaskCard = (taskId: string) => nextTick(() => {
  document.querySelector<HTMLElement>(`.ak-task-card[data-task-id="${CSS.escape(taskId)}"]`)
    ?.focus({ preventScroll: true });
});

const moveTaskByKeyboard = async (task: Task, direction: -1 | 1) => {
  if (keyboardReorderingTaskId.value) return;
  const siblings = tasksForPlacementColumn(task.oberthemaId, task.unterthemaId, task.columnId);
  const index = siblings.findIndex((candidate) => candidate.id === task.id);
  if (index < 0 || (direction < 0 && index === 0) || (direction > 0 && index === siblings.length - 1)) return;
  const beforeTaskId = direction < 0 ? siblings[index - 1]?.id : siblings[index + 2]?.id;
  keyboardReorderingTaskId.value = task.id;
  errorMessage.value = null;
  try {
    await moveTask(task.id, task.columnId, {
      oberthemaId: task.oberthemaId,
      unterthemaId: task.unterthemaId,
    }, beforeTaskId);
    announceKeyboardMove(task.title, index + direction + 1, siblings.length);
  } catch (error) {
    errorMessage.value = humanError(error);
    if (selectedProjectId.value) await loadBoard(selectedProjectId.value);
  } finally {
    keyboardReorderingTaskId.value = null;
    await focusTaskCard(task.id);
  }
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
  if (!selectedProjectId.value || !board.value || hierarchyReordering.value) return false;
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
    return true;
  } catch (error) {
    errorMessage.value = humanError(error);
    await loadBoard(selectedProjectId.value);
    return false;
  } finally {
    hierarchyReordering.value = false;
    clearHierarchyDragState();
  }
};

const focusHierarchyHandle = (kind: 'oberthema' | 'unterthema', id: string) => nextTick(() => {
  document.querySelector<HTMLElement>(`[data-keyboard-reorder="${kind}:${CSS.escape(id)}"]`)
    ?.focus({ preventScroll: true });
});

const moveOberthemaByKeyboard = async (oberthemaId: string, direction: -1 | 1) => {
  if (!board.value || hierarchyReordering.value) return;
  const topics = [...board.value.oberthemen];
  const index = topics.findIndex((topic) => topic.id === oberthemaId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= topics.length) return;
  const [topic] = topics.splice(index, 1);
  if (!topic) return;
  topics.splice(targetIndex, 0, topic);
  board.value = { ...board.value, oberthemen: topics };
  if (await persistHierarchyOrder()) announceKeyboardMove(topic.name, targetIndex + 1, topics.length);
  await focusHierarchyHandle('oberthema', oberthemaId);
};

const moveUnterthemaByKeyboard = async (unterthemaId: string, direction: -1 | 1) => {
  if (!board.value || hierarchyReordering.value) return;
  const subtopic = board.value.unterthemen.find((candidate) => candidate.id === unterthemaId);
  if (!subtopic) return;
  const siblings = unterthemenFor(subtopic.oberthemaId);
  const index = siblings.findIndex((candidate) => candidate.id === unterthemaId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
  const reorderedSiblings = [...siblings];
  const [movedSubtopic] = reorderedSiblings.splice(index, 1);
  if (!movedSubtopic) return;
  reorderedSiblings.splice(targetIndex, 0, movedSubtopic);
  board.value = {
    ...board.value,
    unterthemen: board.value.oberthemen.flatMap((topic) => (
      topic.id === subtopic.oberthemaId ? reorderedSiblings : unterthemenFor(topic.id)
    )),
  };
  if (await persistHierarchyOrder()) announceKeyboardMove(subtopic.name, targetIndex + 1, siblings.length);
  await focusHierarchyHandle('unterthema', unterthemaId);
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
  const purpose: PendingTaskFile['purpose'] = selectedTaskId.value && activeTaskTab.value === 'activity'
    ? canRequestFollowUp.value ? 'follow-up' : 'guidance'
    : 'task';
  const items: PendingTaskFile[] = files.map((file) => ({
    id: fileId(),
    file,
    url: URL.createObjectURL(file),
    purpose,
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

const removePendingTaskFiles = (items: Array<Pick<PendingTaskFile, 'id'>>) => {
  const ids = new Set(items.map((item) => item.id));
  if (!ids.size) return;
  for (const pendingFile of taskFiles.value) {
    if (!ids.has(pendingFile.id)) continue;
    URL.revokeObjectURL(pendingFile.url);
    if (pendingFile.annotatedUrl) URL.revokeObjectURL(pendingFile.annotatedUrl);
  }
  taskFiles.value = taskFiles.value.filter((entry) => !ids.has(entry.id));
  if (selectedAnnotationPendingFile.value && ids.has(selectedAnnotationPendingFile.value.id)) {
    selectedAnnotationPendingFile.value = null;
    annotationModalOpen.value = false;
  }
};

const removePendingTaskFile = (item: Pick<PendingTaskFile, 'id'>) => removePendingTaskFiles([item]);

const appendTaskFiles = async (form: FormData, files: PendingTaskFile[]) => {
  const annotations: Array<{
    index: number;
    annotationData: AnnotationData;
    renderedImage: string;
  }> = [];

  for (const [index, item] of files.entries()) {
    form.append('files', item.file);
    if (!item.renderedFile) continue;
    annotations.push({
      index,
      annotationData: cloneAnnotationData(item.annotation),
      renderedImage: await fileToDataUrl(item.renderedFile),
    });
  }

  if (annotations.length) form.append('annotations', JSON.stringify(annotations));
};

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
const attachmentIcon = (attachment: Attachment) => {
  if (isImageAttachment(attachment)) return 'i-lucide-image';
  if (attachment.mimeType === 'application/pdf') return 'i-lucide-file-text';
  if (attachment.mimeType.startsWith('audio/')) return 'i-lucide-file-audio';
  if (attachment.mimeType.startsWith('video/')) return 'i-lucide-file-video';
  if (attachment.mimeType.includes('zip') || attachment.mimeType.includes('compressed')) return 'i-lucide-file-archive';
  return 'i-lucide-file';
};
const attachmentDownloadUrl = (attachment: Attachment) => `${attachment.url}?download=1`;
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(locale.value === 'de' ? 'de-CH' : 'en', { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)} ${unit}`;
};

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
const boardFilterCandidates = computed(() => (board.value?.tasks ?? [])
  .filter(isTaskVisible)
  .filter((task) => {
    if (!selectedBoardAssigneeIds.value.length) return true;
    if (!task.assigneeId) return selectedBoardAssigneeIds.value.includes(UNASSIGNED_ID);
    return selectedBoardAssigneeIds.value.includes(task.assigneeId);
  }));
const visibleTasks = computed(() => {
  const tasks = boardFilterCandidates.value;
  const query = boardSearchQuery.value.trim();
  if (!query) return tasks;

  const searchableTasks = tasks.map((task) => ({
    task,
    title: task.title,
    description: plainTextDescription(task.description),
  }));
  if (query.length === 1) {
    const normalizedQuery = query.toLocaleLowerCase(locale.value === 'de' ? 'de-CH' : 'en');
    return searchableTasks
      .filter((item) => `${item.title} ${item.description}`.toLocaleLowerCase(locale.value === 'de' ? 'de-CH' : 'en').includes(normalizedQuery))
      .map((item) => item.task);
  }

  return new Fuse(searchableTasks, {
    keys: [
      { name: 'title', weight: 0.65 },
      { name: 'description', weight: 0.35 },
    ],
    threshold: 0.36,
    distance: 120,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true,
  }).search(query).map((result) => result.item.task);
});
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
const taskCountForPlacement = (oberthemaId: string, unterthemaId: string | null) => visibleTasks.value.filter((task) => (
  task.oberthemaId === oberthemaId && task.unterthemaId === unterthemaId
)).length;
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
const taskMentionNotificationLabel = (task: Task) => {
  const count = task.unreadMentionCount ?? 0;
  return count === 1
    ? t.value.commentMentionNotificationSingle
    : t.value.commentMentionNotification.replace('{count}', String(count));
};
const taskCardLabel = (task: Task) => [
  task.key,
  task.title,
  taskHierarchyLabel(task),
  `${t.value.assignee}: ${taskAssigneeLabel(task)}`,
  task.unreadMentionCount ? taskMentionNotificationLabel(task) : null,
].filter(Boolean).join(' · ');
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

const latestAgentTimelineUpdate = (events: TaskEvent[]) => {
  for (const event of [...events].reverse()) {
    if (event.action === 'codex_failed') {
      const rawError = metadataString(parseMetadata(event.metadata).error) ?? 'Unknown error';
      const error = rawError.includes('task_worktree_branch_mismatch')
        ? t.value.agentWorktreeResumeFailed
        : rawError;
      return {
        body: t.value.agentRunFailed.replace('{error}', error),
        createdAt: event.createdAt,
        tone: 'error' as const,
      };
    }
    if (event.action === 'codex_completed') {
      return {
        body: t.value.agentRunCompleted,
        createdAt: event.createdAt,
        tone: 'success' as const,
      };
    }
    if (event.action === 'codex_started') {
      return {
        body: t.value.agentRunStarted,
        createdAt: event.createdAt,
        tone: 'info' as const,
      };
    }
    if (event.action === 'codex_text_update') {
      const body = metadataString(parseMetadata(event.metadata).body);
      if (body) return { body, createdAt: event.createdAt, tone: 'neutral' as const };
    }
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

const stopAnnotationResizeObserver = () => {
  annotationResizeObserver?.disconnect();
  annotationResizeObserver = null;
  if (annotationResizeFrame !== null) {
    cancelAnimationFrame(annotationResizeFrame);
    annotationResizeFrame = null;
  }
};

const scheduleAnnotationCanvasSync = () => {
  if (!import.meta.client || !annotationModalOpen.value) return;
  if (annotationResizeFrame !== null) cancelAnimationFrame(annotationResizeFrame);
  annotationResizeFrame = requestAnimationFrame(() => {
    annotationResizeFrame = null;
    resizeAnnotationCanvas();
    redrawAnnotationCanvas();
  });
};

const observeAnnotationImageSize = () => {
  stopAnnotationResizeObserver();
  const image = annotationImageEl.value;
  if (!image || typeof ResizeObserver === 'undefined') return;
  annotationResizeObserver = new ResizeObserver(() => scheduleAnnotationCanvasSync());
  annotationResizeObserver.observe(image);
};

const onAnnotationImageLoad = () => {
  observeAnnotationImageSize();
  scheduleAnnotationCanvasSync();
};

const resizeAnnotationCanvas = () => {
  const canvas = annotationCanvas.value;
  const image = annotationImageEl.value;
  if (!canvas || !image) return;
  const width = image.clientWidth;
  const height = image.clientHeight;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
};

const redrawAnnotationCanvas = () => {
  const canvas = annotationCanvas.value;
  const image = annotationImageEl.value;
  if (!canvas || !image) return;
  const width = image.clientWidth;
  const height = image.clientHeight;
  if (!width || !height) return;
  resizeAnnotationCanvas();
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  for (const stroke of [...annotationData.value.strokes, ...(drawingStroke.value ? [drawingStroke.value] : [])]) {
    drawStroke(context, stroke, width, height, 1);
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
  const displayedWidth = annotationImageEl.value?.clientWidth || width;
  const displayScale = width / displayedWidth;
  for (const stroke of annotationData.value.strokes) {
    drawStroke(context, stroke, width, height, displayScale);
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

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (typeof reader.result === 'string') resolve(reader.result);
    else reject(new Error('annotation_file_read_failed'));
  }, { once: true });
  reader.addEventListener('error', () => reject(reader.error ?? new Error('annotation_file_read_failed')), { once: true });
  reader.readAsDataURL(file);
});

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

const hasBlockingOverlay = computed(() => Boolean(
  projectModalOpen.value
  || userModalOpen.value
  || taskModalOpen.value
  || discardTaskModalOpen.value
  || oberthemaModalOpen.value
  || unterthemaModalOpen.value
  || deleteUserModalOpen.value
  || deleteTaskModalOpen.value
  || deleteAttachmentModalOpen.value
  || annotationModalOpen.value,
));

const canUseWorkspaceShortcuts = computed(() => Boolean(
  user.value && !commandPaletteOpen.value && !keyboardHintMode.value && !hasBlockingOverlay.value,
));

const canUseBoardShortcuts = computed(() => Boolean(
  canUseWorkspaceShortcuts.value
  && activeView.value === 'board'
  && selectedProjectId.value
  && board.value,
));

const KEYBOARD_HINT_ALPHABET = 'ASDFGHJKLQWERTYUIOPZXCVBNM';
const KEYBOARD_HINT_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="radio"]',
  '[data-keytip]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const keyboardHintModifierLabel = computed(() => isMacPlatform.value ? 'Control' : 'Alt');
const keyboardHintModifierKbd = computed(() => isMacPlatform.value ? 'ctrl' : 'alt');
const matchingKeyboardHintTargets = computed(() => {
  const prefix = keyboardHintPrefix.value;
  return prefix
    ? keyboardHintTargets.value.filter((target) => target.code.startsWith(prefix))
    : keyboardHintTargets.value;
});
const keyboardHintInstruction = computed(() => t.value.keyboardHintsInstruction.replace(
  '{modifier}',
  keyboardHintModifierLabel.value,
));
const keyboardHintCountLabel = computed(() => keyboardHintTargets.value.length
  ? t.value.keyboardHintsCount.replace('{count}', String(keyboardHintTargets.value.length))
  : t.value.keyboardHintsNoControls);

const isKeyboardHintModifierEvent = (event: KeyboardEvent) => {
  if (event.getModifierState?.('AltGraph')) return false;
  if (isMacPlatform.value) return event.key === 'Control';
  return event.key === 'Alt'
    && event.location !== KeyboardEvent.DOM_KEY_LOCATION_RIGHT
    && (!event.code || event.code === 'AltLeft');
};

const keyboardHintModifierIsAlone = (event: KeyboardEvent) => isMacPlatform.value
  ? !event.altKey && !event.metaKey && !event.shiftKey
  : !event.ctrlKey && !event.metaKey && !event.shiftKey;

const clearKeyboardHintActionTimers = () => {
  for (const timer of keyboardHintActionTimers) clearTimeout(timer);
  keyboardHintActionTimers = [];
};

const keyboardHintElementVisible = (element: HTMLElement) => {
  if (!element.isConnected || element.closest('[inert], [aria-hidden="true"], [data-keyboard-hints], [data-keytip-ignore]')) return false;
  if (element.matches('[disabled], [aria-disabled="true"]')) return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') === 0) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  let visibleLeft = Math.max(0, rect.left);
  let visibleRight = Math.min(window.innerWidth, rect.right);
  let visibleTop = Math.max(0, rect.top);
  let visibleBottom = Math.min(window.innerHeight, rect.bottom);
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const ancestorStyle = getComputedStyle(ancestor);
    const clipsX = /(auto|scroll|hidden|clip)/.test(ancestorStyle.overflowX);
    const clipsY = /(auto|scroll|hidden|clip)/.test(ancestorStyle.overflowY);
    if (clipsX || clipsY) {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (clipsX) {
        visibleLeft = Math.max(visibleLeft, ancestorRect.left);
        visibleRight = Math.min(visibleRight, ancestorRect.right);
      }
      if (clipsY) {
        visibleTop = Math.max(visibleTop, ancestorRect.top);
        visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
      }
    }
    ancestor = ancestor.parentElement;
  }
  if (visibleRight - visibleLeft < 2 || visibleBottom - visibleTop < 2) return false;
  const pointX = visibleLeft + (visibleRight - visibleLeft) / 2;
  const pointY = visibleTop + (visibleBottom - visibleTop) / 2;
  const topElement = document.elementFromPoint(pointX, pointY);
  return !topElement || element.contains(topElement) || topElement.contains(element);
};

const keyboardHintScope = () => {
  const visibleScopes = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
    .filter((element) => keyboardHintElementVisible(element));
  const popups = visibleScopes('[role="listbox"], [role="menu"], [data-reka-popper-content-wrapper]')
    .filter((element) => (
      element.matches('[role="listbox"], [role="menu"]')
      || (!element.querySelector('[role="tooltip"]') && Boolean(element.querySelector(KEYBOARD_HINT_SELECTOR)))
    ));
  if (popups.length) return popups.at(-1)!;
  const dialogs = visibleScopes('[role="dialog"]');
  if (dialogs.length) return dialogs.at(-1)!;
  return document.querySelector<HTMLElement>('.ak-workspace-shell') ?? document.body;
};

const keyboardHintCode = (index: number, total: number) => {
  const base = KEYBOARD_HINT_ALPHABET.length;
  let width = 1;
  while (base ** width < total) width += 1;
  let value = index;
  const characters = Array<string>(width).fill(KEYBOARD_HINT_ALPHABET[0]!);
  for (let position = width - 1; position >= 0; position -= 1) {
    characters[position] = KEYBOARD_HINT_ALPHABET[value % base]!;
    value = Math.floor(value / base);
  }
  return characters.join('');
};

const keyboardHintLabel = (element: HTMLElement) => {
  const labelledBy = element.getAttribute('aria-labelledby');
  const labelledText = labelledBy
    ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    : '';
  const labels = element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    ? [...(element.labels ?? [])].map((label) => label.textContent ?? '').join(' ')
    : '';
  const keyTipLabel = element.getAttribute('data-keytip-label')
    ?? element.closest<HTMLElement>('[data-keytip-label]')?.dataset.keytipLabel;
  return [
    element.getAttribute('aria-label'),
    labelledText,
    labels,
    keyTipLabel,
    element.getAttribute('title'),
    element.getAttribute('placeholder'),
    element.innerText,
    element.textContent,
  ].find((value) => value?.trim())?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '';
};

const refreshKeyboardHintTargets = () => {
  if (!keyboardHintMode.value || !import.meta.client) return;
  const scope = keyboardHintScope();
  const elements = [...new Set(scope.querySelectorAll<HTMLElement>(KEYBOARD_HINT_SELECTOR))]
    .filter(keyboardHintElementVisible)
    .filter((element) => {
      const nestedInAction = element.parentElement?.closest<HTMLElement>('a[href], button, [role="button"], [role="link"]');
      return !nestedInAction || !scope.contains(nestedInAction) || !keyboardHintElementVisible(nestedInAction);
    })
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .sort((left, right) => {
      const rowDifference = left.rect.top - right.rect.top;
      return Math.abs(rowDifference) > 8 ? rowDifference : left.rect.left - right.rect.left;
    });
  keyboardHintTargets.value = elements.map(({ element, rect }, index) => ({
    code: keyboardHintCode(index, elements.length),
    element,
    label: keyboardHintLabel(element),
    left: Math.min(window.innerWidth - 10, Math.max(10, rect.left + Math.min(rect.width / 2, 8))),
    top: Math.min(window.innerHeight - 10, Math.max(10, rect.top + 2)),
  }));
  if (keyboardHintPrefix.value && !keyboardHintTargets.value.some((target) => target.code.startsWith(keyboardHintPrefix.value))) {
    keyboardHintPrefix.value = '';
  }
};

const scheduleKeyboardHintRefresh = () => {
  if (!import.meta.client || !keyboardHintMode.value) return;
  keyboardHintPrefix.value = '';
  if (keyboardHintRefreshFrame !== null) cancelAnimationFrame(keyboardHintRefreshFrame);
  keyboardHintRefreshFrame = requestAnimationFrame(() => {
    keyboardHintRefreshFrame = null;
    refreshKeyboardHintTargets();
  });
};

const startKeyboardHintMutationObserver = () => {
  keyboardHintMutationObserver?.disconnect();
  if (!keyboardHintMode.value || !document.body) return;
  keyboardHintMutationObserver = new MutationObserver((mutations) => {
    const isOnlyHintLayerMutation = mutations.every((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return Boolean(target?.closest('[data-keyboard-hints]'));
    });
    if (isOnlyHintLayerMutation || !keyboardHintMode.value) return;
    keyboardHintPrefix.value = '';
    scheduleKeyboardHintRefresh();
  });
  keyboardHintMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'aria-hidden', 'aria-disabled', 'disabled', 'data-state', 'inert'],
  });
};

const deactivateKeyboardHintMode = () => {
  keyboardHintMode.value = false;
  keyboardHintPrefix.value = '';
  keyboardHintTargets.value = [];
  keyboardHintModifierArmed = false;
  clearKeyboardHintActionTimers();
  keyboardHintMutationObserver?.disconnect();
  keyboardHintMutationObserver = null;
  if (import.meta.client && keyboardHintRefreshFrame !== null) cancelAnimationFrame(keyboardHintRefreshFrame);
  keyboardHintRefreshFrame = null;
};

const activateKeyboardHintMode = () => {
  if (!import.meta.client || !user.value || commandPaletteOpen.value) return;
  clearKeyboardHintActionTimers();
  keyboardHintPrefix.value = '';
  keyboardHintMode.value = true;
  void nextTick(() => {
    if (!keyboardHintMode.value || !user.value || commandPaletteOpen.value) return;
    refreshKeyboardHintTargets();
    startKeyboardHintMutationObserver();
  });
};

const toggleKeyboardHintMode = () => {
  if (keyboardHintMode.value) deactivateKeyboardHintMode();
  else activateKeyboardHintMode();
};

const keyboardHintIsTextEntry = (element: HTMLElement) => {
  if (element.matches('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'date', 'datetime-local', 'file', 'hidden', 'image', 'month', 'radio', 'range', 'reset', 'submit', 'time', 'week'].includes(element.type);
};

const scheduleKeyboardHintActionRefresh = () => {
  clearKeyboardHintActionTimers();
  for (const delay of [0, 100, 400, 800, 1600]) {
    keyboardHintActionTimers.push(setTimeout(() => {
      if (keyboardHintMode.value) scheduleKeyboardHintRefresh();
    }, delay));
  }
};

watch(hasBlockingOverlay, () => {
  if (keyboardHintMode.value) scheduleKeyboardHintActionRefresh();
});

const triggerKeyboardHintTarget = (target: KeyboardHintTarget) => {
  if (!target.element.isConnected) {
    scheduleKeyboardHintRefresh();
    return;
  }
  keyboardHintPrefix.value = '';
  target.element.focus({ preventScroll: true });
  if (target.element.dataset.keytipAction === 'focus') {
    deactivateKeyboardHintMode();
    target.element.focus();
    return;
  }
  if (keyboardHintIsTextEntry(target.element)) {
    deactivateKeyboardHintMode();
    target.element.focus();
    return;
  }
  if (target.element.matches('[role="option"]')) {
    const listbox = target.element.closest<HTMLElement>('[role="listbox"]');
    if (listbox?.getAttribute('aria-multiselectable') === 'true') {
      target.element.click();
      scheduleKeyboardHintActionRefresh();
      return;
    }
    deactivateKeyboardHintMode();
    target.element.focus();
    target.element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
    target.element.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    }));
    return;
  }
  if (target.element.matches('select, [role="combobox"], [aria-haspopup="listbox"]')) {
    deactivateKeyboardHintMode();
    target.element.focus();
    if (!(target.element instanceof HTMLSelectElement)) {
      target.element.click();
      target.element.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        code: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }));
    }
    return;
  }
  target.element.click();
  scheduleKeyboardHintActionRefresh();
};

const handleKeyboardHintModeKeydown = (event: KeyboardEvent) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.getModifierState?.('AltGraph')) return;
  if (event.key === 'Tab') {
    deactivateKeyboardHintMode();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (keyboardHintPrefix.value) keyboardHintPrefix.value = '';
    else deactivateKeyboardHintMode();
    return;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    event.stopImmediatePropagation();
    keyboardHintPrefix.value = keyboardHintPrefix.value.slice(0, -1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (matchingKeyboardHintTargets.value.length === 1) triggerKeyboardHintTarget(matchingKeyboardHintTargets.value[0]!);
    return;
  }
  const key = event.key.toUpperCase();
  if (key.length === 1 && KEYBOARD_HINT_ALPHABET.includes(key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const nextPrefix = `${keyboardHintPrefix.value}${key}`;
    const candidates = keyboardHintTargets.value.filter((target) => target.code.startsWith(nextPrefix));
    if (!candidates.length) {
      keyboardHintPrefix.value = '';
      return;
    }
    const exactTarget = candidates.find((target) => target.code === nextPrefix);
    if (exactTarget) triggerKeyboardHintTarget(exactTarget);
    else keyboardHintPrefix.value = nextPrefix;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
};

const shortcutEventAllowed = (event?: KeyboardEvent) => Boolean(
  !event
  || (!event.repeat && !event.isComposing && !event.getModifierState?.('AltGraph')),
);

const loadCommandPaletteIndex = async () => {
  const requestId = ++commandPaletteRequestId;
  commandPaletteLoading.value = true;
  commandPaletteError.value = false;
  try {
    const response = await $fetch<CommandPaletteIndex>('/api/command-palette');
    if (requestId === commandPaletteRequestId) commandPaletteIndex.value = response;
  } catch {
    if (requestId === commandPaletteRequestId) commandPaletteError.value = true;
  } finally {
    if (requestId === commandPaletteRequestId) commandPaletteLoading.value = false;
  }
};

const openCommandPalette = (initialQuery = '') => {
  if (!user.value || hasBlockingOverlay.value) return;
  deactivateKeyboardHintMode();
  if (isMobileViewport.value && !sidebarCollapsed.value) closeMobileSidebar(false);
  commandPaletteQuery.value = initialQuery;
  commandPaletteOpen.value = true;
  void loadCommandPaletteIndex();
};

const closeCommandPalette = () => {
  commandPaletteOpen.value = false;
};

watch(commandPaletteOpen, (open) => {
  if (open) return;
  commandPaletteQuery.value = '';
  commandPaletteError.value = false;
});

const runCommandPaletteAction = (action: () => void | Promise<void>) => {
  commandPaletteOpen.value = false;
  void nextTick().then(action).catch((error) => {
    errorMessage.value = humanError(error);
  });
};

const activateCommandProject = async (projectId: string) => {
  if (selectedProjectId.value !== projectId) {
    selectedOberthemaId.value = null;
    selectedUnterthemaId.value = null;
    clearBoardFilters();
    selectedProjectId.value = projectId;
  }
  activeView.value = 'board';
  closeSidebarOnMobile();
  if (board.value?.project.id !== projectId) await loadBoard(projectId);
};

const openCommandTask = async (indexedTask: CommandPaletteTask) => {
  await activateCommandProject(indexedTask.projectId);
  const task = board.value?.tasks.find((candidate) => candidate.id === indexedTask.id);
  if (!task) throw new Error('task_not_found');
  await openTaskDetail(task);
};

const openCommandTopic = async (topic: CommandPaletteTopic) => {
  await activateCommandProject(topic.projectId);
  if (topic.kind === 'unterthema') selectUnterthema(topic.id);
  else selectOberthema(topic.id);
};

const openCommandProject = async (projectId: string) => {
  await activateCommandProject(projectId);
  selectProjectOverview();
};

const createCommandTask = async (title = '') => {
  if (!board.value) return;
  activeView.value = 'board';
  await openTaskModal();
  if (title) taskForm.title = title;
  await nextTick();
  document.getElementById('task-title')?.focus();
};

const focusBoardSearch = async () => {
  if (!board.value || activeView.value !== 'board') return;
  await nextTick();
  const search = document.getElementById('board-task-search') as HTMLInputElement | null;
  search?.focus();
  search?.select();
};

const handleBoardSearchEscape = (event: KeyboardEvent) => {
  if (boardSearchQuery.value) {
    boardSearchQuery.value = '';
    return;
  }
  (event.currentTarget as HTMLInputElement | null)?.blur();
};

const focusAdjacentTask = (direction: 1 | -1) => {
  if (!import.meta.client) return;
  const cards = [...document.querySelectorAll<HTMLElement>('.ak-task-card[data-task-id]')]
    .filter((card) => card.offsetParent !== null && card.getAttribute('aria-hidden') !== 'true');
  if (!cards.length) return;
  const activeCard = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.ak-task-card[data-task-id]');
  const currentIndex = activeCard ? cards.indexOf(activeCard) : -1;
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : cards.length - 1)
    : (currentIndex + direction + cards.length) % cards.length;
  const nextCard = cards[nextIndex];
  nextCard?.focus({ preventScroll: true });
  nextCard?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
};

const toggleWorkspaceSidebar = () => {
  if (sidebarCollapsed.value) openMobileSidebar();
  else closeMobileSidebar();
};

const commandTemplate = (template: string, query: string) => template.replace('{query}', query);
const commandTaskColumnLabel = (task: CommandPaletteTask) => (
  locale.value === 'de' ? task.columnNameDe : task.columnNameEn
) ?? task.columnKey ?? '';
const commandTaskHierarchyLabel = (task: CommandPaletteTask) => [
  task.oberthemaName,
  task.unterthemaName ?? t.value.directTasks,
].filter(Boolean).join(' › ');
const commandTaskDescription = (task: CommandPaletteTask) => [
  task.projectName,
  commandTaskHierarchyLabel(task),
  commandTaskColumnLabel(task),
  task.assigneeName ?? t.value.unassigned,
].filter(Boolean).join(' · ');

const commandTaskItem = (task: CommandPaletteTask): AppCommandPaletteItem => ({
  id: `task:${task.id}`,
  prefix: task.key,
  label: task.title,
  suffix: task.projectKey,
  description: commandTaskDescription(task),
  icon: task.agentEnabled ? 'i-lucide-sparkles' : 'i-lucide-user-round',
  keywords: [
    task.key,
    task.projectKey,
    task.projectName,
    task.oberthemaName,
    task.unterthemaName,
    commandTaskColumnLabel(task),
    task.assigneeName,
    task.assigneeEmail,
    task.agentEnabled ? `${t.value.aiTask} AI agent Codex` : t.value.humanTask,
    ...task.tags,
  ].filter(Boolean).join(' '),
  searchText: plainTextDescription(task.description),
  onSelect: () => runCommandPaletteAction(() => openCommandTask(task)),
});

const commandPaletteGroups = computed<CommandPaletteGroup<AppCommandPaletteItem>[]>(() => {
  const groups: CommandPaletteGroup<AppCommandPaletteItem>[] = [];
  const query = commandPaletteQuery.value.trim();
  const actionItems: AppCommandPaletteItem[] = [];

  if (board.value) {
    if (query) {
      actionItems.push({
        id: 'action:create-query-task',
        label: commandTemplate(t.value.commandCreateWithTitle, query),
        description: t.value.commandCreateWithTitleDescription,
        icon: 'i-lucide-square-pen',
        keywords: `${t.value.newTask} ${t.value.createTask}`,
        onSelect: () => runCommandPaletteAction(() => createCommandTask(query)),
      }, {
        id: 'action:filter-query',
        label: commandTemplate(t.value.commandFilterBoardBy, query),
        description: t.value.commandFilterBoardDescription,
        icon: 'i-lucide-list-filter',
        keywords: `${t.value.searchTasks} ${t.value.boardFilters}`,
        onSelect: () => runCommandPaletteAction(() => {
          boardSearchQuery.value = query;
          activeView.value = 'board';
        }),
      });
    } else {
      actionItems.push({
        id: 'action:new-task',
        label: t.value.newTask,
        description: selectedProject.value?.name ?? t.value.commandCurrentProject,
        icon: 'i-lucide-square-pen',
        kbds: ['N'],
        keywords: t.value.createTask,
        onSelect: () => runCommandPaletteAction(() => createCommandTask()),
      });
    }

    actionItems.push({
      id: 'action:new-parent-topic',
      label: t.value.newOberthema,
      description: selectedProject.value?.name ?? t.value.commandCurrentProject,
      icon: 'i-lucide-network',
      onSelect: () => runCommandPaletteAction(() => openOberthemaModal()),
    });
    if (board.value.oberthemen.length) {
      actionItems.push({
        id: 'action:new-subtopic',
        label: t.value.newUnterthema,
        description: selectedOberthema.value?.name ?? selectedProject.value?.name ?? t.value.commandCurrentProject,
        icon: 'i-lucide-git-branch-plus',
        onSelect: () => runCommandPaletteAction(() => openUnterthemaModal(selectedOberthemaId.value ?? undefined)),
      });
    }
  }

  if (isAdmin.value) {
    actionItems.push({
      id: 'action:new-project',
      label: t.value.createProject,
      icon: 'i-lucide-folder-plus',
      onSelect: () => runCommandPaletteAction(() => openProjectModal()),
    }, {
      id: 'action:new-user',
      label: t.value.createUser,
      icon: 'i-lucide-user-round-plus',
      onSelect: () => runCommandPaletteAction(() => openUserModal()),
    });
  }
  const actionGroup: CommandPaletteGroup<AppCommandPaletteItem> | null = actionItems.length
    ? { id: 'actions', label: t.value.commandGroupActions, items: actionItems, ignoreFilter: true }
    : null;
  if (!query && actionGroup) groups.push(actionGroup);

  if (commandPaletteError.value) {
    groups.push({
      id: 'load-error',
      items: [{
        id: 'status:load-error',
        label: t.value.commandLoadError,
        icon: 'i-lucide-cloud-alert',
        disabled: true,
      }],
      ignoreFilter: true,
    });
  }

  const indexedTasks = query
    ? commandPaletteIndex.value.tasks
    : commandPaletteIndex.value.tasks.slice(0, 6);
  if (indexedTasks.length) {
    groups.push({
      id: 'tasks',
      label: query ? t.value.commandGroupTasks : t.value.commandGroupRecentTasks,
      items: indexedTasks.map(commandTaskItem),
      highlightedIcon: 'i-lucide-corner-down-left',
    });
  }
  // During search, matching tasks take priority. UCommandPalette removes the
  // task group when nothing matches, so quick actions naturally become first.
  if (query && actionGroup) groups.push(actionGroup);

  if (projects.value.length) {
    groups.push({
      id: 'projects',
      label: t.value.commandGroupProjects,
      items: projects.value.map((project) => ({
        id: `project:${project.id}`,
        prefix: project.key,
        label: project.name,
        description: project.description ?? t.value.openBoard,
        icon: project.id === selectedProjectId.value ? 'i-lucide-folder-open' : 'i-lucide-folder',
        active: project.id === selectedProjectId.value && activeView.value === 'board',
        keywords: `${project.key} ${t.value.projects} ${t.value.openBoard}`,
        onSelect: () => runCommandPaletteAction(() => openCommandProject(project.id)),
      })),
    });
  }

  if (query && commandPaletteIndex.value.topics.length) {
    groups.push({
      id: 'topics',
      label: t.value.commandGroupTopics,
      items: commandPaletteIndex.value.topics.map((topic) => ({
        id: `topic:${topic.kind}:${topic.id}`,
        prefix: topic.projectKey,
        label: topic.name,
        suffix: topic.kind === 'oberthema' ? t.value.oberthema : t.value.unterthema,
        description: topic.kind === 'unterthema'
          ? `${topic.projectName} · ${topic.oberthemaName}`
          : topic.projectName,
        icon: topic.kind === 'oberthema' ? 'i-lucide-network' : 'i-lucide-git-branch',
        keywords: `${topic.projectName} ${topic.projectKey} ${topic.oberthemaName} ${topic.description ?? ''}`,
        onSelect: () => runCommandPaletteAction(() => openCommandTopic(topic)),
      })),
    });
  }

  if (board.value && activeView.value === 'board') {
    const filterItems: AppCommandPaletteItem[] = boardAssigneeItems.value.map((assignee) => {
      const active = selectedBoardAssigneeIds.value.includes(assignee.value);
      return {
        id: `filter:assignee:${assignee.value}`,
        label: `${t.value.assignee}: ${assignee.label}`,
        suffix: active ? t.value.commandActive : undefined,
        icon: active ? 'i-lucide-circle-check' : assignee.icon,
        active,
        keywords: `${t.value.boardFilters} ${t.value.assignee} ${assignee.label}`,
        onSelect: (event: Event) => {
          event.preventDefault();
          selectedBoardAssigneeIds.value = active
            ? selectedBoardAssigneeIds.value.filter((id) => id !== assignee.value)
            : [...selectedBoardAssigneeIds.value, assignee.value];
        },
      };
    });
    filterItems.push({
      id: 'filter:completed',
      label: showAllDone.value ? t.value.hideCompleted : t.value.showCompleted,
      suffix: showAllDone.value ? t.value.commandActive : undefined,
      icon: showAllDone.value ? 'i-lucide-eye-off' : 'i-lucide-eye',
      active: showAllDone.value,
      keywords: `${t.value.boardFilters} ${t.value.completedTasks}`,
      onSelect: (event: Event) => {
        event.preventDefault();
        toggleCompletedVisibility();
      },
    });
    if (hasActiveBoardFilters.value || showAllDone.value) {
      filterItems.push({
        id: 'filter:clear',
        label: t.value.clearFilters,
        icon: 'i-lucide-rotate-ccw',
        onSelect: (event: Event) => {
          event.preventDefault();
          clearBoardFilters();
          if (showAllDone.value) toggleCompletedVisibility();
        },
      });
    }
    groups.push({ id: 'filters', label: t.value.commandGroupFilters, items: filterItems });
  }

  const navigationItems: AppCommandPaletteItem[] = [];
  if (board.value) {
    navigationItems.push({
      id: 'navigation:board',
      label: t.value.commandOpenBoardOverview,
      icon: 'i-lucide-columns-3',
      kbds: ['G', 'B'],
      keywords: `${t.value.allTasks} ${t.value.projectOverview}`,
      onSelect: () => runCommandPaletteAction(() => {
        activeView.value = 'board';
        selectProjectOverview();
      }),
    }, {
      id: 'navigation:board-search',
      label: t.value.commandFocusBoardSearch,
      icon: 'i-lucide-search',
      kbds: ['F'],
      onSelect: () => runCommandPaletteAction(focusBoardSearch),
    }, {
      id: 'navigation:next-task',
      label: t.value.commandNextTask,
      icon: 'i-lucide-arrow-down-to-line',
      kbds: ['J'],
      onSelect: () => runCommandPaletteAction(() => focusAdjacentTask(1)),
    }, {
      id: 'navigation:previous-task',
      label: t.value.commandPreviousTask,
      icon: 'i-lucide-arrow-up-to-line',
      kbds: ['K'],
      onSelect: () => runCommandPaletteAction(() => focusAdjacentTask(-1)),
    }, {
      id: 'navigation:refresh',
      label: t.value.commandRefreshBoard,
      icon: 'i-lucide-refresh-cw',
      kbds: ['R'],
      onSelect: () => runCommandPaletteAction(refreshCurrentBoard),
    });
  }
  if (isAdmin.value) {
    navigationItems.push({
      id: 'navigation:projects',
      label: t.value.commandGoToProjects,
      icon: 'i-lucide-folder-cog',
      kbds: ['G', 'P'],
      onSelect: () => runCommandPaletteAction(() => selectAdminView('projects')),
    }, {
      id: 'navigation:users',
      label: t.value.commandGoToUsers,
      icon: 'i-lucide-users-round',
      kbds: ['G', 'U'],
      onSelect: () => runCommandPaletteAction(() => selectAdminView('users')),
    });
  }
  navigationItems.push({
    id: 'navigation:full-keyboard',
    label: t.value.fullKeyboardMode,
    description: t.value.fullKeyboardModeDescription,
    icon: 'i-lucide-keyboard',
    kbds: [keyboardHintModifierKbd.value],
    keywords: 'keytips access keys keyboard tastatur shortcuts',
    onSelect: () => runCommandPaletteAction(activateKeyboardHintMode),
  }, {
    id: 'navigation:sidebar',
    label: t.value.commandToggleSidebar,
    icon: 'i-lucide-panel-left',
    kbds: ['meta', 'B'],
    onSelect: () => runCommandPaletteAction(toggleWorkspaceSidebar),
  }, {
    id: 'navigation:theme',
    label: themeToggleLabel.value,
    icon: themeToggleIcon.value,
    keywords: `${t.value.darkMode} ${t.value.lightMode}`,
    onSelect: () => runCommandPaletteAction(toggleTheme),
  }, {
    id: 'navigation:language',
    label: `${t.value.language}: ${locale.value.toUpperCase()}`,
    description: locale.value === 'de' ? 'Auf Englisch wechseln' : 'Switch to German',
    icon: 'i-lucide-languages',
    keywords: 'Deutsch English DE EN',
    onSelect: () => runCommandPaletteAction(toggleLocale),
  });
  groups.push({ id: 'navigation', label: t.value.commandGroupNavigation, items: navigationItems });

  return groups;
});

defineShortcuts(computed(() => ({
  meta_enter: taskModalOpen.value
    && !keyboardHintMode.value
    && !discardTaskModalOpen.value
    && !refinementOverwriteModalOpen.value
    && !deleteTaskModalOpen.value
    && !deleteAttachmentModalOpen.value
    && !annotationModalOpen.value
    && activeTaskTab.value === 'task'
    && !taskSubmitting.value
    && (selectedTaskId.value ? taskDetailsDirty.value : Boolean(taskForm.title.trim())) ? {
      usingInput: true,
      handler: (event?: KeyboardEvent) => {
        if (shortcutEventAllowed(event)) void saveTaskAction();
      },
    } : false,
  meta_k: user.value && !keyboardHintMode.value && (commandPaletteOpen.value || !hasBlockingOverlay.value) ? {
    usingInput: true,
    handler: (event?: KeyboardEvent) => {
      if (!shortcutEventAllowed(event)) return;
      if (commandPaletteOpen.value) closeCommandPalette();
      else openCommandPalette();
    },
  } : false,
  '/': canUseWorkspaceShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) openCommandPalette();
  } : false,
  '?': canUseWorkspaceShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) openCommandPalette();
  } : false,
  n: canUseBoardShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) void createCommandTask();
  } : false,
  f: canUseBoardShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) void focusBoardSearch();
  } : false,
  r: canUseBoardShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) void refreshCurrentBoard();
  } : false,
  j: canUseBoardShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) focusAdjacentTask(1);
  } : false,
  k: canUseBoardShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) focusAdjacentTask(-1);
  } : false,
  'g-b': canUseWorkspaceShortcuts.value && board.value ? (event?: KeyboardEvent) => {
    if (!shortcutEventAllowed(event)) return;
    activeView.value = 'board';
    selectProjectOverview();
  } : false,
  'g-p': canUseWorkspaceShortcuts.value && isAdmin.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) selectAdminView('projects');
  } : false,
  'g-u': canUseWorkspaceShortcuts.value && isAdmin.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) selectAdminView('users');
  } : false,
  meta_b: canUseWorkspaceShortcuts.value ? (event?: KeyboardEvent) => {
    if (shortcutEventAllowed(event)) toggleWorkspaceSidebar();
  } : false,
})), { chainDelay: 900 });

function errorStatusKey(error: unknown) {
  const candidate = error as {
    statusMessage?: string;
    message?: string;
    data?: { statusMessage?: string; message?: string };
  };
  return (candidate.data?.statusMessage
    ?? candidate.data?.message
    ?? candidate.statusMessage
    ?? candidate.message
    ?? '')
    .trim()
    .toLowerCase();
}

const humanError = (error: unknown) => {
  const key = errorStatusKey(error);
  const label = (en: string, de: string) => locale.value === 'de' ? de : en;
  const messages: Record<string, { en: string; de: string }> = {
    invalid_credentials: { en: 'Email or password is incorrect.', de: 'E-Mail oder Passwort ist nicht korrekt.' },
    unauthorized: { en: 'Please sign in again.', de: 'Bitte melde dich erneut an.' },
    admin_required: { en: 'Only administrators can do this.', de: 'Nur Administratoren können das ausführen.' },
    user_not_found: { en: 'This user no longer exists.', de: 'Dieser Benutzer existiert nicht mehr.' },
    user_email_exists: { en: 'This email address is already used by another user.', de: 'Diese E-Mail-Adresse wird bereits von einem anderen Benutzer verwendet.' },
    self_admin_role_required: { en: 'Your own admin role cannot be removed.', de: 'Du kannst dir deine eigene Adminrolle nicht entziehen.' },
    self_user_delete_forbidden: { en: 'You cannot delete your own account.', de: 'Du kannst dein eigenes Benutzerkonto nicht löschen.' },
    project_not_found: { en: 'The project could not be found.', de: 'Das Projekt wurde nicht gefunden.' },
    project_forbidden: { en: 'You do not have access to this project.', de: 'Du hast keinen Zugriff auf dieses Projekt.' },
    task_not_found: { en: 'The task could not be found.', de: 'Die Aufgabe wurde nicht gefunden.' },
    task_locked_after_agent_start: { en: 'This task is already being worked on. Title and description cannot be changed anymore.', de: 'Diese Aufgabe wird bereits bearbeitet. Titel und Beschreibung können nicht mehr geändert werden.' },
    task_running_cannot_delete: { en: 'This task is in progress and cannot be deleted.', de: 'Diese Aufgabe wird gerade bearbeitet und kann nicht gelöscht werden.' },
    task_running_cannot_delete_attachment: { en: 'Files cannot be deleted while the AI agent is working on this task.', de: 'Während der KI-Agent an dieser Aufgabe arbeitet, können Dateien nicht gelöscht werden.' },
    attachment_not_found: { en: 'The attached file could not be found.', de: 'Die angehängte Datei wurde nicht gefunden.' },
    invalid_upload_annotations: { en: 'The image annotation could not be uploaded.', de: 'Die Bildmarkierung konnte nicht hochgeladen werden.' },
    task_closed_for_attachments: { en: 'Files can no longer be added to this task.', de: 'Zu dieser Aufgabe können keine Dateien mehr hinzugefügt werden.' },
    task_not_accepting_steering: { en: 'This task is not accepting new guidance right now.', de: 'Diese Aufgabe nimmt im Moment keine neuen Hinweise an.' },
    empty_message: { en: 'Please enter a message.', de: 'Bitte gib eine Nachricht ein.' },
    invalid_comment_mention: { en: 'Only active members of this project can be mentioned.', de: 'Es können nur aktive Mitglieder dieses Projekts erwähnt werden.' },
    too_many_mentions: { en: 'A comment can mention up to 25 people.', de: 'Ein Kommentar kann höchstens 25 Personen erwähnen.' },
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
    refinement_already_active: { en: 'This task already has a refinement in progress.', de: 'Für diese Aufgabe läuft bereits ein Refinement.' },
    refinement_not_awaiting_input: { en: 'This refinement is not waiting for answers.', de: 'Dieses Refinement wartet aktuell nicht auf Antworten.' },
    refinement_not_completed: { en: 'The refinement is not completed yet.', de: 'Das Refinement ist noch nicht abgeschlossen.' },
    refinement_description_changed: { en: 'The description changed after refinement started. You can review the warning and still apply the result.', de: 'Die Beschreibung wurde nach dem Start des Refinements geändert. Du kannst den Hinweis prüfen und das Ergebnis trotzdem übernehmen.' },
    refinement_source_changed: { en: 'The task changed while the refinement was being applied. Please try again.', de: 'Die Aufgabe wurde während der Übernahme geändert. Bitte versuche es erneut.' },
    source_changed: { en: 'The task changed while the refinement was being applied. Please try again.', de: 'Die Aufgabe wurde während der Übernahme geändert. Bitte versuche es erneut.' },
    refinement_already_applied: { en: 'This refinement has already been applied.', de: 'Dieses Refinement wurde bereits übernommen.' },
    refinement_answers_incomplete: { en: 'Please answer every required challenge question.', de: 'Bitte beantworte alle erforderlichen Challenge-Fragen.' },
    refinement_timeout: { en: 'Codex took too long to finish this refinement. You can try again.', de: 'Codex hat für dieses Refinement zu lange benötigt. Du kannst es erneut versuchen.' },
    refinement_invalid_output: { en: 'Codex returned an incomplete refinement. You can try again without changing the task.', de: 'Codex hat ein unvollständiges Refinement geliefert. Du kannst es erneut versuchen, ohne dass die Aufgabe verändert wurde.' },
    refinement_security_policy: { en: 'The refinement stopped because a project access rule was not satisfied.', de: 'Das Refinement wurde gestoppt, weil eine Regel für den Projektzugriff nicht erfüllt war.' },
    refinement_question_limit: { en: 'The refinement reached its maximum number of challenge rounds. Start a new run with the gathered answers.', de: 'Das Refinement hat die maximale Anzahl Challenge-Runden erreicht. Starte mit den gesammelten Antworten einen neuen Lauf.' },
    refinement_failed: { en: 'The refinement could not be completed. The task was not changed.', de: 'Das Refinement konnte nicht abgeschlossen werden. Die Aufgabe wurde nicht verändert.' },
  };
  return messages[key]?.[locale.value] ?? label('The action could not be completed.', 'Die Aktion konnte nicht abgeschlossen werden.');
};
</script>

<template>
  <div class="min-h-dvh bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50 ak-grid-bg">
    <section v-if="!user" class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10 sm:px-6">
      <div class="absolute inset-0 ak-login-surface" />
      <div class="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-teal-100 bg-white/95 shadow-2xl shadow-teal-950/12 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 lg:grid-cols-[1.05fr_0.95fr]">
        <div class="relative hidden min-h-[620px] overflow-hidden bg-teal-50/90 p-10 text-zinc-950 dark:bg-zinc-950 dark:text-white lg:flex lg:flex-col lg:justify-between">
          <div class="absolute inset-0 ak-login-panel" />
          <div class="relative">
            <div class="mb-8 flex items-center gap-3">
              <img src="/agent-kanban-mark.svg" :alt="t.app" class="size-12 shrink-0 drop-shadow-lg">
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
            <div class="mb-5 flex items-center gap-3 lg:hidden">
              <img src="/agent-kanban-mark.svg" alt="" class="size-10 shrink-0" aria-hidden="true">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold tracking-tight">{{ t.app }}</p>
                <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ t.navTagline }}</p>
              </div>
            </div>
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

    <div v-else class="ak-workspace-shell flex h-dvh min-h-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <p id="task-card-keyboard-hint" class="sr-only">{{ t.taskKeyboardMoveHint }}</p>
      <UModal
        v-model:open="commandPaletteOpen"
        :title="t.commandPaletteTitle"
        :description="t.commandPaletteDescription"
        :ui="{ content: 'max-w-2xl overflow-hidden p-0 sm:max-h-[min(42rem,calc(100dvh-2rem))]' }"
      >
        <template #content>
          <UCommandPalette
            v-model:search-term="commandPaletteQuery"
            data-command-palette
            :groups="commandPaletteGroups"
            value-key="id"
            size="lg"
            close
            preserve-group-order
            :loading="commandPaletteLoading"
            :placeholder="t.commandPalettePlaceholder"
            :input="commandPaletteInputProps"
            :fuse="{
              fuseOptions: {
                ignoreLocation: true,
                threshold: 0.3,
                distance: 160,
                minMatchCharLength: 1,
                keys: [
                  { name: 'label', weight: 0.42 },
                  { name: 'prefix', weight: 0.18 },
                  { name: 'suffix', weight: 0.08 },
                  { name: 'keywords', weight: 0.18 },
                  { name: 'searchText', weight: 0.14 },
                ],
              },
              resultLimit: 24,
              matchAllWhenSearchEmpty: true,
            }"
            :ui="{
              root: 'max-h-[min(42rem,calc(100dvh-2rem))] bg-white dark:bg-zinc-950',
              input: 'border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950',
              content: 'min-h-0',
              viewport: 'overscroll-contain',
              group: 'px-2 py-2',
              label: 'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400',
              item: 'rounded-lg px-2.5 py-2.5',
              itemDescription: 'mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400',
              footer: 'border-t border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70',
            }"
            @update:open="commandPaletteOpen = $event"
          >
            <template #close="{ ui }">
              <UButton
                :aria-label="t.close"
                :class="ui.close()"
                color="neutral"
                variant="ghost"
                size="lg"
                icon="i-lucide-x"
                @click="closeCommandPalette"
              />
            </template>
            <template #empty>
              <div class="grid justify-items-center gap-2 px-6 py-12 text-center">
                <span class="grid size-11 place-items-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <UIcon name="i-lucide-search-x" class="size-5" />
                </span>
                <p class="font-semibold text-zinc-900 dark:text-zinc-100">{{ t.commandNoResults }}</p>
                <p class="max-w-md text-sm leading-5 text-zinc-500 dark:text-zinc-400">{{ t.commandNoResultsHint }}</p>
              </div>
            </template>
            <template #footer>
              <div class="flex items-center justify-between gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span class="truncate">{{ t.commandKeyboardHint }}</span>
                <div class="hidden shrink-0 items-center gap-3 sm:flex">
                  <span
                    class="inline-flex items-center gap-1.5"
                    :aria-label="`${t.fullKeyboardMode}: ${keyboardHintModifierLabel}`"
                    :title="t.fullKeyboardModeDescription"
                  >
                    <UIcon name="i-lucide-keyboard" class="size-3.5" />
                    <UKbd :value="keyboardHintModifierKbd" size="sm" />
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <UKbd value="meta" size="sm" />
                    <UKbd value="K" size="sm" />
                  </span>
                </div>
              </div>
            </template>
          </UCommandPalette>
        </template>
      </UModal>

      <div
        v-if="!sidebarCollapsed"
        class="fixed inset-0 z-30 bg-zinc-950/35 backdrop-blur-[1px] md:hidden"
        aria-hidden="true"
        @click="closeMobileSidebar()"
      />
      <aside
        class="ak-sidebar sticky top-0 z-40 flex h-dvh shrink-0 flex-col border-r border-zinc-200/80 bg-white px-3 py-3 transition-[width,transform,padding] duration-200 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        :class="sidebarCollapsed ? 'w-[76px] max-md:-translate-x-full' : 'w-[280px] max-md:w-[min(304px,88vw)] max-md:translate-x-0'"
        :aria-label="t.projectNavigation"
        :aria-hidden="isMobileViewport && sidebarCollapsed ? 'true' : undefined"
        :aria-modal="isMobileViewport && !sidebarCollapsed ? 'true' : undefined"
        :inert="isMobileViewport && sidebarCollapsed"
        :role="isMobileViewport && !sidebarCollapsed ? 'dialog' : 'complementary'"
        @keydown="trapMobileSidebarFocus"
      >
        <div class="relative mb-4 flex h-14 shrink-0 items-center" :class="sidebarCollapsed ? 'justify-center' : 'gap-3 px-1'">
          <button
            v-if="sidebarCollapsed"
            type="button"
            data-sidebar-expand
            class="grid size-11 place-items-center rounded-xl transition hover:bg-teal-50 dark:hover:bg-teal-950/40"
            :aria-label="t.openSidebar"
            :title="t.openSidebar"
            @click="openMobileSidebar"
          >
            <img src="/agent-kanban-mark.svg" alt="" class="size-10" aria-hidden="true">
          </button>
          <template v-else>
            <img src="/agent-kanban-mark.svg" alt="" class="size-11 shrink-0" aria-hidden="true">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold tracking-tight">{{ t.app }}</p>
              <p class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ t.navTagline }}</p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-panel-left-close"
              data-mobile-sidebar-close
              :aria-label="t.closeSidebar"
              :title="t.closeSidebar"
              @click="closeMobileSidebar()"
            />
          </template>
        </div>

        <button
          type="button"
          data-command-palette-trigger
          class="mb-4 flex h-10 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:border-teal-900 dark:hover:bg-teal-950/40 dark:hover:text-teal-100"
          :class="sidebarCollapsed ? 'mx-auto w-10 justify-center' : 'w-full gap-2.5 px-3'"
          :aria-label="t.commandPalette"
          :title="sidebarCollapsed ? `${t.commandPalette} (⌘K)` : undefined"
          @click="openCommandPalette()"
        >
          <UIcon name="i-lucide-search" class="size-4 shrink-0" />
          <span v-if="!sidebarCollapsed" class="min-w-0 flex-1 truncate text-left font-medium">{{ t.commandPalette }}</span>
          <span v-if="!sidebarCollapsed" class="hidden shrink-0 items-center gap-0.5 lg:flex" aria-hidden="true">
            <UKbd value="meta" size="sm" />
            <UKbd value="K" size="sm" />
          </span>
        </button>

        <nav v-if="isAdmin" class="mb-4 grid gap-1" :aria-label="t.admin">
          <p v-if="!sidebarCollapsed" class="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{{ t.admin }}</p>
          <UButton
            :variant="activeView === 'projects' ? 'soft' : 'ghost'"
            color="neutral"
            icon="i-lucide-folder-cog"
            block
            :aria-label="t.projects"
            :title="sidebarCollapsed ? t.projects : undefined"
            :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
            @click="selectAdminView('projects')"
          >
            <span v-if="!sidebarCollapsed">{{ t.projects }}</span>
          </UButton>
          <UButton
            :variant="activeView === 'users' ? 'soft' : 'ghost'"
            color="neutral"
            icon="i-lucide-users"
            block
            :aria-label="t.users"
            :title="sidebarCollapsed ? t.users : undefined"
            :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
            @click="selectAdminView('users')"
          >
            <span v-if="!sidebarCollapsed">{{ t.users }}</span>
          </UButton>
        </nav>

        <nav class="ak-sidebar-projects min-h-0 flex-1 overflow-y-auto overflow-x-hidden" :aria-label="t.workspace">
          <div v-if="!sidebarCollapsed" class="mb-2 flex items-center justify-between px-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{{ t.workspace }}</p>
            <span class="text-[11px] tabular-nums text-zinc-400">{{ projects.length }}</span>
          </div>
          <div class="grid gap-1">
            <button
              v-for="project in projects"
              :key="project.id"
              type="button"
              class="ak-project-nav-item group flex w-full items-center rounded-xl text-left transition"
              :class="[
                sidebarCollapsed ? 'h-11 justify-center px-0' : 'min-h-12 gap-3 px-2 py-1.5',
                project.id === selectedProjectId && activeView === 'board'
                  ? 'bg-teal-50 text-teal-950 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.18)] dark:bg-teal-950/45 dark:text-teal-50'
                  : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900',
              ]"
              :aria-current="project.id === selectedProjectId && activeView === 'board' ? 'page' : undefined"
              :aria-label="project.name"
              :title="project.name"
              @click="selectProject(project.id)"
            >
              <span
                class="grid size-9 shrink-0 place-items-center rounded-lg border text-[10px] font-bold tracking-wide transition"
                :class="project.id === selectedProjectId && activeView === 'board'
                  ? 'border-teal-200 bg-white text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200'
                  : 'border-zinc-200 bg-white text-zinc-500 group-hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'"
              >
                {{ project.key.slice(0, 2) }}
              </span>
              <span v-if="!sidebarCollapsed" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium leading-5">{{ project.name }}</span>
                <span class="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ project.key }}</span>
              </span>
              <UIcon v-if="!sidebarCollapsed" name="i-lucide-chevron-right" class="size-4 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" />
            </button>
            <p v-if="!projects.length && !sidebarCollapsed" class="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {{ t.noProject }}
            </p>
          </div>
        </nav>

        <div class="mt-3 shrink-0 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div v-if="!sidebarCollapsed" class="mb-2 flex min-w-0 items-center gap-2 rounded-xl bg-zinc-50 px-2.5 py-2 dark:bg-zinc-900/70">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-900 text-[10px] font-bold text-white dark:bg-white dark:text-zinc-950">{{ userInitials }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-semibold">{{ user.name }}</span>
              <span class="block truncate text-[10px] text-zinc-500 dark:text-zinc-400">{{ user.email }}</span>
            </span>
          </div>
          <div :class="sidebarCollapsed ? 'grid justify-items-center gap-1' : 'grid grid-cols-[auto_auto_1fr] gap-1'">
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-lucide-globe-2"
              :aria-label="`${t.language}: ${locale.toUpperCase()}`"
              :title="`${t.language}: ${locale.toUpperCase()}`"
              :class="sidebarCollapsed ? 'size-10 justify-center px-0' : ''"
              @click="toggleLocale"
            >
              <span v-if="!sidebarCollapsed">{{ locale.toUpperCase() }}</span>
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              :icon="themeToggleIcon"
              :aria-label="themeToggleLabel"
              :title="themeToggleLabel"
              :class="sidebarCollapsed ? 'size-10 justify-center px-0' : ''"
              @click="toggleTheme"
            />
            <UButton
              variant="ghost"
              color="neutral"
              size="sm"
              icon="i-lucide-log-out"
              :aria-label="t.logout"
              :title="t.logout"
              :class="sidebarCollapsed ? 'size-10 justify-center px-0' : 'justify-center'"
              @click="logout"
            >
              <span v-if="!sidebarCollapsed">{{ t.logout }}</span>
            </UButton>
          </div>
        </div>
      </aside>

      <main
        class="ak-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4 sm:pb-4 lg:px-5"
        :aria-hidden="isMobileViewport && !sidebarCollapsed ? 'true' : undefined"
        :inert="isMobileViewport && !sidebarCollapsed"
      >
        <header v-if="activeView !== 'board'" class="ak-main-header mb-3 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 dark:border-zinc-800">
          <div class="flex min-w-0 items-center gap-3">
            <UButton
              class="md:hidden"
              data-mobile-sidebar-trigger
              color="neutral"
              variant="soft"
              icon="i-lucide-menu"
              :tabindex="isMobileViewport && !sidebarCollapsed ? -1 : undefined"
              :aria-label="t.openSidebar"
              @click="openMobileSidebar"
            />
            <span class="hidden min-w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[10px] font-bold tracking-wide text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 sm:inline-flex">
              {{ t.admin }}
            </span>
            <div class="min-w-0">
              <h1 class="ak-display truncate text-lg font-semibold tracking-tight sm:text-xl">
                {{ activeView === 'projects' ? t.projects : t.users }}
              </h1>
              <p class="hidden truncate text-xs text-zinc-500 dark:text-zinc-400 sm:block">
                {{ activeView === 'projects' ? t.projectTableHint : t.userTableHint }}
              </p>
            </div>
          </div>
        </header>

        <UAlert v-if="errorMessage" class="mb-4" color="error" variant="soft" icon="i-lucide-alert-triangle" :description="errorMessage" />

        <section v-if="activeView === 'projects'" class="min-h-0 flex-1 overflow-y-auto pb-2">
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
            <div class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <div
                v-for="project in projects"
                :key="project.id"
                class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 sm:flex-nowrap"
              >
                <span class="grid size-10 shrink-0 place-items-center rounded-xl border border-teal-200 bg-teal-50 text-[10px] font-bold tracking-wide text-teal-700 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-200">{{ project.key.slice(0, 2) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-semibold">{{ project.name }}</span>
                    <UBadge color="neutral" variant="soft" size="sm">{{ project.key }}</UBadge>
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ projectSidebarText(project) }}</span>
                </span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  @click="openProjectModal(project)"
                >
                  {{ t.editProject }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-up-right"
                  @click="selectProject(project.id)"
                >
                  {{ t.openBoard }}
                </UButton>
              </div>
              <p v-if="!projects.length" class="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{{ t.noProject }}</p>
            </div>
          </UCard>
        </section>

        <section v-else-if="activeView === 'users'" class="min-h-0 flex-1 overflow-y-auto pb-2">
          <UCard class="overflow-hidden">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="font-semibold">{{ t.users }}</h2>
                  <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ users.length }} {{ t.total }}</p>
                </div>
                <UButton icon="i-lucide-user-plus" size="lg" @click="openUserModal()">{{ t.createUser }}</UButton>
              </div>
            </template>
            <UTable :data="userRows" :columns="userColumns">
              <template #name-cell="{ row }">
                <div class="flex min-w-0 items-center gap-3 py-1">
                  <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-xs font-bold text-teal-700 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-900">
                    {{ formatUserInitials(row.original) }}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-zinc-950 dark:text-zinc-50">{{ row.original.name }}</span>
                    <span v-if="row.original.id === user?.id" class="block text-xs text-zinc-500 dark:text-zinc-400">{{ t.you }}</span>
                  </span>
                </div>
              </template>
              <template #email-cell="{ row }">
                <span class="text-zinc-600 dark:text-zinc-300">{{ row.original.email }}</span>
              </template>
              <template #role-cell="{ row }">
                <UBadge
                  :color="row.original.role === 'admin' ? 'primary' : 'neutral'"
                  :variant="row.original.role === 'admin' ? 'soft' : 'subtle'"
                  :icon="row.original.role === 'admin' ? 'i-lucide-shield-check' : 'i-lucide-user-round'"
                >
                  {{ row.original.roleLabel }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-user-pen"
                    :aria-label="`${t.editUser}: ${row.original.name}`"
                    @click="openUserModal(row.original)"
                  >
                    <span class="hidden sm:inline">{{ t.editUser }}</span>
                  </UButton>
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :disabled="row.original.id === user?.id"
                    :aria-label="row.original.id === user?.id
                      ? t.deleteUserSelfProtected
                      : `${t.deleteUser}: ${row.original.name}`"
                    :title="row.original.id === user?.id ? t.deleteUserSelfProtected : t.deleteUser"
                    @click="requestDeleteUser(row.original)"
                  />
                </div>
              </template>
            </UTable>
          </UCard>
        </section>

        <section v-else-if="board" class="flex min-h-0 flex-1 flex-col gap-3">
          <div class="ak-board-toolbar flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <UButton
              class="shrink-0 md:hidden"
              data-mobile-sidebar-trigger
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-menu"
              :tabindex="isMobileViewport && !sidebarCollapsed ? -1 : undefined"
              :aria-label="t.openSidebar"
              @click="openMobileSidebar"
            />

            <div
              class="hidden min-w-0 shrink-0 items-center gap-2 sm:flex sm:max-w-40 xl:max-w-52"
              :title="selectedProject?.description ?? selectedProject?.name"
            >
              <span class="hidden shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold tracking-wide text-zinc-600 xl:inline-flex dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {{ selectedProject?.key }}
              </span>
              <h1 class="ak-display truncate text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
                {{ selectedProject?.name }}
              </h1>
            </div>

            <USelect
              :model-value="selectedBoardScope"
              class="hidden w-40 shrink-0 lg:block xl:w-52"
              :items="boardScopeItems"
              size="sm"
              icon="i-lucide-locate-fixed"
              :aria-label="t.jumpToTopic"
              @update:model-value="(value) => selectBoardScope(String(value))"
            />

            <UInput
              v-model="boardSearchQuery"
              id="board-task-search"
              class="min-w-24 flex-1 lg:max-w-sm xl:max-w-md"
              size="sm"
              icon="i-lucide-search"
              :placeholder="t.searchTasksPlaceholder"
              :aria-label="t.searchTasks"
              @keydown.esc.stop.prevent="handleBoardSearchEscape"
            >
              <template #trailing>
                <UButton
                  v-if="boardSearchQuery"
                  color="neutral"
                  variant="link"
                  size="xs"
                  icon="i-lucide-x"
                  :aria-label="t.clearSearch"
                  :title="t.clearSearch"
                  @click="boardSearchQuery = ''"
                />
              </template>
            </UInput>

            <USelectMenu
              v-model="selectedBoardAssigneeIds"
              class="hidden w-40 shrink-0 lg:block xl:w-48"
              :items="boardAssigneeItems"
              multiple
              value-key="value"
              :placeholder="t.allResponsible"
              :search-input="{ placeholder: t.searchResponsible }"
              size="sm"
              icon="i-lucide-user-round-check"
              :aria-label="t.assignee"
              :title="t.responsibilityFilterHint"
            >
              <span class="truncate">{{ selectedBoardAssigneeLabel }}</span>
            </USelectMenu>

            <UPopover v-model:open="boardFilterPopoverOpen" :content="{ align: 'end', side: 'bottom' }">
              <UButton
                class="shrink-0 lg:hidden"
                :color="hasActiveBoardFilters ? 'primary' : 'neutral'"
                :variant="hasActiveBoardFilters ? 'soft' : 'ghost'"
                size="sm"
                icon="i-lucide-list-filter"
                :aria-label="t.boardFilters"
                :title="t.boardFilters"
              >
                <span v-if="hasActiveBoardFilters" class="text-xs font-semibold tabular-nums">{{ visibleTasks.length }}</span>
              </UButton>
              <template #content>
                <div class="grid w-72 gap-4 p-4">
                  <UFormField :label="t.jumpToTopic" size="sm">
                    <USelect
                      :model-value="selectedBoardScope"
                      class="w-full"
                      :items="boardScopeItems"
                      size="lg"
                      icon="i-lucide-locate-fixed"
                      @update:model-value="(value) => selectBoardScope(String(value))"
                    />
                  </UFormField>
                  <UFormField :label="t.assignee" size="sm">
                    <USelectMenu
                      v-model="selectedBoardAssigneeIds"
                      class="w-full"
                      :items="boardAssigneeItems"
                      multiple
                      value-key="value"
                      :placeholder="t.allResponsible"
                      :search-input="{ placeholder: t.searchResponsible }"
                      size="lg"
                      icon="i-lucide-user-round-check"
                      :aria-label="t.assignee"
                    >
                      <span class="truncate">{{ selectedBoardAssigneeLabel }}</span>
                    </USelectMenu>
                    <template #description>{{ t.responsibilityFilterHint }}</template>
                  </UFormField>
                  <div class="grid gap-2 border-t border-zinc-200 pt-3 md:hidden dark:border-zinc-800">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      :icon="showAllDone ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                      @click="toggleCompletedVisibility"
                    >
                      {{ showAllDone ? t.hideCompleted : t.showCompleted }}
                    </UButton>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-network"
                      @click="boardFilterPopoverOpen = false; openOberthemaModal()"
                    >
                      {{ t.newOberthema }}
                    </UButton>
                  </div>
                  <UButton
                    v-if="hasActiveBoardFilters"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-rotate-ccw"
                    @click="clearBoardFilters"
                  >
                    {{ t.clearFilters }}
                  </UButton>
                </div>
              </template>
            </UPopover>

            <span v-if="hasActiveBoardFilters" class="hidden shrink-0 text-xs text-zinc-500 xl:inline dark:text-zinc-400">
              <strong class="font-semibold text-zinc-900 dark:text-zinc-100">{{ visibleTasks.length }}</strong> {{ t.matchingTasks }}
            </span>

            <div class="ml-auto flex shrink-0 items-center gap-1">
              <UButton
                class="hidden md:inline-flex"
                color="neutral"
                variant="ghost"
                size="sm"
                :icon="showAllDone ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="showAllDone ? t.hideCompleted : t.showCompleted"
                :title="showAllDone ? t.hideCompleted : t.showCompleted"
                @click="toggleCompletedVisibility"
              >
                <span class="hidden 2xl:inline">{{ showAllDone ? t.hideCompleted : t.showCompleted }}</span>
                <UBadge v-if="hiddenDoneCount" color="neutral" variant="soft">{{ hiddenDoneCount }}</UBadge>
              </UButton>
              <UButton
                class="hidden md:inline-flex"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-network"
                :aria-label="t.newOberthema"
                :title="t.newOberthema"
                @click="openOberthemaModal()"
              >
                <span class="hidden 2xl:inline">{{ t.newOberthema }}</span>
              </UButton>
              <UButton
                class="shrink-0"
                size="sm"
                icon="i-lucide-plus"
                :disabled="!board.oberthemen.length"
                :aria-label="t.newTask"
                :title="t.newTask"
                @click="openTaskModal(backlogColumn?.id)"
              >
                <span class="hidden xl:inline">{{ t.newTask }}</span>
              </UButton>
            </div>
          </div>

          <div v-if="board.oberthemen.length" class="ak-board-viewport min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div
              class="grid"
              :style="{
                gridTemplateColumns: `248px repeat(${board.columns.length}, minmax(214px, 1fr))`,
                minWidth: `${248 + board.columns.length * 214}px`,
              }"
            >
              <div class="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-r border-teal-100 bg-teal-50/95 px-3 text-teal-950 backdrop-blur md:left-0 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100">
                <UIcon name="i-lucide-git-branch" class="size-4 text-teal-600 dark:text-teal-300" />
                <p class="text-sm font-semibold">{{ t.hierarchy }}</p>
              </div>
              <div
                v-for="column in board.columns"
                :key="`header-${column.id}`"
                :data-column-id="column.id"
                :data-column-key="column.key"
                class="sticky top-0 z-20 min-h-14 border-b border-r border-zinc-200 bg-zinc-100/95 px-3 py-2 text-zinc-900 backdrop-blur last:border-r-0 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="flex items-center gap-2 text-sm font-semibold">
                      <UIcon :name="columnIcon(column)" class="size-4 text-zinc-500 dark:text-zinc-400" :class="column.key === 'in_progress' ? 'ak-spin-when-active' : ''" />
                      <span class="truncate">{{ columnName(column) }}</span>
                    </p>
                    <p v-if="column.key === 'todo'" class="mt-0.5 text-[10px] leading-4 text-amber-700 dark:text-amber-300">{{ t.todoAutomationShort }}</p>
                  </div>
                  <span class="grid size-7 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-xs font-semibold tabular-nums shadow-sm dark:border-zinc-700 dark:bg-zinc-800">{{ tasksForColumn(column.id).length }}</span>
                </div>
              </div>

              <template v-for="topic in board.oberthemen" :key="topic.id">
                <div
                  :id="`topic-${topic.id}`"
                  :data-topic-id="topic.id"
                  :data-topic-order="board.oberthemen.findIndex((item) => item.id === topic.id)"
                  class="ak-topic-band z-10 flex min-h-14 items-center gap-1 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-1.5 transition md:sticky md:left-0 dark:border-zinc-800 dark:bg-zinc-900"
                  :style="{ '--topic-accent': topicAccent(topic) }"
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
                    :data-keyboard-reorder="`oberthema:${topic.id}`"
                    data-keytip-action="focus"
                    class="ak-hierarchy-drag-handle grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    :aria-label="`${t.moveOberthema}: ${topic.name}`"
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    :title="t.hierarchyReorderHint"
                    @click.stop.prevent
                    @keydown.up.stop.prevent="moveOberthemaByKeyboard(topic.id, -1)"
                    @keydown.down.stop.prevent="moveOberthemaByKeyboard(topic.id, 1)"
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
                  class="ak-topic-summary-cell flex min-h-14 items-center justify-end border-b border-r border-zinc-200 bg-zinc-100 px-3 last:border-r-0 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <span class="sr-only">{{ columnName(column) }}</span>
                  <span class="grid size-7 place-items-center rounded-lg border border-zinc-200 bg-white text-xs font-semibold tabular-nums shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                    {{ tasksForOberthemaColumn(topic.id, column.id).length }}
                  </span>
                </div>

                <template v-if="!collapsedOberthemaIds.includes(topic.id)">
                  <template v-for="row in hierarchyRowsFor(topic.id)" :key="row.key">
                    <div
                      :id="row.subtopic ? `subtopic-${row.subtopic.id}` : undefined"
                      :data-subtopic-id="row.subtopic?.id"
                      class="z-10 flex min-h-18 items-center gap-1 border-b border-r border-zinc-200 bg-white px-2 py-2 transition md:sticky md:left-0 dark:border-zinc-800 dark:bg-zinc-950"
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
                        :data-keyboard-reorder="`unterthema:${row.subtopic.id}`"
                        data-keytip-action="focus"
                        class="ak-hierarchy-drag-handle grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                        :aria-label="`${t.moveUnterthema}: ${row.subtopic.name}`"
                        aria-keyshortcuts="ArrowUp ArrowDown"
                        :title="t.hierarchyReorderHint"
                        @click.stop.prevent
                        @keydown.up.stop.prevent="moveUnterthemaByKeyboard(row.subtopic.id, -1)"
                        @keydown.down.stop.prevent="moveUnterthemaByKeyboard(row.subtopic.id, 1)"
                        @dragstart.stop="startUnterthemaDrag($event, row.subtopic.id)"
                        @dragend.stop="clearHierarchyDragState"
                      >
                        <UIcon name="i-lucide-grip-vertical" class="size-4" />
                      </button>
                      <button
                        v-if="row.subtopic"
                        type="button"
                        class="grid size-7 shrink-0 place-items-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        :aria-label="row.collapsed ? t.expandSubtopic : t.collapseSubtopic"
                        :aria-expanded="!row.collapsed"
                        @click="toggleUnterthemaExpanded(row.subtopic.id)"
                      >
                        <UIcon :name="row.collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3.5 text-zinc-400" />
                      </button>
                      <span v-else class="grid size-7 shrink-0 place-items-center">
                        <UIcon name="i-lucide-corner-down-right" class="size-3.5 text-zinc-400" />
                      </span>
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left"
                        @click="row.subtopic ? selectUnterthema(row.subtopic.id) : selectOberthema(topic.id)"
                      >
                        <span class="block truncate text-sm font-medium">{{ row.label }}</span>
                        <span class="mt-0.5 block text-[10px] text-zinc-400">{{ taskCountForPlacement(topic.id, row.unterthemaId) }} {{ t.tasks }}</span>
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
                      class="ak-task-drop-cell group relative min-h-18 border-b border-r border-zinc-200 bg-zinc-50/60 p-2 transition-colors last:border-r-0 dark:border-zinc-800 dark:bg-zinc-900/30"
                      :class="draggedTaskId && dragOverPlacementKey === taskDropPlacementKey(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }) ? 'ak-task-drop-cell-active' : ''"
                      @dragover.prevent="markColumnDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                      @dragenter.prevent="markColumnDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                      @dragleave="leaveTaskDropCell($event, taskDropPlacementKey(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }))"
                      @drop.prevent="draggedTaskId && moveTask(draggedTaskId, column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                    >
                      <div v-if="row.collapsed" class="flex h-full min-h-12 items-center justify-center">
                        <span class="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
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
                                'ak-task-card-mentioned': Boolean(task.unreadMentionCount),
                                'opacity-50': draggedTaskId === task.id,
                              }"
                              :ui="{ body: 'p-2.5 sm:p-2.5' }"
                              role="button"
                              tabindex="0"
                              :aria-label="taskCardLabel(task)"
                              aria-describedby="task-card-keyboard-hint"
                              aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown"
                              draggable="true"
                              @click="openTaskDetail(task)"
                              @keydown.enter.prevent="openTaskDetail(task)"
                              @keydown.space.prevent="openTaskDetail(task)"
                              @keydown.shift.up.stop.prevent="moveTaskByKeyboard(task, -1)"
                              @keydown.shift.down.stop.prevent="moveTaskByKeyboard(task, 1)"
                              @dragover.prevent.stop="markTaskDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }, task.id)"
                              @dragenter.prevent.stop="markTaskDropTarget(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }, task.id)"
                              @dragstart="startTaskDrag(task.id)"
                              @dragend="clearDragState"
                              @drop.stop.prevent="draggedTaskId && moveTask(draggedTaskId, column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }, task.id)"
                            >
                              <div class="mb-2 flex items-center justify-between gap-2">
                                <UBadge variant="subtle" color="neutral" class="shrink-0 whitespace-nowrap">{{ task.key }}</UBadge>
                                <div class="flex min-w-0 items-center gap-1.5">
                                  <span
                                    v-if="task.unreadMentionCount"
                                    class="inline-flex shrink-0 items-center gap-1 rounded-md bg-teal-100 px-2 py-1 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                                    :title="taskMentionNotificationLabel(task)"
                                  >
                                    <UIcon name="i-lucide-at-sign" class="size-3" />
                                    {{ task.unreadMentionCount }}
                                  </span>
                                  <span
                                    class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                                    :class="task.agentEnabled ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'"
                                  >
                                    <UIcon :name="task.agentEnabled ? 'i-lucide-sparkles' : 'i-lucide-user-round'" class="size-3" />
                                    {{ task.agentEnabled ? t.aiTaskShort : t.humanTaskShort }}
                                  </span>
                                </div>
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
                          class="ak-add-task-button flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 transition hover:border-teal-400 hover:bg-white hover:text-teal-700 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-teal-300"
                          @click="openTaskModal(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId })"
                        >
                          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ t.newTask }}
                        </button>
                      </div>
                      <div
                        v-if="draggedTaskId && dragOverPlacementKey === taskDropPlacementKey(column.id, { oberthemaId: topic.id, unterthemaId: row.unterthemaId }) && !dragOverTaskId"
                        class="ak-task-cell-drop-overlay pointer-events-none absolute z-10 flex items-center justify-center rounded-lg border border-teal-500/70 bg-teal-50/95 text-xs font-semibold text-teal-800 shadow-sm dark:bg-teal-950/90 dark:text-teal-100"
                        :class="row.collapsed || !tasksForPlacementColumn(topic.id, row.unterthemaId, column.id).length ? 'inset-2' : 'inset-x-2 bottom-2 h-10'"
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
        :title="editingUserId ? t.editUser : t.createUser"
        :description="t.userDialog"
        :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <form ref="userFormElement" @submit.prevent="saveUserAction">
            <div class="border-b border-zinc-200 bg-zinc-50/80 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div class="flex items-center gap-3">
                <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-200">
                  <UIcon :name="editingUserId ? 'i-lucide-user-pen' : 'i-lucide-user-plus'" class="size-5" />
                </span>
                <div class="min-w-0">
                  <p class="font-semibold text-zinc-950 dark:text-zinc-50">{{ t.credentials }}</p>
                  <p class="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                    {{ editingUserId ? userForm.email : t.userTableHint }}
                  </p>
                </div>
              </div>
            </div>
            <div class="grid gap-5 p-6">
              <UAlert
                v-if="userFormError"
                color="error"
                variant="soft"
                icon="i-lucide-alert-triangle"
                :description="userFormError"
              />
              <UFormField :label="t.userName" required size="lg">
                <UInput v-model="userForm.name" class="w-full" size="xl" icon="i-lucide-user" required />
              </UFormField>
              <UFormField :label="t.email" required size="lg">
                <UInput v-model="userForm.email" class="w-full" size="xl" icon="i-lucide-mail" type="email" required />
              </UFormField>
              <UFormField
                :label="editingUserId ? t.newPassword : t.password"
                :required="!editingUserId"
                size="lg"
                :description="editingUserId ? t.passwordEditHint : t.passwordCreateHint"
              >
                <UInput
                  v-model="userForm.password"
                  class="w-full"
                  size="xl"
                  icon="i-lucide-lock-keyhole"
                  type="password"
                  minlength="8"
                  :required="!editingUserId"
                  autocomplete="new-password"
                />
              </UFormField>
              <UFormField
                :label="t.role"
                required
                size="lg"
                :description="editingCurrentUser ? t.selfAdminRoleLocked : undefined"
              >
                <USelect
                  v-model="userForm.role"
                  class="w-full"
                  :items="roleItems"
                  size="xl"
                  icon="i-lucide-shield-check"
                  :disabled="editingCurrentUser"
                />
              </UFormField>
            </div>
            <div class="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50/80 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <UButton color="neutral" variant="ghost" type="button" :disabled="userSubmitting" @click="userModalOpen = false">{{ t.cancel }}</UButton>
              <UButton
                :icon="editingUserId ? 'i-lucide-save' : 'i-lucide-user-plus'"
                type="button"
                :loading="userSubmitting"
                @click="submitUserForm"
              >
                {{ editingUserId ? t.updateUser : t.createUser }}
              </UButton>
            </div>
          </form>
        </template>
      </UModal>

      <UModal
        v-if="deleteUserModalOpen"
        v-model:open="deleteUserModalOpen"
        :title="t.deleteUser"
        :description="t.deleteUserConfirm"
        :ui="{ content: 'max-w-md' }"
      >
        <template #close="{ ui }">
          <UButton
            :aria-label="t.close"
            :class="ui.close()"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :disabled="userSubmitting"
            @click="closeDeleteUserModal"
          />
        </template>
        <template #body>
          <div class="grid gap-5">
            <UAlert
              v-if="errorMessage"
              color="error"
              variant="soft"
              icon="i-lucide-alert-circle"
              :description="errorMessage"
            />
            <div class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-white/80 text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900">
                <UIcon name="i-lucide-user-round-x" class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{{ selectedUserForDeletion?.name }}</p>
                <p class="truncate text-xs text-red-700/80 dark:text-red-300/80">{{ selectedUserForDeletion?.email }}</p>
                <p class="mt-3 text-sm leading-6">{{ t.deleteUserWarning }}</p>
              </div>
            </div>
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <UButton color="neutral" variant="ghost" type="button" :disabled="userSubmitting" @click="closeDeleteUserModal">
                {{ t.cancel }}
              </UButton>
              <UButton color="error" icon="i-lucide-trash-2" type="button" :loading="userSubmitting" @click="confirmDeleteUserAction">
                {{ t.deleteUser }}
              </UButton>
            </div>
          </div>
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
        :content="taskModalContentProps"
        :title="selectedTaskId ? (taskForm.title || t.editTask) : t.createTask"
        :description="taskModalDescription"
        :ui="{
          content: 'h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-6xl overflow-hidden sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)]',
          header: 'min-h-16 border-b border-zinc-200 bg-white px-4 py-3 pr-14 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950',
          body: 'min-h-0 min-w-0 overflow-x-hidden overflow-y-auto p-0 sm:p-0',
          footer: 'flex-wrap justify-end border-t border-zinc-200 bg-zinc-50/95 px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/90',
          title: 'max-w-[min(70ch,calc(100vw-6rem))] truncate text-base font-semibold text-zinc-950 dark:text-white',
          description: 'mt-0.5 text-xs text-zinc-500 dark:text-zinc-400'
        }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>

        <template #body>
          <div class="min-w-0">
            <div v-if="errorMessage && activeTaskTab !== 'refinement'" class="px-4 pt-4 sm:px-6">
              <UAlert color="error" variant="soft" icon="i-lucide-alert-circle" :description="errorMessage" />
            </div>

            <nav
              class="overflow-x-auto border-b border-zinc-200 bg-white px-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950"
              :aria-label="selectedTaskId ? t.editTask : t.createTask"
            >
              <div role="tablist" class="flex min-w-max items-center gap-1">
                <button
                  v-for="tab in taskTabs"
                  :id="'task-tab-' + tab.key"
                  :key="tab.key"
                  type="button"
                  role="tab"
                  class="group relative inline-flex min-h-12 items-center gap-2 px-3 text-sm font-medium transition-colors"
                  :class="activeTaskTab === tab.key
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'"
                  :aria-selected="activeTaskTab === tab.key"
                  :aria-controls="'task-panel-' + tab.key"
                  :tabindex="activeTaskTab === tab.key ? 0 : -1"
                  :disabled="refinementBusy || taskSubmitting"
                  @click="tab.key === 'refinement' ? openTaskRefinementTab() : (activeTaskTab = tab.key)"
                  @keydown="handleTaskTabKeydown($event, tab.key)"
                >
                  <UIcon :name="tab.icon" class="size-4" />
                  <span>{{ tab.label }}</span>
                  <UBadge
                    v-if="tab.key === 'task' && taskAttachments.length"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    {{ taskAttachments.length }}
                  </UBadge>
                  <UBadge
                    v-if="tab.key === 'comments' && commentCount"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  >
                    {{ commentCount }}
                  </UBadge>
                  <UBadge
                    v-if="tab.key === 'comments' && unreadCommentMentionCount"
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="i-lucide-at-sign"
                    :title="unreadCommentMentionCount === 1
                      ? t.commentMentionNotificationSingle
                      : t.commentMentionNotification.replace('{count}', String(unreadCommentMentionCount))"
                  >
                    {{ unreadCommentMentionCount }}
                  </UBadge>
                  <span
                    class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-teal-600 transition-opacity dark:bg-teal-400"
                    :class="activeTaskTab === tab.key ? 'opacity-100' : 'opacity-0'"
                  />
                </button>
              </div>
            </nav>

            <form
              v-show="activeTaskTab === 'task'"
              id="task-form"
              class="min-w-0"
              @submit.prevent="saveTaskAction"
            >
            <section
              id="task-panel-task"
              role="tabpanel"
              aria-labelledby="task-tab-task"
              class="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_19rem]"
            >
              <div class="min-w-0 p-4 sm:p-6 lg:p-7">
                <template v-if="hasAgentActivity">
                  <div class="mb-6 flex items-start gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-700">
                      <UIcon name="i-lucide-lock-keyhole" class="size-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-sm font-semibold">{{ t.readonlyTask }}</p>
                      <p class="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ t.lockedTask }}</p>
                    </div>
                  </div>

                  <div class="grid gap-6">
                    <div>
                      <p class="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{{ t.title }}</p>
                      <h3 class="text-lg font-semibold leading-7 text-zinc-950 dark:text-white">{{ taskForm.title }}</h3>
                    </div>
                    <div>
                      <p class="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{{ t.description }}</p>
                      <UEditor
                        v-if="taskForm.description"
                        :model-value="taskForm.description"
                        content-type="markdown"
                        :editable="false"
                        :image="false"
                        :mention="false"
                        class="ak-markdown-readonly text-sm leading-6 text-zinc-700 dark:text-zinc-300"
                        :ui="{ content: 'px-0 py-0', base: 'px-0 sm:px-0 text-sm text-zinc-700 dark:text-zinc-300' }"
                      />
                      <p v-else class="text-sm text-zinc-500 dark:text-zinc-400">—</p>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="grid gap-5">
                    <UFormField :label="t.title" required size="lg">
                      <UInput
                        v-model="taskForm.title"
                        id="task-title"
                        class="w-full"
                        size="xl"
                        required
                        :autofocus="!selectedTaskId"
                      />
                    </UFormField>

                    <UFormField :label="t.description" :description="t.markdownEditorHelp" size="lg">
                      <div class="ak-markdown-editor overflow-hidden rounded-xl border border-zinc-300 bg-white transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950">
                        <UEditor
                          v-slot="{ editor }"
                          v-model="taskForm.description"
                          :data-keytip-label="t.description"
                          content-type="markdown"
                          :image="false"
                          :mention="false"
                          :placeholder="t.description"
                          :ui="{ content: 'min-h-36', base: 'min-h-36 px-4 py-3 sm:px-4' }"
                          @paste="handlePaste"
                        >
                          <UEditorToolbar
                            layout="fixed"
                            :editor="editor"
                            :items="editorToolbarItems"
                            class="ak-editor-toolbar border-b border-zinc-200 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/80"
                          />
                        </UEditor>
                      </div>
                    </UFormField>
                  </div>

                  <TaskFilePicker
                    class="mt-6"
                    :files="taskAttachmentFiles"
                    :title="t.evidence"
                    :hint="t.pasteHint"
                    :choose-label="t.files"
                    :edit-image-label="t.editImage"
                    :remove-label="t.deleteAttachment"
                    @file-change="handleFileInput"
                    @file-drop="handleFileDrop"
                    @annotate="openPendingAnnotationEditor"
                    @remove="removePendingTaskFile"
                  />
                </template>

                <div class="mt-6 flex flex-col gap-3 rounded-xl bg-teal-50/70 p-4 ring-1 ring-teal-100 sm:flex-row sm:items-center sm:justify-between dark:bg-teal-950/20 dark:ring-teal-900/60">
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-teal-700 ring-1 ring-teal-100 dark:bg-zinc-950 dark:text-teal-300 dark:ring-teal-900/70">
                      <UIcon name="i-lucide-wand-sparkles" class="size-4" />
                    </span>
                    <p class="text-sm leading-5 text-teal-950/80 dark:text-teal-100/80">{{ t.refinementCtaHint }}</p>
                  </div>
                  <UButton
                    type="button"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-wand-sparkles"
                    class="shrink-0 justify-center"
                    @click="openTaskRefinementTab"
                  >
                    {{ t.refineTask }}
                  </UButton>
                </div>

                <section v-if="taskAttachments.length" class="mt-7 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <div class="mb-3 flex min-w-0 items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-zinc-950 dark:text-white">{{ t.attachedFiles }}</p>
                      <p v-if="taskImageAttachments.length" class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {{ t.annotationHelp }}
                      </p>
                    </div>
                    <UBadge color="neutral" variant="soft">{{ taskAttachments.length }}</UBadge>
                  </div>

                  <div class="divide-y divide-zinc-200 overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:divide-zinc-800 dark:ring-zinc-800">
                    <div
                      v-for="attachment in taskAttachments"
                      :key="attachment.id"
                      class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-white px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/70"
                    >
                      <button
                        v-if="isImageAttachment(attachment)"
                        type="button"
                        class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200 transition hover:ring-teal-400 dark:bg-zinc-900 dark:ring-zinc-700"
                        :aria-label="t.editImage + ': ' + attachment.fileName"
                        @click="openAnnotationEditor(attachment)"
                      >
                        <img :src="attachment.annotatedUrl || attachment.url" alt="" class="size-full object-cover">
                      </button>
                      <span v-else class="grid size-11 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        <UIcon :name="attachmentIcon(attachment)" class="size-5" />
                      </span>

                      <div class="min-w-0">
                        <a
                          :href="attachment.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          :aria-label="t.openAttachment + ': ' + attachment.fileName"
                          class="block truncate text-sm font-semibold text-zinc-800 underline-offset-4 hover:text-teal-700 hover:underline dark:text-zinc-100 dark:hover:text-teal-300"
                        >
                          {{ attachment.fileName }}
                        </a>
                        <p class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {{ formatFileSize(attachment.size) }} · {{ attachment.mimeType }}
                        </p>
                      </div>

                      <div class="flex shrink-0 items-center gap-0.5">
                        <UButton
                          v-if="isImageAttachment(attachment)"
                          type="button"
                          color="neutral"
                          variant="ghost"
                          size="sm"
                          icon="i-lucide-paintbrush"
                          :aria-label="t.editImage + ': ' + attachment.fileName"
                          :title="t.editImage"
                          @click="openAnnotationEditor(attachment)"
                        />
                        <UButton
                          type="button"
                          color="neutral"
                          variant="ghost"
                          size="sm"
                          icon="i-lucide-download"
                          :loading="downloadingAttachmentId === attachment.id"
                          :aria-label="t.downloadAttachment + ': ' + attachment.fileName"
                          :title="t.downloadAttachment"
                          @click="downloadTaskAttachment(attachment)"
                        />
                        <UButton
                          type="button"
                          color="error"
                          variant="ghost"
                          size="sm"
                          icon="i-lucide-trash-2"
                          :disabled="editingTask?.agentStatus === 'running'"
                          :aria-label="t.deleteAttachment + ': ' + attachment.fileName"
                          :title="t.deleteAttachment"
                          @click="requestDeleteAttachment(attachment)"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <aside class="border-t border-zinc-200 bg-zinc-50/75 p-4 sm:p-5 lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-900/45">
                <div class="grid gap-5">
                  <div class="flex items-center gap-2">
                    <span class="grid size-8 place-items-center rounded-lg bg-white text-teal-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-teal-300 dark:ring-zinc-700">
                      <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
                    </span>
                    <p class="text-sm font-semibold text-zinc-950 dark:text-white">{{ t.primaryDetails }}</p>
                  </div>

                  <div class="grid gap-4">
                    <UFormField :label="t.topicAssignment" required size="sm">
                      <USelect
                        v-model="taskForm.placementId"
                        class="w-full"
                        :items="placementItems"
                        size="lg"
                        :placeholder="t.chooseUnterthema"
                        required
                      />
                    </UFormField>

                    <UFormField v-if="selectedTaskId" :label="t.area" required size="sm">
                      <USelect
                        v-model="taskForm.columnId"
                        class="w-full"
                        :items="columnItems"
                        size="lg"
                        :disabled="hasAgentActivity"
                      />
                    </UFormField>
                    <div v-else>
                      <p class="mb-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">{{ t.area }}</p>
                      <div class="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-700">
                        <UIcon name="i-lucide-columns-3" class="size-4 text-zinc-400" />
                        <span class="truncate">{{ columnItems.find((item) => item.value === taskForm.columnId)?.label }}</span>
                      </div>
                    </div>

                    <UFormField :label="t.assignee" size="sm">
                      <USelect
                        v-model="taskForm.assigneeId"
                        data-assignee-select
                        class="w-full"
                        :items="assigneeItems"
                        size="lg"
                        icon="i-lucide-user-round-check"
                      />
                    </UFormField>
                  </div>

                  <div class="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                    <USwitch
                      v-model="taskForm.agentEnabled"
                      color="primary"
                      size="lg"
                      :label="t.aiExecution"
                      :description="t.aiExecutionHelp"
                      :disabled="editingTask?.agentStatus === 'running'"
                      :ui="{ root: 'items-start', label: 'text-sm font-semibold text-zinc-900 dark:text-zinc-100', description: 'text-xs leading-5 text-zinc-500 dark:text-zinc-400' }"
                    />
                  </div>

                  <div class="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                    <div class="flex items-center justify-between gap-2">
                      <span class="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        <UIcon name="i-lucide-tags" class="size-4 text-zinc-400" />
                        {{ t.tags }}
                      </span>
                      <UPopover v-model:open="tagDropdownOpen" :content="{ align: 'end', side: 'bottom' }">
                        <UButton
                          type="button"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-pencil"
                          :aria-label="t.editTags"
                          :title="t.editTags"
                        />
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
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      <UBadge v-for="tag in taskTagPreview" :key="tag" color="primary" variant="soft">#{{ tag }}</UBadge>
                      <span v-if="!taskTagPreview.length" class="text-xs text-zinc-500 dark:text-zinc-400">{{ t.noTags }}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </section>
            </form>

            <section
              v-if="activeTaskTab === 'activity'"
              id="task-panel-activity"
              role="tabpanel"
              aria-labelledby="task-tab-activity"
              class="min-w-0 p-4 sm:p-6"
            >
              <UAlert class="mb-5" color="neutral" variant="soft" icon="i-lucide-route" :description="t.steeringHelp" />

              <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                <div class="grid min-w-0 content-start gap-4">
                  <section v-if="canSendGuidance" class="grid gap-4 rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                    <div class="flex items-start gap-3">
                      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                        <UIcon name="i-lucide-message-square-plus" class="size-4" />
                      </span>
                      <div>
                        <p class="text-sm font-semibold text-zinc-950 dark:text-white">{{ t.guidance }}</p>
                        <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ t.activityReadableHint }}</p>
                      </div>
                    </div>

                    <UTextarea v-model="taskMessage" class="w-full" :rows="4" size="lg" :placeholder="t.guidance" @paste="handlePaste" />

                    <TaskFilePicker
                      :files="guidanceFiles"
                      :title="t.evidence"
                      :hint="t.pasteHint"
                      :choose-label="t.files"
                      :edit-image-label="t.editImage"
                      :remove-label="t.deleteAttachment"
                      @file-change="handleFileInput"
                      @file-drop="handleFileDrop"
                      @annotate="openPendingAnnotationEditor"
                      @remove="removePendingTaskFile"
                    />

                    <div class="flex justify-end">
                      <UButton
                        class="disabled:opacity-40 disabled:saturate-50"
                        type="button"
                        icon="i-lucide-send"
                        :loading="taskSubmitting"
                        :disabled="!taskMessage.trim() && !guidanceFiles.length"
                        @click="sendGuidanceAction"
                      >
                        {{ t.sendMessage }}
                      </UButton>
                    </div>
                  </section>

                  <section v-else-if="canRequestFollowUp" class="grid gap-4 rounded-xl bg-amber-50/70 p-4 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900/60">
                    <div class="flex items-start gap-3 text-amber-950 dark:text-amber-100">
                      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        <UIcon name="i-lucide-rotate-ccw" class="size-4" />
                      </span>
                      <div>
                        <p class="text-sm font-semibold">{{ t.followUp }}</p>
                        <p class="mt-0.5 text-xs leading-5 opacity-75">{{ t.followUpHelp }}</p>
                      </div>
                    </div>

                    <UTextarea
                      v-model="followUpMessage"
                      class="w-full"
                      :rows="4"
                      size="lg"
                      :placeholder="t.followUpPlaceholder"
                      @paste="handlePaste"
                    />

                    <TaskFilePicker
                      :files="followUpFiles"
                      :title="t.evidence"
                      :hint="t.pasteHint"
                      :choose-label="t.files"
                      :edit-image-label="t.editImage"
                      :remove-label="t.deleteAttachment"
                      tone="warning"
                      @file-change="handleFileInput"
                      @file-drop="handleFileDrop"
                      @annotate="openPendingAnnotationEditor"
                      @remove="removePendingTaskFile"
                    />

                    <div class="flex justify-end">
                      <UButton
                        class="disabled:opacity-40 disabled:saturate-50"
                        type="button"
                        color="warning"
                        icon="i-lucide-rotate-ccw"
                        :loading="taskSubmitting"
                        :disabled="!followUpMessage.trim() && !followUpFiles.length"
                        @click="requestFollowUpAction"
                      >
                        {{ t.requestFollowUp }}
                      </UButton>
                    </div>
                  </section>

                  <UAlert v-else color="neutral" variant="soft" icon="i-lucide-lock" :description="t.steeringUnavailable" />
                </div>

                <aside class="min-w-0 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-zinc-900/55 dark:ring-zinc-800">
                  <div class="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-zinc-950 dark:text-white">{{ t.latestUpdate }}</p>
                      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{{ t.activityReadableHint }}</p>
                    </div>
                    <span
                      class="grid size-8 shrink-0 place-items-center rounded-lg ring-1"
                      :class="{
                        'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900': latestAgentUpdate?.tone === 'error',
                        'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900': latestAgentUpdate?.tone === 'success',
                        'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900': latestAgentUpdate?.tone === 'info',
                        'bg-white text-teal-600 ring-zinc-200 dark:bg-zinc-950 dark:text-teal-300 dark:ring-zinc-700': !latestAgentUpdate || latestAgentUpdate.tone === 'neutral',
                      }"
                    >
                      <UIcon
                        :name="latestAgentUpdate?.tone === 'error'
                          ? 'i-lucide-circle-alert'
                          : latestAgentUpdate?.tone === 'success'
                            ? 'i-lucide-circle-check'
                            : latestAgentUpdate?.tone === 'info'
                              ? 'i-lucide-loader-circle'
                              : 'i-lucide-sparkles'"
                        class="size-4"
                      />
                    </span>
                  </div>

                  <div
                    v-if="latestAgentUpdate"
                    class="rounded-lg p-4 ring-1"
                    :class="{
                      'bg-red-50/70 text-red-950 ring-red-200 dark:bg-red-950/25 dark:text-red-100 dark:ring-red-900': latestAgentUpdate.tone === 'error',
                      'bg-emerald-50/70 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-100 dark:ring-emerald-900': latestAgentUpdate.tone === 'success',
                      'bg-teal-50/70 text-teal-950 ring-teal-200 dark:bg-teal-950/25 dark:text-teal-100 dark:ring-teal-900': latestAgentUpdate.tone === 'info',
                      'bg-white text-zinc-700 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-800': latestAgentUpdate.tone === 'neutral',
                    }"
                  >
                    <time class="mb-2 block text-xs text-zinc-500 dark:text-zinc-400">{{ formatActivityTime(latestAgentUpdate.createdAt) }}</time>
                    <p class="whitespace-pre-wrap break-words text-sm leading-6">{{ latestAgentUpdate.body }}</p>
                  </div>
                  <p v-else class="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    {{ t.noAgentUpdate }}
                  </p>
                </aside>
              </div>
            </section>

            <section
              v-show="activeTaskTab === 'refinement'"
              id="task-panel-refinement"
              role="tabpanel"
              aria-labelledby="task-tab-refinement"
              class="min-w-0"
            >
              <TaskRefinementPanel
                :runs="refinementPanelRuns"
                :current-run="selectedRefinementPanelRun"
                :busy="refinementBusy || taskSubmitting"
                :create-on-start="!selectedTaskId"
                :task-ready="Boolean(taskForm.title.trim())"
                :description-changed="selectedRefinementDescriptionChanged"
                :action-error="errorMessage"
                :locale="locale === 'de' ? 'de-CH' : 'en-US'"
                @start="startTaskRefinement"
                @submit-answers="submitRefinementAnswers"
                @apply="requestApplyTaskRefinement"
                @retry="retryTaskRefinement"
                @select-run="selectTaskRefinement"
                @dirty-change="refinementDraftDirty = $event"
                @request-task-details="focusTaskTitleForRefinement"
              >
                <template #result="{ markdown }">
                  <UEditor
                    v-if="markdown"
                    :model-value="markdown"
                    content-type="markdown"
                    :editable="false"
                    :image="false"
                    :mention="false"
                    class="ak-markdown-readonly text-sm leading-7 text-zinc-700 dark:text-zinc-300"
                    :ui="{ content: 'px-0 py-0', base: 'px-0 sm:px-0 text-sm text-zinc-700 dark:text-zinc-300' }"
                  />
                </template>
              </TaskRefinementPanel>
            </section>

            <section
              v-if="activeTaskTab === 'comments'"
              id="task-panel-comments"
              role="tabpanel"
              aria-labelledby="task-tab-comments"
              class="min-w-0 p-4 sm:p-6"
            >
              <div class="mx-auto grid max-w-3xl gap-5">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-base font-semibold text-zinc-950 dark:text-white">{{ t.comments }}</p>
                    <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ commentCount }} {{ t.total }}</p>
                  </div>
                  <UBadge
                    v-if="unreadCommentMentionCount"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-at-sign"
                  >
                    {{ unreadCommentMentionCount === 1
                      ? t.commentMentionNotificationSingle
                      : t.commentMentionNotification.replace('{count}', String(unreadCommentMentionCount)) }}
                  </UBadge>
                  <span v-else class="grid size-9 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                    <UIcon name="i-lucide-messages-square" class="size-4" />
                  </span>
                </div>

                <div ref="commentComposerEl" class="grid gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-zinc-900/55 dark:ring-zinc-800">
                  <UFormField :label="t.commentPlaceholder" size="lg">
                    <UTextarea
                      v-model="commentMessage"
                      class="w-full"
                      :rows="3"
                      size="lg"
                      :placeholder="t.commentPlaceholder"
                      aria-autocomplete="list"
                      :aria-expanded="commentMentionOpen"
                      aria-controls="comment-mention-suggestions"
                      :aria-activedescendant="commentMentionOpen && commentMentionSuggestions[commentMentionActiveIndex]
                        ? `comment-mention-${commentMentionSuggestions[commentMentionActiveIndex]?.id}`
                        : undefined"
                      @input="handleCommentInput"
                      @keydown="handleCommentMentionKeydown"
                    />
                  </UFormField>

                  <div
                    v-if="commentMentionOpen && commentMentionSuggestions.length"
                    id="comment-mention-suggestions"
                    role="listbox"
                    :aria-label="t.commentMentionSuggestions"
                    class="grid gap-1 rounded-lg bg-white p-1.5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-700"
                  >
                    <button
                      v-for="(member, index) in commentMentionSuggestions"
                      :id="`comment-mention-${member.id}`"
                      :key="member.id"
                      type="button"
                      role="option"
                      :aria-selected="index === commentMentionActiveIndex"
                      class="flex min-h-10 items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors"
                      :class="index === commentMentionActiveIndex
                        ? 'bg-teal-50 text-teal-950 dark:bg-teal-950/60 dark:text-teal-100'
                        : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900'"
                      @mousedown.prevent
                      @click="selectCommentMention(member)"
                    >
                      <span class="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {{ member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() }}
                      </span>
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-medium">{{ member.name }}</span>
                        <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ member.email }}</span>
                      </span>
                    </button>
                  </div>

                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="inline-flex items-start gap-1.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                        <UIcon name="i-lucide-at-sign" class="mt-0.5 size-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                        <span>{{ t.commentMentionHint }}</span>
                      </p>
                      <div v-if="selectedCommentMentionMembers.length" class="mt-2 flex flex-wrap gap-1.5">
                        <span
                          v-for="member in selectedCommentMentionMembers"
                          :key="member.id"
                          class="inline-flex items-center gap-1 rounded-md bg-teal-100 px-2 py-1 text-xs font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                        >
                          @{{ member.name }}
                          <button
                            type="button"
                            class="grid size-4 place-items-center rounded text-teal-700 hover:bg-teal-200 dark:text-teal-300 dark:hover:bg-teal-900"
                            :aria-label="`${t.clear}: ${member.name}`"
                            @click="removeCommentMention(member)"
                          >
                            <UIcon name="i-lucide-x" class="size-3" />
                          </button>
                        </span>
                      </div>
                    </div>
                    <UButton
                      class="shrink-0 disabled:opacity-40 disabled:saturate-50"
                      type="button"
                      icon="i-lucide-send"
                      :loading="taskSubmitting"
                      :disabled="!commentMessage.trim()"
                      @click="sendCommentAction"
                    >
                      {{ t.sendComment }}
                    </UButton>
                  </div>
                </div>

                <div class="grid gap-3">
                  <article
                    v-for="comment in teamComments"
                    :key="comment.id"
                    :data-comment-id="comment.id"
                    :data-unread-mention="String(comment.unreadMention)"
                    class="rounded-xl p-4 ring-1 transition-colors"
                    :class="comment.unreadMention
                      ? 'ak-unread-mention-comment bg-teal-50/70 ring-teal-300 dark:bg-teal-950/25 dark:ring-teal-800'
                      : 'bg-white ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800'"
                  >
                    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="text-sm font-semibold text-zinc-950 dark:text-white">{{ comment.userName }}</p>
                        <UBadge
                          v-if="comment.mentionedCurrentUser"
                          color="primary"
                          variant="soft"
                          size="sm"
                          icon="i-lucide-at-sign"
                        >
                          {{ t.commentMentionedYou }}
                        </UBadge>
                      </div>
                      <time class="text-xs text-zinc-500 dark:text-zinc-400">{{ formatActivityTime(comment.createdAt) }}</time>
                    </div>
                    <p class="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                      <span
                        v-for="(segment, index) in commentSegments(comment)"
                        :key="`${comment.id}-${index}`"
                        :class="segment.mention
                          ? segment.currentUser
                            ? 'rounded bg-teal-200/80 px-1 font-semibold text-teal-950 dark:bg-teal-800 dark:text-teal-50'
                            : 'rounded bg-zinc-100 px-1 font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
                          : ''"
                      >{{ segment.text }}</span>
                    </p>
                  </article>
                  <p v-if="!teamComments.length" class="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    {{ t.noComments }}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </template>

        <template #footer>
          <UButton
            v-if="selectedTaskId && editingTask?.agentStatus !== 'running'"
            class="mr-auto"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            type="button"
            :loading="taskSubmitting"
            :aria-label="t.deleteTask"
            :title="t.deleteTask"
            @click.prevent.stop="requestDeleteTask"
          />
          <UButton color="neutral" variant="ghost" type="button" @click="requestCloseTaskModal">{{ selectedTaskId ? t.close : t.cancel }}</UButton>
          <UButton
            v-if="activeTaskTab === 'task'"
            class="disabled:opacity-40 disabled:saturate-50"
            :icon="selectedTaskId ? 'i-lucide-save' : 'i-lucide-plus'"
            type="submit"
            form="task-form"
            :loading="taskSubmitting"
            :disabled="selectedTaskId ? !taskDetailsDirty : !taskForm.title.trim()"
          >
            <span>{{ selectedTaskId ? t.save : t.createTask }}</span>
            <span class="hidden items-center gap-0.5 sm:inline-flex" aria-hidden="true">
              <UKbd value="meta" size="sm" />
              <UKbd value="enter" size="sm" />
            </span>
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
        v-if="refinementOverwriteModalOpen"
        v-model:open="refinementOverwriteModalOpen"
        :title="t.refinementOverwriteTitle"
        :ui="{ content: 'max-w-md' }"
      >
        <template #close="{ ui }">
          <UButton
            :aria-label="t.close"
            :class="ui.close()"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :disabled="refinementBusy"
            @click="cancelRefinementOverwrite"
          />
        </template>
        <template #body>
          <div class="grid gap-5">
            <div class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <p class="text-sm leading-6">{{ t.refinementOverwriteDescription }}</p>
            </div>
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <UButton color="neutral" variant="ghost" type="button" :disabled="refinementBusy" @click="cancelRefinementOverwrite">
                {{ t.keepEditing }}
              </UButton>
              <UButton color="warning" icon="i-lucide-file-pen-line" type="button" :loading="refinementBusy" @click="confirmApplyTaskRefinement">
                {{ t.refinementOverwriteConfirm }}
              </UButton>
            </div>
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
        v-if="deleteAttachmentModalOpen"
        v-model:open="deleteAttachmentModalOpen"
        :title="t.deleteAttachment"
        :description="t.deleteAttachmentConfirm"
        :ui="{ content: 'max-w-md' }"
      >
        <template #close="{ ui }">
          <UButton :aria-label="t.close" :class="ui.close()" color="neutral" variant="ghost" icon="i-lucide-x" />
        </template>
        <template #body>
          <div class="grid gap-5">
            <div class="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
              <UIcon name="i-lucide-file-x-2" class="mt-0.5 size-5 shrink-0" />
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{{ selectedAttachmentForDeletion?.fileName }}</p>
                <p class="mt-1 text-sm leading-6">{{ t.deleteAttachmentWarning }}</p>
              </div>
            </div>
            <div class="flex justify-end gap-3">
              <UButton color="neutral" variant="ghost" type="button" @click="deleteAttachmentModalOpen = false">{{ t.cancel }}</UButton>
              <UButton color="error" icon="i-lucide-trash-2" type="button" :loading="attachmentSubmitting" @click="confirmDeleteAttachmentAction">
                {{ t.deleteAttachment }}
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
                  :aria-label="t.drawingColor + ': ' + color"
                  :title="t.drawingColor + ': ' + color"
                  @click="annotationColor = color"
                />
              </div>
              <div class="flex min-w-48 items-center gap-3">
                <UIcon name="i-lucide-pencil-line" class="size-4 text-zinc-400" />
                <input v-model.number="annotationWidth" type="range" min="2" max="18" class="w-36 accent-teal-600" :aria-label="t.strokeWidth">
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
              <div class="relative mx-auto block w-fit max-w-full">
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
                  :aria-label="t.annotationHelp"
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

    <Teleport to="body">
      <div
        v-if="keyboardHintMode"
        data-keytip-layer
        data-keyboard-hints
        class="pointer-events-none fixed inset-0 z-[10000] overflow-hidden"
        aria-hidden="true"
      >
        <span
          v-for="target in keyboardHintTargets"
          :key="target.code"
          data-keytip-hint
          :data-keytip-code="target.code"
          :data-keytip-target="target.label"
          class="fixed inline-flex h-[18px] min-w-[18px] -translate-x-[35%] -translate-y-[55%] items-center justify-center rounded-[5px] border border-white/55 bg-teal-800/55 px-1 font-mono text-[9px] font-extrabold leading-none tracking-[0.08em] text-white/85 shadow-[0_2px_6px_rgba(15,23,42,0.16)] ring-1 ring-teal-950/10 after:absolute after:-bottom-[3px] after:left-1/2 after:size-1 after:-translate-x-1/2 after:rotate-45 after:border-b after:border-r after:border-white/40 after:bg-teal-800/55 dark:border-zinc-950/35 dark:bg-teal-300/55 dark:text-zinc-950/85 dark:ring-white/15 dark:after:border-zinc-950/25 dark:after:bg-teal-300/55"
          :class="keyboardHintPrefix
            ? (target.code.startsWith(keyboardHintPrefix)
              ? 'z-[1] !border-white/80 !bg-teal-700 !text-white after:!bg-teal-700 dark:!border-zinc-950/45 dark:!bg-teal-300 dark:!text-zinc-950 dark:after:!bg-teal-300'
              : '')
            : ''"
          :style="{ left: `${target.left}px`, top: `${target.top}px` }"
        >
          <span v-if="keyboardHintPrefix && target.code.startsWith(keyboardHintPrefix)" class="text-teal-100 dark:text-teal-800">{{ target.code.slice(0, keyboardHintPrefix.length) }}</span>
          <span>{{ target.code.slice(target.code.startsWith(keyboardHintPrefix) ? keyboardHintPrefix.length : 0) }}</span>
        </span>

        <div class="fixed bottom-6 left-1/2 hidden max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-white/15 bg-zinc-950/95 px-3 py-2 text-[11px] text-white shadow-2xl shadow-zinc-950/30 backdrop-blur sm:flex dark:border-zinc-700 dark:bg-white/95 dark:text-zinc-950">
          <span class="inline-flex shrink-0 items-center gap-1.5 font-semibold">
            <UIcon name="i-lucide-keyboard" class="size-3.5 text-teal-300 dark:text-teal-700" />
            {{ t.keyboardHintsActive }}
          </span>
          <span class="hidden h-4 w-px bg-white/20 sm:block dark:bg-zinc-300" />
          <span class="hidden min-w-0 truncate text-white/70 sm:block dark:text-zinc-600">{{ keyboardHintCountLabel }}</span>
          <span class="h-4 w-px shrink-0 bg-white/20 dark:bg-zinc-300" />
          <span class="min-w-0 truncate text-white/80 dark:text-zinc-700">{{ keyboardHintInstruction }}</span>
        </div>
      </div>

      <div
        v-if="keyboardHintMode"
        data-keytip-live
        data-keyboard-hints
        class="sr-only"
        role="status"
        aria-live="polite"
      >
        {{ t.keyboardHintsActive }}. {{ keyboardHintCountLabel }}. {{ keyboardHintInstruction }}
      </div>
      <div data-keyboard-hints class="sr-only" role="status" aria-live="polite">
        {{ keyboardActionAnnouncement }}
      </div>
    </Teleport>
  </div>
</template>
