<script setup lang="ts">
import type { ShowroomAnchor, ShowroomFeedback, ShowroomLibrary, ShowroomView } from '../shared/showroom';
const props = defineProps<{ library: ShowroomLibrary; initialView: ShowroomView; endpoint: string; locale: 'de' | 'en'; guest?: boolean; focusFeedback?: ShowroomFeedback | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const de = computed(() => props.locale === 'de');
const say = (german: string, english: string) => de.value ? german : english;
const current = ref(props.initialView);
const frame = ref<HTMLIFrameElement | null>(null);
const mode = ref<'interact' | 'element' | 'region'>('interact');
const panel = ref(Boolean(props.focusFeedback));
const width = ref('fit');
const anchor = ref<ShowroomAnchor | null>(null);
const body = ref('');
const name = ref('');
const needsName = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const loaded = ref(false);
const requestId = ref('');
const drafts = new Map<string, { body: string; anchor: ShowroomAnchor | null; requestId: string }>();
let loadTimeout: ReturnType<typeof setTimeout> | undefined;
const src = computed(() => '/showroom-preview/' + props.library.previewToken + '/' + props.initialView.path.split('/').map(encodeURIComponent).join('/'));
const post = (message: Record<string, unknown>) => frame.value?.contentWindow?.postMessage({ source: 'ak-showroom-host', ...message }, '*');
function selectMode(value: 'interact' | 'element' | 'region') {
  mode.value = value;
  anchor.value = null;
  if (value !== 'interact') panel.value = true;
  post({ type: 'mode', mode: value });
}
function wholePage() { selectMode('interact'); panel.value = true; anchor.value = null; }
function message(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || event.data?.source !== 'ak-showroom' || event.data?.snapshotId !== props.library.snapshotId) return;
  const view = props.library.views.find(item => item.path === event.data.viewPath);
  if (!view) return;
  if (event.data.type === 'ready') {
    loaded.value = true;
    clearTimeout(loadTimeout);
    if (current.value.path !== view.path) {
      drafts.set(current.value.path, { body: body.value, anchor: anchor.value, requestId: requestId.value });
      const draft = drafts.get(view.path);
      current.value = view; anchor.value = draft?.anchor ?? null; body.value = draft?.body ?? ''; requestId.value = draft?.requestId ?? ''; mode.value = 'interact';
    }
    post({ type: 'mode', mode: mode.value });
    if (props.focusFeedback?.viewPath === view.path && props.focusFeedback.anchor) post({ type: 'highlight', anchor: props.focusFeedback.anchor });
  }
  if (event.data.type === 'selected' && props.library.canComment && mode.value !== 'interact') {
    const candidate = event.data.anchor;
    if (!candidate || !['element', 'region'].includes(candidate.kind) || !candidate.rect || !candidate.viewport) return;
    anchor.value = candidate;
    panel.value = true;
    notice.value = '';
  }
  if (event.data.type === 'escape') selectMode('interact');
}
async function save() {
  if (!body.value.trim() || saving.value) return;
  if (props.guest && !name.value.trim()) { needsName.value = true; return; }
  saving.value = true; error.value = ''; notice.value = '';
  if (!requestId.value) requestId.value = crypto.randomUUID();
  try {
    await $fetch(props.endpoint + '/feedback', { method: 'POST', body: {
      previewToken: props.library.previewToken, viewPath: current.value.path, authorName: name.value.trim() || 'Team',
      body: body.value, anchor: anchor.value, requestId: requestId.value,
    } });
    if (props.guest) { try { localStorage.setItem('ak_showroom_guest_name', name.value.trim()); } catch {} }
    drafts.delete(current.value.path);
    body.value = ''; requestId.value = ''; anchor.value = null; needsName.value = false;
    selectMode('interact');
    notice.value = say('Danke! Dein Feedback wurde gespeichert.', 'Thank you! Your feedback has been saved.');
    emit('saved');
  } catch (e: any) {
    error.value = e?.statusCode === 404 ? say('Der Link ist abgelaufen oder wurde widerrufen. Dein Text bleibt hier erhalten.', 'This link expired or was revoked. Your draft is preserved here.')
      : say('Feedback konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Could not save feedback. Please try again.');
  } finally { saving.value = false; }
}
function close() {
  if ((body.value.trim() || [...drafts.values()].some(draft => draft.body.trim())) && !window.confirm(say('Ungesendetes Feedback verwerfen?', 'Discard unsent feedback?'))) return;
  emit('close');
}
onMounted(() => {
  window.addEventListener('message', message);
  try { name.value = localStorage.getItem('ak_showroom_guest_name') || ''; } catch {}
  loadTimeout = setTimeout(() => { if (!loaded.value) error.value = say('Vorschau nicht erreichbar. Bitte schließen und den Showroom aktualisieren.', 'Preview unavailable. Close and refresh the showroom.'); }, 15000);
});
onBeforeUnmount(() => { window.removeEventListener('message', message); clearTimeout(loadTimeout); });
</script>

