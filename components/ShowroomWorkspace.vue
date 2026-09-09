<script setup lang="ts">
import type { ShowroomFeedback, ShowroomIteration, ShowroomLibrary, ShowroomShare, ShowroomView } from '../shared/showroom';
const props = defineProps<{ projectId?: string; guestToken?: string; locale: 'de' | 'en' }>();
const emit = defineEmits<{ openTask: [id: string] }>();
const say = (german: string, english: string) => props.locale === 'de' ? german : english;
const endpoint = computed(() => props.guestToken ? '/api/showroom-shares/' + encodeURIComponent(props.guestToken) : '/api/projects/' + props.projectId + '/showroom');
const library = ref<ShowroomLibrary | null>(null);
const viewLibrary = ref<ShowroomLibrary | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const busy = ref(false);
const tab = ref('library');
const category = ref('*');
const search = ref('');
const views = computed(() => library.value?.views.filter(view => (category.value === '*' || view.category === category.value) && (view.title + ' ' + view.path).toLowerCase().includes(search.value.toLowerCase())) ?? []);
const selectedView = ref<ShowroomView | null>(null);
const focusFeedback = ref<ShowroomFeedback | null>(null);
const feedback = ref<ShowroomFeedback[]>([]);
const shares = ref<ShowroomShare[]>([]);
const iterations = ref<ShowroomIteration[]>([]);
const selectedIds = ref<string[]>([]);
const status = ref('open');
const feedbackPath = ref('*');
const filteredFeedback = computed(() => feedback.value.filter(row => (status.value === '*' || row.status === status.value) && (feedbackPath.value === '*' || row.viewPath === feedbackPath.value)));
const categoryModal = ref(false);
const categoryName = ref('');
const shareModal = ref(false);
const shareName = ref('');
const shareCategory = ref('');
const shareComments = ref(true);
const shareExpiry = ref('30');
const createdLink = ref('');
const freshLinks = ref<Record<string, string>>({});
const revokeId = ref<string | null>(null);
const iterationModal = ref(false);
const targetPath = ref('');
const brief = ref('');
const sourcePath = ref<string | null>(null);
const snapshotId = ref<string | null>(null);
const harness = ref('codex');
const start = ref(true);
const iterationRequest = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
const date = (value: string) => new Date(value).toLocaleString(props.locale === 'de' ? 'de-CH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const labelStatus = (value: string) => ({ open: say('Offen', 'Open'), in_progress: say('In Bearbeitung', 'In progress'), resolved: say('Erledigt', 'Resolved') }[value] ?? value);
const previewUrl = (view: ShowroomView) => '/showroom-preview/' + library.value!.previewToken + '/' + view.path.split('/').map(encodeURIComponent).join('/');
function errorText(e: any) {
  const key = e?.data?.statusMessage || e?.statusMessage;
  const known: Record<string, string> = {
    showroom_link_unavailable: say('Dieser Share-Link ist nicht mehr verfügbar. Er wurde widerrufen oder ist abgelaufen. Bitte frage das Projektteam nach einem neuen Link.', 'This share link is no longer available. It expired or was revoked. Ask the project team for a new link.'),
    showroom_category_exists: say('Diese Kategorie existiert bereits.', 'This category already exists.'),
    showroom_invalid_category: say('Bitte einen Ordnernamen ohne Schrägstriche oder Sonderzeichen verwenden.', 'Use a folder name without slashes or special characters.'),
    showroom_invalid_path: say('Bitte einen relativen Pfad ohne Punktordner oder Sonderzeichen verwenden.', 'Use a relative path without dot folders or special characters.'),
    showroom_target_requires_category_html: say('Das Ziel muss Kategorie/datei.html sein.', 'The target must be category/file.html.'),
    showroom_target_exists: say('Diese Datei existiert bereits. Wähle einen neuen Dateinamen.', 'This file already exists. Choose a new file name.'),
    showroom_feedback_version_mismatch: say('Bitte nur Feedback derselben Ansicht und Version auswählen.', 'Select feedback for the same view and version.'),
    showroom_feedback_changed: say('Feedback wurde inzwischen bearbeitet. Bitte aktualisieren und neu auswählen.', 'Feedback changed. Refresh and select it again.'),
    showroom_publish_conflict: say('Die Veröffentlichung würde bestehende Dateien verändern. Bitte den Agenten neue, versionsbezogene Assets erzeugen lassen.', 'Publishing would change existing files. Ask the agent to create new version-specific assets.'),
    showroom_worktree_missing_reopen_task: say('Der Arbeitsbereich wurde nach Abschluss entfernt. Bitte die Aufgabe erneut öffnen und ausführen.', 'The task workspace was cleaned up. Reopen and run the task again.'),
    showroom_result_missing: say('Die erwartete HTML-Datei fehlt im Agent-Ergebnis. Bitte die Aufgabe prüfen.', 'The expected HTML file is missing. Please review the task.'),
    showroom_iteration_not_ready: say('Der Agent hat die Aufgabe noch nicht abgeschlossen.', 'The agent has not completed this task yet.'),
    showroom_rate_limited: say('Zu viele Anfragen. Bitte in einer Minute erneut versuchen.', 'Too many requests. Try again in a minute.'),
  };
  return known[key] || say('Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.', 'Could not complete this action. Please try again.');
}
async function refresh(withLibrary = true) {
  try {
    error.value = '';
    if (withLibrary) library.value = await $fetch<ShowroomLibrary>(endpoint.value);
    if (!props.guestToken) {
      [feedback.value, shares.value, iterations.value] = await Promise.all([
        $fetch<ShowroomFeedback[]>(endpoint.value + '/feedback'), $fetch<ShowroomShare[]>(endpoint.value + '/shares'), $fetch<ShowroomIteration[]>(endpoint.value + '/iterations'),
      ]);
    }
  } catch (e: any) { error.value = errorText(e); if (props.guestToken && e?.statusCode === 404) library.value = null; }
  finally { loading.value = false; }
}
async function act(action: () => Promise<unknown>, message?: string) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await action(); if (message) notice.value = message; } catch (e) { error.value = errorText(e); } finally { busy.value = false; }
}
function openView(view: ShowroomView) { viewLibrary.value = library.value; selectedView.value = view; focusFeedback.value = null; }
async function openFeedback(row: ShowroomFeedback) {
  await act(async () => {
    viewLibrary.value = await $fetch<ShowroomLibrary>(endpoint.value, { query: { snapshot: row.snapshotId } });
    selectedView.value = viewLibrary.value.views.find(view => view.path === row.viewPath) || null;
    focusFeedback.value = row;
  });
}
async function addCategory() {
  await act(async () => {
    await $fetch(endpoint.value + '/categories', { method: 'POST', body: { name: categoryName.value } });
    categoryModal.value = false; category.value = categoryName.value.trim(); categoryName.value = ''; await refresh();
  });
}
async function addShare() {
  await act(async () => {
    const result = await $fetch<{ share: ShowroomShare; token: string }>(endpoint.value + '/shares', { method: 'POST', body: {
      name: shareName.value, category: shareCategory.value || null, canComment: shareComments.value, expiresInDays: shareExpiry.value ? Number(shareExpiry.value) : null,
    } });
    createdLink.value = window.location.origin + '/s/' + result.token;
    freshLinks.value[result.share.id] = createdLink.value;
    await refresh(false);
  });
}
async function copyLink(link: string) {
  await act(async () => { await navigator.clipboard.writeText(link); }, say('Share-Link kopiert.', 'Share link copied.'));
}
async function revoke() {
  await act(async () => {
    await $fetch(endpoint.value + '/shares/' + revokeId.value, { method: 'DELETE', body: {} });
    revokeId.value = null; await refresh(false);
  }, say('Zugriff widerrufen. Bereits geladene Inhalte lassen sich nicht zurückholen.', 'Access revoked. Already loaded content cannot be taken back.'));
}
function toggleFeedback(row: ShowroomFeedback, checked: boolean) {
  selectedIds.value = checked ? [...selectedIds.value, row.id] : selectedIds.value.filter(id => id !== row.id);
}
function newIteration(view?: ShowroomView, fromFeedback = false) {
  const selected = fromFeedback ? feedback.value.filter(row => selectedIds.value.includes(row.id)) : [];
  if (!fromFeedback) selectedIds.value = [];
  sourcePath.value = selected[0]?.viewPath ?? view?.path ?? null;
  snapshotId.value = selected[0]?.snapshotId ?? library.value?.snapshotId ?? null;
  const source = sourcePath.value;
  if (source) {
    const stem = source.replace(/(?:-v\d+)?\.html?$/i, '');
    let version = Number(source.match(/-v(\d+)\.html?$/i)?.[1] ?? 1) + 1;
    const used = new Set([...(library.value?.views.map(view => view.path) ?? []), ...iterations.value.map(item => item.targetPath)]);
    while (used.has(stem + '-v' + version + '.html')) version++;
    targetPath.value = stem + '-v' + version + '.html';
  } else targetPath.value = (category.value !== '*' && category.value ? category.value : 'Startseite') + '/entwurf.html';
  brief.value = fromFeedback ? say('Überarbeite die Ansicht anhand des ausgewählten Feedbacks. Bewahre funktionierende Inhalte und Interaktionen.', 'Improve this view using the selected feedback. Preserve working content and interactions.') : '';
  iterationRequest.value = crypto.randomUUID(); iterationModal.value = true;
}
async function createIteration() {
  await act(async () => {
    await $fetch(endpoint.value + '/iterations', { method: 'POST', body: {
      requestId: iterationRequest.value, targetPath: targetPath.value, brief: brief.value,
      sourcePath: sourcePath.value, snapshotId: snapshotId.value, feedbackIds: selectedIds.value, agentHarness: harness.value, start: start.value,
    } });
    iterationModal.value = false; selectedIds.value = []; tab.value = 'iterations'; await refresh(false);
  }, say('Agent-Aufgabe angelegt. Den Fortschritt findest du unter Iterationen und im Kanban.', 'Agent task created. Track progress in Iterations and Kanban.'));
}
async function changeStatus(row: ShowroomFeedback, next: ShowroomFeedback['status']) {
  await act(async () => { await $fetch(endpoint.value + '/feedback/' + row.id, { method: 'PATCH', body: { status: next } }); await refresh(false); selectedIds.value = selectedIds.value.filter(id => id !== row.id); });
}
async function publish(iteration: ShowroomIteration) {
  await act(async () => { await $fetch(endpoint.value + '/iterations/' + iteration.id + '/publish', { method: 'POST', body: {} }); await refresh(); },
    say('Neue Ansicht veröffentlicht. Bitte prüfen und das zugehörige Feedback danach als erledigt markieren.', 'New view published. Review it before marking its feedback resolved.'));
}
onMounted(() => {
  void refresh();
  timer = setInterval(() => {
    if (!document.hidden && !busy.value && !categoryModal.value && !shareModal.value && !iterationModal.value) void refresh(Boolean(props.guestToken));
  }, 30_000);
});
onBeforeUnmount(() => clearInterval(timer));
defineExpose({ refresh });
</script>