<template>
  <UModal :open="true" fullscreen :title="current.title" :description="say('Interaktive Showroom-Vorschau mit Feedback', 'Interactive showroom preview with feedback')" :ui="{ content: 'sr-viewer-modal', body: 'p-0 sm:p-0', header: 'hidden', footer: 'hidden' }" @update:open="value => { if (!value) close(); }">
    <template #body>
      <div class="sr-viewer">
        <header class="sr-viewer-toolbar">
          <button class="sr-button" :aria-label="say('Zurück zum Showroom', 'Back to showroom')" @click="close"><UIcon name="i-lucide-arrow-left" /> <span class="sr-hide-small">Showroom</span></button>
          <div class="sr-viewer-title"><strong>{{ current.title }}</strong><span>{{ current.path }} · {{ current.hash.slice(0, 8) }}</span></div>
          <label class="sr-width-label"><span class="sr-only">{{ say('Vorschaugröße', 'Preview size') }}</span><select v-model="width" class="sr-select"><option value="fit">{{ say('An Fenster anpassen', 'Fit window') }}</option><option value="1280">Desktop · 1280</option><option value="768">Tablet · 768</option><option value="390">Mobile · 390</option></select></label>
          <button class="sr-button" :aria-label="say('Schließen', 'Close')" @click="close"><UIcon name="i-lucide-x" /></button>
        </header>
        <div v-if="library.canComment" class="sr-review-tools" role="group" :aria-label="say('Feedback-Werkzeuge', 'Feedback tools')">
          <button class="sr-button" :class="{ 'is-active': mode === 'interact' && !anchor }" :aria-pressed="mode === 'interact'" @click="selectMode('interact')"><UIcon name="i-lucide-mouse-pointer-2" />{{ say('Interagieren', 'Interact') }}</button>
          <button class="sr-button" @click="wholePage"><UIcon name="i-lucide-message-square" />{{ say('Ganze Ansicht', 'Whole view') }}</button>
          <button class="sr-button" :class="{ 'is-active': mode === 'element' }" :aria-pressed="mode === 'element'" @click="selectMode('element')"><UIcon name="i-lucide-scan" />{{ say('Element auswählen', 'Select element') }}</button>
          <button class="sr-button" :class="{ 'is-active': mode === 'region' }" :aria-pressed="mode === 'region'" @click="selectMode('region')"><UIcon name="i-lucide-square-dashed" />{{ say('Bereich markieren', 'Mark region') }}</button>
          <span class="sr-tool-hint">{{ mode === 'element' ? say('Klicke auf einen Button, eine Navigation oder einen Abschnitt.', 'Click a button, navigation or section.') : mode === 'region' ? say('Ziehe ein Rechteck über den gewünschten Bereich.', 'Drag a rectangle around the area.') : say('Der Prototyp ist anklickbar.', 'The prototype is interactive.') }}</span>
        </div>
        <div class="sr-viewer-body" :class="{ 'has-panel': panel }">
          <div class="sr-preview-stage">
            <iframe ref="frame" :src="src" :title="current.title" sandbox="allow-scripts" referrerpolicy="no-referrer" :style="{ width: width === 'fit' ? '100%' : width + 'px' }" @load="post({ type: 'ping' })" />
          </div>
          <aside v-if="panel" class="sr-feedback-panel">
            <div class="sr-row"><h2>Feedback</h2><button class="sr-button" :aria-label="say('Feedback ausblenden', 'Hide feedback')" @click="panel = false; selectMode('interact')"><UIcon name="i-lucide-panel-right-close" /></button></div>
            <div v-if="focusFeedback && focusFeedback.viewPath === current.path" class="sr-context">
              <span class="sr-muted">{{ focusFeedback.authorName }} · {{ focusFeedback.viewHash.slice(0, 8) }}</span>
              <p>{{ focusFeedback.body }}</p>
              <button v-if="focusFeedback.anchor" class="sr-button" @click="post({ type: 'highlight', anchor: focusFeedback.anchor })">{{ say('Markierung anzeigen', 'Show selection') }}</button>
            </div>
            <form v-if="library.canComment" class="sr-feedback-form" @submit.prevent="save">
              <div class="sr-context">
                <span class="sr-muted">{{ say('Bezug', 'Context') }}</span>
                <strong>{{ anchor ? anchor.kind === 'region' ? say('Markierter Bereich', 'Selected region') : '<' + anchor.tag + '>' : say('Gesamte Ansicht', 'Whole view') }}</strong>
                <p v-if="anchor?.text" class="sr-quote">{{ anchor.text }}</p>
                <code v-if="anchor?.selector">{{ anchor.selector }}</code>
                <button v-if="anchor?.kind === 'element'" type="button" class="sr-button" @click="post({ type: 'parent' })"><UIcon name="i-lucide-expand" />{{ say('Übergeordneten Bereich wählen', 'Select parent element') }}</button>
              </div>
              <label class="sr-field"><span>{{ say('Was möchtest du uns mitgeben?', 'What would you like to share?') }}</span><textarea v-model="body" rows="6" maxlength="10000" required :placeholder="say('Was passt gut? Was sollten wir ändern?', 'What works well? What should we change?')" /></label>
              <div v-if="guest && (needsName || name)" class="sr-name">
                <label class="sr-field"><span>{{ say('Dein Name', 'Your name') }}</span><input v-model="name" autocomplete="nickname" maxlength="80" :required="needsName" :placeholder="say('Zum Beispiel: Anna', 'For example: Anna')"></label>
                <p class="sr-muted">{{ say('Ein Name genügt. Kein Account, kein Login.', 'A name is all we need. No account, no login.') }}</p>
              </div>
              <p v-if="error" class="sr-error" role="alert">{{ error }}</p>
              <p v-if="notice" class="sr-success" role="status">{{ notice }}</p>
              <button class="sr-button sr-primary" :disabled="saving || !body.trim()" type="submit"><UIcon name="i-lucide-send" />{{ saving ? say('Wird gespeichert …', 'Saving …') : say('Feedback senden', 'Send feedback') }}</button>
              <p class="sr-muted">{{ say('Feedback wird intern beim Projektteam gesammelt. Andere Gäste sehen deine Rückmeldung nicht.', 'Feedback goes to the project team. Other guests cannot see your comments.') }}</p>
            </form>
          </aside>
        </div>
        <p v-if="error && !panel" class="sr-error sr-viewer-error" role="alert">{{ error }}</p>
      </div>
    </template>
  </UModal>
</template>