<template>
  <div class="sr-workspace" :class="{ 'sr-guest': guestToken }">
    <header v-if="guestToken && library" class="sr-guest-header"><div class="sr-brand"><span class="sr-project-mark">{{ library.project.key.slice(0, 2) }}</span><div><strong>{{ library.project.name }}</strong><span>Showroom · {{ library.shareName }}</span></div></div><span class="sr-access"><UIcon name="i-lucide-link" />{{ library.canComment ? say('Ansehen & Feedback geben', 'View & give feedback') : say('Nur ansehen', 'View only') }}</span></header>
    <div class="sr-topline">
      <div><h1>{{ guestToken ? say('Ein Blick auf das, was entsteht.', 'A look at what’s taking shape.') : 'Showroom' }}</h1><p>{{ guestToken ? say('Entdecke die Prototypen. Öffne eine Ansicht und probiere sie aus.', 'Explore the prototypes. Open a view and try it out.') : say('Prototypen zeigen. Feedback sammeln. Gemeinsam weiterentwickeln.', 'Share prototypes. Collect feedback. Improve together.') }}</p></div>
      <div v-if="!guestToken" class="sr-actions"><button class="sr-button" @click="categoryModal = true"><UIcon name="i-lucide-folder-plus" />{{ say('Kategorie', 'Category') }}</button><button class="sr-button sr-primary" :disabled="!library" @click="newIteration()"><UIcon name="i-lucide-sparkles" />{{ say('Ansicht mit Agent erstellen', 'Create view with agent') }}</button></div>
    </div>
    <nav v-if="!guestToken" class="sr-tabs" :aria-label="say('Showroom-Bereiche', 'Showroom sections')">
      <button v-for="item in [{ id: 'library', label: say('Ansichten', 'Views'), icon: 'i-lucide-panels-top-left' }, { id: 'feedback', label: 'Feedback', icon: 'i-lucide-message-square' }, { id: 'shares', label: say('Freigaben', 'Sharing'), icon: 'i-lucide-link' }, { id: 'iterations', label: say('Iterationen', 'Iterations'), icon: 'i-lucide-git-branch' }]" :key="item.id" :class="{ 'is-active': tab === item.id }" :aria-current="tab === item.id ? 'page' : undefined" @click="tab = item.id"><UIcon :name="item.icon" />{{ item.label }}<span v-if="item.id === 'feedback' && feedback.filter(f => f.status === 'open').length" class="sr-count">{{ feedback.filter(f => f.status === 'open').length }}</span></button>
    </nav>
    <p v-if="error" role="alert" class="sr-error">{{ error }} <button v-if="!guestToken" class="sr-button" @click="refresh()">{{ say('Aktualisieren', 'Refresh') }}</button></p>
    <p v-if="notice" role="status" class="sr-success">{{ notice }}</p>
    <div v-if="loading" class="sr-loading" role="status">{{ say('Showroom wird geladen …', 'Loading showroom …') }}<div /><div /><div /></div>
    <template v-else-if="library">
      <div v-if="tab === 'library'" class="sr-library">
        <aside class="sr-categories">
          <span class="sr-section-label">{{ say('Kategorien', 'Categories') }}</span>
          <button :class="{ 'is-active': category === '*' }" @click="category = '*'"><UIcon name="i-lucide-layout-grid" />{{ say('Alle Ansichten', 'All views') }}<span>{{ library.views.length }}</span></button>
          <button v-if="library.views.some(v => !v.category)" :class="{ 'is-active': category === '' }" @click="category = ''"><UIcon name="i-lucide-folder" />showroom/<span>{{ library.views.filter(v => !v.category).length }}</span></button>
          <button v-for="cat in library.categories" :key="cat" :class="{ 'is-active': category === cat }" @click="category = cat"><UIcon name="i-lucide-folder" /><span class="sr-category-name">{{ cat }}</span><span>{{ library.views.filter(v => v.category === cat).length }}</span></button>
          <div v-if="!guestToken" class="sr-repo-note"><UIcon name="i-lucide-folder-git-2" /><code>showroom/</code><p>{{ say('Unterordner werden zu Kategorien. HTML-Dateien werden zu Ansichten.', 'Subfolders become categories. HTML files become views.') }}</p></div>
        </aside>
        <section class="sr-gallery-section">
          <div class="sr-gallery-toolbar"><h2>{{ category === '*' ? say('Alle Ansichten', 'All views') : category || 'showroom/' }}</h2><label><span class="sr-only">{{ say('Ansichten suchen', 'Search views') }}</span><input v-model="search" type="search" class="sr-search" :placeholder="say('Ansichten suchen …', 'Search views …')"></label><button class="sr-button" :aria-label="say('Aus Repository aktualisieren', 'Refresh from repository')" @click="refresh()"><UIcon name="i-lucide-refresh-cw" /></button></div>
          <div v-if="!views.length" class="sr-empty"><UIcon name="i-lucide-panels-top-left" /><h3>{{ library.views.length ? say('Keine passenden Ansichten', 'No matching views') : say('Hier beginnt dein Showroom.', 'Your showroom starts here.') }}</h3><p>{{ guestToken ? say('Hier werden bald neue Prototypen zur Ansicht bereitstehen.', 'New prototypes will appear here soon.') : say('Lass einen Agenten die erste HTML-Ansicht erstellen oder lege Dateien in showroom/ ab.', 'Ask an agent to create the first HTML view or add files to showroom/.') }}</p><code v-if="!guestToken">showroom/Startseite/entwurf.html</code><button v-if="!guestToken" class="sr-button sr-primary" @click="newIteration()">{{ say('Erste Ansicht erstellen', 'Create first view') }}</button></div>
          <div v-else class="sr-gallery">
            <article v-for="view in views" :key="view.path" class="sr-view-card">
              <button class="sr-thumbnail" :aria-label="say('Ansicht öffnen: ', 'Open view: ') + view.title" @click="openView(view)"><iframe :src="previewUrl(view)" :title="say('Miniatur: ', 'Thumbnail: ') + view.title" sandbox="allow-scripts" aria-hidden="true" tabindex="-1" loading="lazy" referrerpolicy="no-referrer" /><span class="sr-open"><UIcon name="i-lucide-expand" />{{ say('Ansicht öffnen', 'Open view') }}</span></button>
              <div class="sr-card-caption"><button @click="openView(view)"><strong>{{ view.title }}</strong><code>{{ view.path }}</code></button><div class="sr-card-meta"><span>{{ view.category || 'showroom/' }}</span><span v-if="!guestToken">{{ feedback.filter(f => f.viewPath === view.path && f.status !== 'resolved').length }} Feedback</span><button v-if="!guestToken" class="sr-button" :aria-label="say('Neue Version von ', 'New version of ') + view.title" @click="newIteration(view)"><UIcon name="i-lucide-git-branch" /></button></div></div>
            </article>
          </div>
          <details v-if="!guestToken && library.warnings.length" class="sr-repo-note"><summary>{{ say('Hinweise zu Repository-Dateien', 'Repository file notices') }} ({{ library.warnings.length }})</summary><p v-for="warning in library.warnings" :key="warning">{{ warning }}</p></details>
        </section>
      </div>
      <section v-else-if="tab === 'shares'" class="sr-section">
        <div class="sr-section-heading"><div><h2>{{ say('Kunden einladen', 'Invite your customers') }}</h2><p>{{ say('Jeder Link ist separat benannt und kann jederzeit widerrufen werden. Er öffnet ausschließlich den Showroom.', 'Each named link can be revoked independently. It opens only the showroom.') }}</p></div><button class="sr-button sr-primary" @click="shareModal = true; createdLink = ''; shareName = ''"><UIcon name="i-lucide-plus" />{{ say('Share-Link erstellen', 'Create share link') }}</button></div>
        <p v-if="!shares.length" class="sr-empty-line">{{ say('Noch keine Freigaben. Erstelle einen Link für deine erste Feedback-Runde.', 'No shares yet. Create a link for your first feedback round.') }}</p>
        <div v-for="share in shares" :key="share.id" class="sr-share-row">
          <span class="sr-share-icon"><UIcon name="i-lucide-link" /></span><div class="sr-share-info"><strong>{{ share.name }}</strong><p>{{ share.category || say('Alle Kategorien', 'All categories') }} · {{ share.canComment ? say('Ansehen & Feedback', 'View & feedback') : say('Nur ansehen', 'View only') }}</p><small>{{ say('Erstellt ', 'Created ') + date(share.createdAt) }} · {{ share.expiresAt ? say('Gültig bis ', 'Expires ') + date(share.expiresAt) : say('Ohne Ablaufdatum', 'No expiry') }}</small></div>
          <span v-if="share.revokedAt || (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now())" class="sr-badge">{{ share.revokedAt ? say('Widerrufen', 'Revoked') : say('Abgelaufen', 'Expired') }}</span>
          <template v-else><button v-if="freshLinks[share.id]" class="sr-button" @click="copyLink(freshLinks[share.id]!)"><UIcon name="i-lucide-copy" />{{ say('Link kopieren', 'Copy link') }}</button><small v-else class="sr-muted">{{ say('Link nur bei Erstellung sichtbar', 'Link shown only on creation') }}</small><button class="sr-button sr-danger" @click="revokeId = share.id">{{ say('Widerrufen', 'Revoke') }}</button></template>
        </div>
        <p class="sr-repo-note">{{ say('Wer den Link besitzt, kann den freigegebenen Bereich öffnen. Teile ihn vertraulich. Namen im Feedback sind selbst angegeben und nicht verifiziert.', 'Anyone with the link can open the shared area. Share it confidentially. Feedback names are self-reported, not verified.') }}</p>
      </section>
      <section v-else-if="tab === 'feedback'" class="sr-section">
        <div class="sr-section-heading"><div><h2>{{ say('Was können wir verbessern?', 'What can we improve?') }}</h2><p>{{ say('Rückmeldungen behalten ihre Ansicht, Version und Markierung. Wähle Feedback einer Version für die nächste Iteration.', 'Comments retain their view, version and selection. Choose feedback from one version for the next iteration.') }}</p></div><button class="sr-button sr-primary" :disabled="!selectedIds.length" @click="newIteration(undefined, true)"><UIcon name="i-lucide-sparkles" />{{ say('Mit Feedback iterieren', 'Iterate on feedback') }} ({{ selectedIds.length }})</button></div>
        <div class="sr-filters"><label><span class="sr-only">{{ say('Feedback-Status', 'Feedback status') }}</span><select v-model="status" class="sr-select"><option value="*">{{ say('Alle Status', 'All statuses') }}</option><option v-for="s in ['open', 'in_progress', 'resolved']" :key="s" :value="s">{{ labelStatus(s) }}</option></select></label><label><span class="sr-only">{{ say('Ansicht filtern', 'Filter view') }}</span><select v-model="feedbackPath" class="sr-select"><option value="*">{{ say('Alle Ansichten', 'All views') }}</option><option v-for="p in [...new Set(feedback.map(f => f.viewPath))]" :key="p">{{ p }}</option></select></label></div>
        <p v-if="!filteredFeedback.length" class="sr-empty-line">{{ say('Keine Rückmeldungen in dieser Auswahl.', 'No feedback in this selection.') }}</p>
        <article v-for="row in filteredFeedback" :key="row.id" class="sr-feedback-row">
          <input v-if="row.status === 'open'" type="checkbox" :checked="selectedIds.includes(row.id)" :aria-label="say('Feedback auswählen von ', 'Select feedback from ') + row.authorName" @change="toggleFeedback(row, ($event.target as HTMLInputElement).checked)">
          <div v-else class="sr-checkbox-space" />
          <div class="sr-feedback-content"><div class="sr-feedback-byline"><strong>{{ row.authorName }}</strong><span>{{ row.shareName || say('Projektteam', 'Project team') }} · {{ date(row.createdAt) }}</span><span class="sr-badge" :class="row.status">{{ labelStatus(row.status) }}</span></div><p>{{ row.body }}</p><div class="sr-feedback-context"><code>{{ row.viewPath }}</code><span>{{ row.viewHash.slice(0, 8) }}</span><span>{{ row.anchor ? row.anchor.kind === 'region' ? say('Bereich', 'Region') : '<' + row.anchor.tag + '>' : say('Ganze Ansicht', 'Whole view') }}</span></div><div class="sr-actions"><button class="sr-button" :disabled="busy" @click="openFeedback(row)"><UIcon name="i-lucide-scan" />{{ say('Im Kontext ansehen', 'View in context') }}</button><button v-if="row.taskId" class="sr-button" @click="emit('openTask', row.taskId)">{{ row.taskKey }} ↗</button><button v-if="row.status !== 'resolved'" class="sr-button" :disabled="busy" @click="changeStatus(row, 'resolved')"><UIcon name="i-lucide-check" />{{ say('Erledigen', 'Resolve') }}</button><button v-if="row.status !== 'open'" class="sr-button" :disabled="busy" @click="changeStatus(row, 'open')">{{ say('Wieder öffnen', 'Reopen') }}</button></div></div>
        </article>
      </section>
      <section v-else-if="tab === 'iterations'" class="sr-section">
        <div class="sr-section-heading"><div><h2>{{ say('Von Feedback zur nächsten Version', 'From feedback to the next version') }}</h2><p>{{ say('Agenten arbeiten in eigenen Git-Arbeitsbereichen. Veröffentliche fertige Ansichten hier und prüfe sie, bevor du Feedback abschließt.', 'Agents work in isolated Git workspaces. Publish completed views here and review them before closing feedback.') }}</p></div><button class="sr-button" @click="refresh()"><UIcon name="i-lucide-refresh-cw" />{{ say('Aktualisieren', 'Refresh') }}</button></div>
        <p v-if="!iterations.length" class="sr-empty-line">{{ say('Noch keine Iteration. Erstelle eine Ansicht oder wähle Feedback aus.', 'No iterations yet. Create a view or select feedback.') }}</p>
        <article v-for="iteration in iterations" :key="iteration.id" class="sr-iteration-row"><UIcon name="i-lucide-git-branch" /><div><strong>{{ iteration.targetPath }}</strong><p>{{ iteration.sourcePath ? iteration.sourcePath + ' → ' + iteration.targetPath : say('Neue Ansicht', 'New view') }}</p><small>{{ date(iteration.createdAt) }}</small></div><span class="sr-badge">{{ iteration.taskStatus || say('Aufgabe entfernt', 'Task removed') }}</span><button v-if="iteration.taskId" class="sr-button" @click="emit('openTask', iteration.taskId)">{{ iteration.taskKey }} ↗</button><button v-if="iteration.taskStatus === 'done'" class="sr-button sr-primary" :disabled="busy" @click="publish(iteration)">{{ library.views.some(v => v.path === iteration.targetPath) ? say('Erneut prüfen', 'Verify again') : say('Im Showroom veröffentlichen', 'Publish in showroom') }}</button><button v-if="library.views.some(v => v.path === iteration.targetPath)" class="sr-button" @click="openView(library.views.find(v => v.path === iteration.targetPath)!)">{{ say('Ansicht öffnen', 'Open view') }}</button></article>
        <p class="sr-repo-note">{{ say('Veröffentlichen fügt neue Dateien in showroom/ im Projekt-Repository ein. Bestehende Ansichten und Assets bleiben erhalten. Feedback wird erst durch deine Bestätigung erledigt.', 'Publishing adds new files to showroom/ in the project repository. Existing views and assets are preserved. Feedback is resolved only after your confirmation.') }}</p>
      </section>
    </template>
    <UModal v-model:open="categoryModal" :title="say('Neue Kategorie', 'New category')" :description="say('Legt einen Unterordner in showroom/ an.', 'Creates a subfolder in showroom/.')"><template #body><form class="sr-modal-form" @submit.prevent="addCategory"><label class="sr-field"><span>{{ say('Ordnername', 'Folder name') }}</span><input v-model="categoryName" required maxlength="100" placeholder="Startseite"></label><p v-if="error" role="alert" class="sr-error">{{ error }}</p><button type="submit" class="sr-button sr-primary" :disabled="busy">{{ say('Kategorie erstellen', 'Create category') }}</button></form></template></UModal>
    <UModal v-model:open="shareModal" :title="createdLink ? say('Dein Share-Link ist bereit', 'Your share link is ready') : say('Share-Link erstellen', 'Create share link')" :description="say('Zugriff ausschließlich auf den Showroom. Kein Projekt-Login nötig.', 'Access only to the showroom. No project login needed.')"><template #body>
      <div v-if="createdLink" class="sr-modal-form"><p>{{ say('Jetzt kopieren und sicher aufbewahren. Aus Sicherheitsgründen wird der geheime Link nur einmal angezeigt.', 'Copy and keep it safe now. For security, the secret link is displayed only once.') }}</p><label class="sr-field"><span>Share-Link</span><input :value="createdLink" readonly @focus="($event.target as HTMLInputElement).select()"></label><button class="sr-button sr-primary" @click="copyLink(createdLink)"><UIcon name="i-lucide-copy" />{{ say('Link kopieren', 'Copy link') }}</button><a :href="createdLink" target="_blank" rel="noreferrer" class="sr-button">{{ say('Als Gast öffnen', 'Open as guest') }} ↗</a><p v-if="notice" role="status" class="sr-success">{{ notice }}</p></div>
      <form v-else class="sr-modal-form" @submit.prevent="addShare"><label class="sr-field"><span>{{ say('Name der Freigabe', 'Share name') }}</span><input v-model="shareName" required maxlength="100" :placeholder="say('Zum Beispiel: Kundenteam · Runde 1', 'For example: Customer team · Round 1')"></label><label class="sr-field"><span>{{ say('Freigegebene Kategorien', 'Shared categories') }}</span><select v-model="shareCategory"><option value="">{{ say('Alle Kategorien', 'All categories') }}</option><option v-for="cat in library?.categories" :key="cat">{{ cat }}</option></select></label><label class="sr-field"><span>{{ say('Gültigkeit', 'Expiry') }}</span><select v-model="shareExpiry"><option value="7">7 {{ say('Tage', 'days') }}</option><option value="30">30 {{ say('Tage', 'days') }}</option><option value="90">90 {{ say('Tage', 'days') }}</option><option value="">{{ say('Kein Ablaufdatum', 'No expiry') }}</option></select></label><label class="sr-check"><input v-model="shareComments" type="checkbox">{{ say('Feedback erlauben', 'Allow feedback') }}</label><p class="sr-muted">{{ say('Neue Ansichten innerhalb der Freigabe sind automatisch über denselben Link sichtbar.', 'New views within the share scope are automatically visible through the same link.') }}</p><p v-if="error" role="alert" class="sr-error">{{ error }}</p><button type="submit" class="sr-button sr-primary" :disabled="busy">{{ say('Share-Link erstellen', 'Create share link') }}</button></form>
    </template></UModal>
    <UModal :open="!!revokeId" :title="say('Zugriff widerrufen?', 'Revoke access?')" :description="say('Dieser Link funktioniert danach nicht mehr. Gesammeltes Feedback bleibt erhalten.', 'This link will stop working. Collected feedback is retained.')" @update:open="value => { if (!value) revokeId = null; }"><template #footer><button class="sr-button" @click="revokeId = null">{{ say('Abbrechen', 'Cancel') }}</button><button class="sr-button sr-danger" :disabled="busy" @click="revoke">{{ say('Zugriff widerrufen', 'Revoke access') }}</button></template></UModal>
    <UModal v-model:open="iterationModal" :title="sourcePath ? say('Neue Iteration', 'New iteration') : say('Ansicht mit Agent erstellen', 'Create view with agent')" :description="say('Erstellt eine echte Kanban-Aufgabe mit Ansicht, Assets und Feedback.', 'Creates a real Kanban task with the view, assets and feedback.')"><template #body><form class="sr-modal-form" @submit.prevent="createIteration"><p v-if="sourcePath" class="sr-context"><code>{{ sourcePath }}</code> → {{ say('Neue Version', 'New version') }}<br>{{ selectedIds.length }} {{ say('ausgewählte Rückmeldungen', 'selected comments') }}</p><label class="sr-field"><span>{{ say('Neue Datei unter showroom/', 'New file under showroom/') }}</span><input v-model="targetPath" required maxlength="400" placeholder="Startseite/entwurf-v2.html"></label><label class="sr-field"><span>{{ say('Auftrag an den Agenten', 'Agent brief') }}</span><textarea v-model="brief" required rows="5" maxlength="20000" :placeholder="say('Beschreibe die gewünschte Ansicht und ihre Interaktionen …', 'Describe the desired view and interactions …')" /></label><label class="sr-field"><span>Agent</span><select v-model="harness"><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="prime-agent">Prime Agent</option></select></label><label class="sr-check"><input v-model="start" type="checkbox">{{ say('Agent direkt starten', 'Start agent immediately') }}</label><p class="sr-muted">{{ start ? say('Die Aufgabe wird in „Zu erledigen“ eingeplant und ausgeführt, sobald ein Agent-Platz frei ist.', 'The task is queued in To Do and starts when an agent slot is available.') : say('Die Aufgabe wird zur Prüfung im Backlog angelegt.', 'The task is created in Backlog for review.') }}</p><p v-if="error" class="sr-error" role="alert">{{ error }}</p><button type="submit" class="sr-button sr-primary" :disabled="busy">{{ busy ? say('Wird angelegt …', 'Creating …') : say('Agent-Aufgabe erstellen', 'Create agent task') }}</button></form></template></UModal>
    <ShowroomViewer v-if="selectedView && viewLibrary" :key="selectedView.path + viewLibrary.snapshotId" :initial-view="selectedView" :library="viewLibrary" :endpoint="endpoint" :guest="!!guestToken" :locale="locale" :focus-feedback="focusFeedback" @close="selectedView = null; refresh()" @saved="!guestToken && refresh(false)" />
  </div>
</template>
