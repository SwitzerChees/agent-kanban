<script setup lang="ts">
type Scene = 'empty' | 'library' | 'sharing' | 'external' | 'viewer' | 'inbox' | 'iteration';

const route = useRoute();
const router = useRouter();
const scenes: Array<{ id: Scene; label: string }> = [
  { id: 'empty', label: 'Ersteinrichtung' },
  { id: 'library', label: 'Bibliothek' },
  { id: 'sharing', label: 'Freigaben' },
  { id: 'external', label: 'Externer Link' },
  { id: 'viewer', label: 'Feedback geben' },
  { id: 'inbox', label: 'Feedback-Inbox' },
  { id: 'iteration', label: 'Iteration starten' },
];
const scene = computed<Scene>(() => {
  const requested = String(route.query.scene ?? 'library') as Scene;
  return scenes.some((item) => item.id === requested) ? requested : 'library';
});
const captureMode = computed(() => route.query.capture === '1');
const internalScene = computed(() => ['empty', 'library', 'sharing', 'inbox', 'iteration'].includes(scene.value));
const feedbackText = ref('Was passiert nach dem Klick? Vielleicht klarer sagen, dass ich verfügbare Reisen sehe.');
const feedbackSent = ref(false);
const shareRevoked = ref(false);

useHead({
  title: 'Showroom · Agent Kanban Konzept',
  htmlAttrs: { lang: 'de' },
});

function selectScene(nextScene: Scene) {
  void router.replace({ path: '/showroom-concept', query: { scene: nextScene } });
}

function submitFeedback() {
  feedbackSent.value = true;
}

</script>

<template>
  <div class="showroom-concept">
    <nav v-if="!captureMode" class="concept-switcher" aria-label="Konzeptansichten">
      <div class="concept-switcher-title">
        <span class="concept-dot" />
        Showroom-Flow
      </div>
      <button
        v-for="item in scenes"
        :key="item.id"
        type="button"
        :class="{ 'is-active': scene === item.id }"
        @click="selectScene(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <div v-if="internalScene" class="internal-shell" :class="{ 'with-concept-switcher': !captureMode }">
      <aside class="product-sidebar">
        <div class="brand-row">
          <img src="/agent-kanban-mark.svg" alt="" class="brand-mark">
          <div>
            <strong>Agent Kanban</strong>
            <span>Arbeit im Fluss</span>
          </div>
        </div>

        <button class="command-search" type="button">
          <UIcon name="i-lucide-search" />
          <span>Suchen oder Befehl</span>
          <kbd>⌘ K</kbd>
        </button>

        <section class="sidebar-section">
          <div class="sidebar-heading"><span>Arbeitsbereich</span><span>3</span></div>
          <button class="project-item" type="button">
            <span class="project-key">AK</span>
            <span><strong>Agent Kanban</strong><small>AGENTKANBAN</small></span>
          </button>
          <button class="project-item is-active" type="button">
            <span class="project-key">NO</span>
            <span><strong>Northland</strong><small>NORTH</small></span>
            <UIcon name="i-lucide-chevron-right" />
          </button>
          <button class="project-item" type="button">
            <span class="project-key">PH</span>
            <span><strong>People Hub</strong><small>PEOPLE</small></span>
          </button>
        </section>

        <div class="sidebar-user">
          <span class="avatar">LM</span>
          <span><strong>Lea Meier</strong><small>lea@studio.ch</small></span>
          <UIcon name="i-lucide-chevrons-up-down" />
        </div>
      </aside>

      <main class="product-main">
        <header class="project-toolbar">
          <div class="project-title">
            <span class="project-badge">NO</span>
            <div><strong>Northland</strong><small>NORTH</small></div>
          </div>

          <nav class="surface-switch" aria-label="Projektbereiche">
            <button type="button"><UIcon name="i-lucide-columns-3" />Board</button>
            <button type="button"><UIcon name="i-lucide-notebook-tabs" />Wiki</button>
            <button type="button"><UIcon name="i-lucide-flask-conical" />E2E</button>
            <button class="is-active" type="button"><UIcon name="i-lucide-gallery-horizontal-end" />Showroom</button>
          </nav>

          <div class="toolbar-actions">
            <button type="button" aria-label="Aktualisieren"><UIcon name="i-lucide-refresh-cw" /></button>
            <button type="button" aria-label="Mehr"><UIcon name="i-lucide-ellipsis" /></button>
          </div>
        </header>

        <section class="showroom-header">
          <div>
            <div class="title-line">
              <h1>Showroom</h1>
              <span class="repo-sync"><span /> synchron mit Git</span>
            </div>
            <p>Interaktive HTML-Prototypen prüfen, teilen und gemeinsam verfeinern.</p>
          </div>
          <div class="header-actions">
            <button class="button-secondary" type="button" @click="selectScene('sharing')">
              <UIcon name="i-lucide-link-2" /> Freigaben
            </button>
            <button class="button-primary" type="button">
              <UIcon name="i-lucide-sparkles" /> Mit Agent erstellen
            </button>
          </div>
        </section>

        <nav class="showroom-tabs" aria-label="Showroom Navigation">
          <button :class="{ 'is-active': scene === 'empty' || scene === 'library' }" type="button" @click="selectScene('library')">
            Ansichten <span v-if="scene !== 'empty'">6</span>
          </button>
          <button :class="{ 'is-active': scene === 'inbox' || scene === 'iteration' }" type="button" @click="selectScene('inbox')">
            Feedback <span class="attention-count">12</span>
          </button>
          <button :class="{ 'is-active': scene === 'sharing' }" type="button" @click="selectScene('sharing')">
            Freigaben <span>2</span>
          </button>
        </nav>

        <div v-if="scene === 'empty'" class="internal-content empty-layout">
          <div class="empty-main">
            <div class="folder-illustration" aria-hidden="true">
              <div class="folder-back"><span>showroom/</span></div>
              <div class="folder-front">
                <div class="file-sheet"><span /><span /><span /></div>
                <div class="cursor-spark">✦</div>
              </div>
            </div>
            <h2>Dein Showroom beginnt im Repository.</h2>
            <p>
              Agent Kanban liest HTML-Dateien direkt aus <code>showroom/</code>. Unterordner werden zu Kategorien,
              jede HTML-Datei zu einer interaktiven Ansicht.
            </p>
            <div class="empty-actions">
              <button class="button-primary" type="button" @click="selectScene('library')">
                <UIcon name="i-lucide-sparkles" /> Erste Ansicht mit Agent erstellen
              </button>
              <button class="button-secondary" type="button">
                <UIcon name="i-lucide-folder-open" /> Ordner öffnen
              </button>
            </div>
            <div class="folder-contract">
              <span class="folder-contract-icon"><UIcon name="i-lucide-git-branch" /></span>
              <div><strong>Automatisch angelegt</strong><small>Der Ordner wird bei neuen Projekten im Repository-Root erstellt.</small></div>
              <code>northland/showroom/</code>
              <span class="status-pill success"><UIcon name="i-lucide-check" /> bereit</span>
            </div>
          </div>

          <aside class="empty-aside">
            <h3>So wird daraus ein Showroom</h3>
            <ol>
              <li><span>1</span><div><strong>Kategorie anlegen</strong><small>Zum Beispiel <code>startseite/</code></small></div></li>
              <li><span>2</span><div><strong>HTML generieren</strong><small>Agenten schreiben eigenständige Prototypen.</small></div></li>
              <li><span>3</span><div><strong>Link freigeben</strong><small>Kunden sehen nur freigegebene Ansichten.</small></div></li>
              <li><span>4</span><div><strong>Feedback iterieren</strong><small>Aus Kommentaren entsteht die nächste Version.</small></div></li>
            </ol>
          </aside>
        </div>

        <div v-else-if="scene === 'library'" class="internal-content library-layout">
          <aside class="category-tree">
            <div class="category-tree-heading">
              <strong>Kategorien</strong>
              <button type="button" aria-label="Kategorie hinzufügen"><UIcon name="i-lucide-folder-plus" /></button>
            </div>
            <button class="tree-row is-active" type="button">
              <UIcon name="i-lucide-layout-grid" /><span>Alle Ansichten</span><small>6</small>
            </button>
            <button class="tree-row" type="button">
              <UIcon name="i-lucide-folder" /><span>Startseite</span><small>3</small>
            </button>
            <button class="tree-row" type="button">
              <UIcon name="i-lucide-folder" /><span>Onboarding</span><small>2</small>
            </button>
            <button class="tree-row" type="button">
              <UIcon name="i-lucide-folder" /><span>Buchung</span><small>1</small>
            </button>
            <div class="tree-divider" />
            <div class="repo-location">
              <UIcon name="i-lucide-git-branch" />
              <div><span>Quelle</span><code>/showroom</code></div>
              <button type="button" aria-label="Pfad kopieren"><UIcon name="i-lucide-copy" /></button>
            </div>
          </aside>

          <div class="library-main">
            <div class="library-toolbar">
              <div class="search-field"><UIcon name="i-lucide-search" /><span>Ansichten durchsuchen …</span></div>
              <button class="filter-button" type="button"><UIcon name="i-lucide-arrow-down-up" /> Zuletzt geändert</button>
              <button class="filter-button icon-only" type="button" aria-label="Rasteransicht"><UIcon name="i-lucide-grid-2x2" /></button>
            </div>

            <section class="category-section">
              <div class="category-title-row">
                <div><UIcon name="i-lucide-folder-open" /><h2>Startseite</h2><span>3 Ansichten</span></div>
                <button type="button">Im Repository öffnen <UIcon name="i-lucide-arrow-up-right" /></button>
              </div>
              <div class="mockup-grid">
                <article class="mockup-card is-featured" @click="selectScene('inbox')">
                  <div class="mockup-thumb live-thumb">
                    <div class="live-thumb-scale"><ShowroomPrototype compact inert aria-hidden="true" /></div>
                    <span class="version-chip">v3 · aktuell</span>
                    <button type="button" class="thumb-open" aria-label="Ansicht öffnen"><UIcon name="i-lucide-maximize-2" /></button>
                  </div>
                  <div class="mockup-meta">
                    <div><strong>Landingpage – Storytelling</strong><code>startseite/story-v3.html</code></div>
                    <div class="meta-signals">
                      <span><UIcon name="i-lucide-message-square" /> 7</span>
                      <span class="new-feedback">3 neu</span>
                    </div>
                  </div>
                </article>

                <article class="mockup-card">
                  <div class="mockup-thumb alternate-thumb">
                    <div class="alt-nav"><span>NORTHLAND</span><span>Menu</span></div>
                    <div class="alt-copy"><small>THE QUIET NORTH</small><strong>Room for<br>the horizon.</strong><span>View cabins →</span></div>
                    <div class="alt-orb" />
                    <span class="version-chip neutral">v2</span>
                  </div>
                  <div class="mockup-meta">
                    <div><strong>Landingpage – Minimal</strong><code>startseite/minimal-v2.html</code></div>
                    <div class="meta-signals"><span><UIcon name="i-lucide-message-square" /> 2</span></div>
                  </div>
                </article>

                <article class="mockup-card">
                  <div class="mockup-thumb editorial-thumb">
                    <div class="editorial-number" aria-hidden="true">62°</div>
                    <div class="editorial-copy"><span>SENJA / NORWAY</span><strong>Further<br>north.</strong></div>
                    <span class="version-chip neutral">v1</span>
                  </div>
                  <div class="mockup-meta">
                    <div><strong>Landingpage – Editorial</strong><code>startseite/editorial-v1.html</code></div>
                    <div class="meta-signals"><span><UIcon name="i-lucide-message-square" /> 0</span></div>
                  </div>
                </article>
              </div>
            </section>

            <section class="category-section compact-category">
              <div class="category-title-row">
                <div><UIcon name="i-lucide-folder" /><h2>Onboarding</h2><span>2 Ansichten</span></div>
                <button type="button">Kategorie anzeigen <UIcon name="i-lucide-chevron-right" /></button>
              </div>
              <div class="compact-files">
                <div><span class="file-preview coral"><UIcon name="i-lucide-log-in" /></span><strong>Willkommen</strong><code>onboarding/willkommen.html</code><small>v2</small></div>
                <div><span class="file-preview navy"><UIcon name="i-lucide-map" /></span><strong>Reise wählen</strong><code>onboarding/reise-waehlen.html</code><small>v1</small></div>
                <button type="button"><UIcon name="i-lucide-plus" /> Ansicht hinzufügen</button>
              </div>
            </section>
          </div>
        </div>

        <div v-else-if="scene === 'sharing'" class="internal-content sharing-layout">
          <section class="sharing-main">
            <div class="section-heading-action">
              <div><h2>Externe Freigaben</h2><p>Jeder Link öffnet ausschließlich den Showroom. Kanban, Wiki und E2E bleiben privat.</p></div>
              <button class="button-primary" type="button"><UIcon name="i-lucide-link-2" /> Freigabe erstellen</button>
            </div>

            <div class="security-note">
              <span><UIcon name="i-lucide-shield-check" /></span>
              <div><strong>Isolierter Lesezugriff</strong><p>Freigaben verwenden ein widerrufbares, zufälliges Token. Externe Gäste erhalten keinen Projekt- oder Repository-Zugriff.</p></div>
            </div>

            <div class="share-list">
              <article class="share-row">
                <span class="share-avatar">HK</span>
                <div class="share-details">
                  <div><strong>Review mit Hotel Krone</strong><span class="status-pill success"><span /> Aktiv</span></div>
                  <p>Alle Ansichten · Feedback erlaubt · gültig bis 30. September</p>
                  <code>kanban.studio/s/north-7hJ4kP…</code>
                </div>
                <div class="share-stats"><strong>4</strong><small>Besuche</small></div>
                <button class="share-copy" type="button"><UIcon name="i-lucide-copy" /> Link kopieren</button>
                <button class="more-button" type="button" aria-label="Mehr"><UIcon name="i-lucide-ellipsis-vertical" /></button>
              </article>

              <article v-if="!shareRevoked" class="share-row">
                <span class="share-avatar muted">IN</span>
                <div class="share-details">
                  <div><strong>Interner Entscheidungs-Workshop</strong><span class="status-pill success"><span /> Aktiv</span></div>
                  <p>Nur Startseite · Feedback erlaubt · läuft in 6 Tagen ab</p>
                  <code>kanban.studio/s/north-P2mQ8a…</code>
                </div>
                <div class="share-stats"><strong>11</strong><small>Besuche</small></div>
                <button class="share-copy danger-hover" type="button" @click="shareRevoked = true"><UIcon name="i-lucide-link-2-off" /> Widerrufen</button>
                <button class="more-button" type="button" aria-label="Mehr"><UIcon name="i-lucide-ellipsis-vertical" /></button>
              </article>
              <div v-else class="revoked-row"><UIcon name="i-lucide-check-circle-2" /> Freigabe widerrufen. Der Link ist ab sofort nicht mehr erreichbar.</div>
            </div>
          </section>

          <aside class="share-settings">
            <div class="settings-heading"><span><UIcon name="i-lucide-link-2" /></span><div><strong>Neue Freigabe</strong><small>Zugriff gezielt eingrenzen</small></div></div>
            <label><span>Name</span><input value="Kundenreview September"></label>
            <label><span>Sichtbare Kategorien</span><button type="button" class="select-control">Alle Kategorien <UIcon name="i-lucide-chevron-down" /></button></label>
            <div class="toggle-row"><div><strong>Feedback erlauben</strong><small>Gäste können Seiten und Elemente kommentieren.</small></div><button class="toggle is-on" type="button"><span /></button></div>
            <label><span>Ablaufdatum</span><button type="button" class="select-control">30 Tage <UIcon name="i-lucide-calendar" /></button></label>
            <div class="settings-footer">
              <button class="button-secondary" type="button">Abbrechen</button>
              <button class="button-primary" type="button" @click="selectScene('external')">Link erstellen</button>
            </div>
          </aside>
        </div>

        <div v-else-if="scene === 'inbox'" class="internal-content inbox-layout">
          <aside class="feedback-filters">
            <strong>Feedback</strong>
            <button class="is-active" type="button"><span><UIcon name="i-lucide-inbox" /> Offen</span><small>12</small></button>
            <button type="button"><span><UIcon name="i-lucide-circle-dot" /> In Arbeit</span><small>3</small></button>
            <button type="button"><span><UIcon name="i-lucide-check-circle-2" /> Erledigt</span><small>18</small></button>
            <div class="tree-divider" />
            <span class="filter-label">Ansichten</span>
            <button type="button"><span><UIcon name="i-lucide-file-code-2" /> Landingpage – Storytelling</span><small>7</small></button>
            <button type="button"><span><UIcon name="i-lucide-file-code-2" /> Landingpage – Minimal</span><small>2</small></button>
            <button type="button"><span><UIcon name="i-lucide-file-code-2" /> Willkommen</span><small>3</small></button>
          </aside>

          <section class="feedback-list-panel">
            <div class="feedback-list-heading">
              <div><h2>Offenes Feedback</h2><p>12 Rückmeldungen aus 3 Ansichten</p></div>
              <button class="filter-button icon-only" type="button"><UIcon name="i-lucide-list-filter" /></button>
            </div>
            <div class="feedback-list">
              <button class="feedback-row is-selected" type="button">
                <span class="feedback-checkbox checked"><UIcon name="i-lucide-check" /></span>
                <span class="pin-number">3</span>
                <span class="feedback-row-body"><strong>CTA ist zu wenig konkret</strong><small>Anna Keller · Landingpage – Storytelling</small><p>„Was passiert nach dem Klick? Vielleicht klarer sagen, dass ich verfügbare Reisen sehe.“</p></span>
                <span class="feedback-time">vor 2 Std.</span>
              </button>
              <button class="feedback-row is-selected" type="button">
                <span class="feedback-checkbox checked"><UIcon name="i-lucide-check" /></span>
                <span class="pin-number">1</span>
                <span class="feedback-row-body"><strong>Navigation: «Cabins» übersetzen</strong><small>Marco Frei · Landingpage – Storytelling</small><p>Die restliche Kundenkommunikation ist auf Deutsch.</p></span>
                <span class="feedback-time">gestern</span>
              </button>
              <button class="feedback-row is-selected" type="button">
                <span class="feedback-checkbox checked"><UIcon name="i-lucide-check" /></span>
                <span class="feedback-row-body"><strong>Gesamtfeedback</strong><small>Anna Keller · Landingpage – Storytelling</small><p>Variante 3 ist klar unser Favorit. Der ruhige Einstieg passt gut zur Marke.</p></span>
                <span class="feedback-time">gestern</span>
              </button>
              <button class="feedback-row" type="button">
                <span class="feedback-checkbox" />
                <span class="pin-number">2</span>
                <span class="feedback-row-body"><strong>Kontrast im Bildbereich</strong><small>Sophie Roth · Landingpage – Minimal</small><p>Die kleine Beschriftung ist auf meinem Laptop schwer zu lesen.</p></span>
                <span class="feedback-time">Mo</span>
              </button>
            </div>
            <div class="selection-actionbar">
              <span><strong>3</strong> Rückmeldungen ausgewählt</span>
              <button class="button-secondary" type="button">Als erledigt markieren</button>
              <button class="button-primary" type="button" @click="selectScene('iteration')"><UIcon name="i-lucide-sparkles" /> Neue Iteration</button>
            </div>
          </section>

          <aside class="feedback-preview">
            <div class="feedback-preview-head">
              <div><strong>Landingpage – Storytelling</strong><code>v3 · startseite/story-v3.html</code></div>
              <button type="button"><UIcon name="i-lucide-maximize-2" /></button>
            </div>
            <div class="mini-page-preview">
              <div class="mini-preview-scale"><ShowroomPrototype compact highlighted inert aria-hidden="true" /></div>
            </div>
            <div class="selected-comment">
              <div><span class="comment-avatar">AK</span><div><strong>Anna Keller</strong><small>vor 2 Stunden</small></div><span class="pin-number">3</span></div>
              <p>Was passiert nach dem Klick? Vielleicht klarer sagen, dass ich verfügbare Reisen sehe.</p>
              <div class="element-reference"><UIcon name="i-lucide-mouse-pointer-2" /><div><span>Ausgewähltes Element</span><code>button.prototype-primary</code></div></div>
            </div>
          </aside>
        </div>

        <div v-else-if="scene === 'iteration'" class="internal-content iteration-layout">
          <section class="iteration-context">
            <div class="iteration-breadcrumb"><button type="button" @click="selectScene('inbox')"><UIcon name="i-lucide-arrow-left" /> Feedback</button><span>/</span><span>Neue Iteration</span></div>
            <div class="iteration-title"><span><UIcon name="i-lucide-sparkles" /></span><div><h2>Feedback in die nächste Version übersetzen</h2><p>Der Agent erhält die ausgewählten Rückmeldungen zusammen mit der aktuellen HTML-Datei und dem visuellen Kontext.</p></div></div>

            <div class="version-flow">
              <div class="version-node current"><span>Aktuell</span><strong>v3</strong><small>story-v3.html</small></div>
              <div class="version-arrow"><span>3 Feedbacks</span><UIcon name="i-lucide-arrow-right" /></div>
              <div class="version-node next"><span>Nächste Version</span><strong>v4</strong><small>story-v4.html</small></div>
            </div>

            <div class="iteration-feedbacks">
              <div class="iteration-section-title"><strong>Enthaltenes Feedback</strong><span>3 Rückmeldungen</span></div>
              <label><input type="checkbox" checked><span class="pin-number">3</span><div><strong>CTA ist zu wenig konkret</strong><p>„Klarer sagen, dass ich verfügbare Reisen sehe.“</p></div><UIcon name="i-lucide-grip-vertical" /></label>
              <label><input type="checkbox" checked><span class="pin-number">1</span><div><strong>Navigation: «Cabins» übersetzen</strong><p>Terminologie an die deutsche Kundenkommunikation angleichen.</p></div><UIcon name="i-lucide-grip-vertical" /></label>
              <label><input type="checkbox" checked><span class="global-comment-icon"><UIcon name="i-lucide-message-square" /></span><div><strong>Gesamtfeedback beibehalten</strong><p>Variante 3 und der ruhige Einstieg bleiben die gestalterische Leitlinie.</p></div><UIcon name="i-lucide-grip-vertical" /></label>
            </div>
          </section>

          <aside class="iteration-config">
            <div class="config-title"><strong>Iteration konfigurieren</strong><span class="status-pill"><UIcon name="i-lucide-bot" /> Codex</span></div>
            <label><span>Zielansicht</span><button class="select-control" type="button">Landingpage – Storytelling <UIcon name="i-lucide-chevron-down" /></button></label>
            <label><span>Neue Datei</span><div class="file-name-control"><code>startseite/story-v4.html</code><UIcon name="i-lucide-check" /></div></label>
            <label><span>Zusätzliche Anweisung</span><textarea>Erhalte die ruhige, editoriale Wirkung. Ändere nur die von den Reviewern angesprochenen Bereiche und dokumentiere jede Änderung.</textarea></label>
            <div class="iteration-options">
              <label><input type="checkbox" checked><span><strong>Neue Datei anlegen</strong><small>v3 bleibt als Vergleich erhalten.</small></span></label>
              <label><input type="checkbox" checked><span><strong>Feedback automatisch verknüpfen</strong><small>Kommentare werden nach Abschluss als «In Arbeit» markiert.</small></span></label>
            </div>
            <div class="task-link-preview"><UIcon name="i-lucide-square-kanban" /><div><span>Erzeugt eine Kanban-Aufgabe</span><strong>NORTH-42 · Showroom-Iteration v4</strong></div></div>
            <div class="settings-footer">
              <button class="button-secondary" type="button" @click="selectScene('inbox')">Abbrechen</button>
              <button class="button-primary" type="button"><UIcon name="i-lucide-play" /> Agent starten</button>
            </div>
          </aside>
        </div>
      </main>
    </div>

    <main v-else-if="scene === 'external'" class="external-gallery" :class="{ 'with-concept-switcher': !captureMode }">
      <header class="external-header">
        <div class="external-brand"><span class="external-brand-mark">N</span><div><strong>Northland</strong><small>Design Review · September 2026</small></div></div>
        <div class="external-reviewer"><span><UIcon name="i-lucide-lock-keyhole" /> Privater Showroom</span><div class="reviewer-avatar">AK</div></div>
      </header>

      <section class="external-intro">
        <div><span class="external-kicker">WILLKOMMEN, ANNA</span><h1>Welche Richtung fühlt sich nach Northland an?</h1></div>
        <div><p>Öffne die Entwürfe, klicke dich durch und hinterlasse dein Feedback direkt auf der Ansicht. Es gibt kein richtig oder falsch.</p><span><UIcon name="i-lucide-clock-3" /> Link gültig bis 30. September 2026</span></div>
      </section>

      <section class="external-category">
        <div class="external-category-title"><h2>Startseite</h2><p>Drei visuelle Richtungen für den neuen Markenauftritt.</p></div>
        <div class="external-cards">
          <article class="external-card featured" role="button" tabindex="0" @click="selectScene('viewer')" @keydown.enter.prevent="selectScene('viewer')" @keydown.space.prevent="selectScene('viewer')">
            <div class="external-thumb live-thumb"><div class="live-thumb-scale"><ShowroomPrototype compact inert aria-hidden="true" /></div><span class="recommended-badge"><UIcon name="i-lucide-sparkles" /> Empfehlung</span><span class="external-comment-count"><UIcon name="i-lucide-message-square" /> 7</span></div>
            <div><span><strong>Storytelling</strong><small>Variante 3 · Desktop & Mobile</small></span><UIcon name="i-lucide-arrow-up-right" /></div>
          </article>
          <article class="external-card" role="button" tabindex="0">
            <div class="external-thumb alternate-thumb"><div class="alt-nav"><span>NORTHLAND</span><span>Menu</span></div><div class="alt-copy"><small>THE QUIET NORTH</small><strong>Room for<br>the horizon.</strong><span>View cabins →</span></div><div class="alt-orb" /><span class="external-comment-count"><UIcon name="i-lucide-message-square" /> 2</span></div>
            <div><span><strong>Minimal</strong><small>Variante 2 · Desktop</small></span><UIcon name="i-lucide-arrow-up-right" /></div>
          </article>
          <article class="external-card" role="button" tabindex="0">
            <div class="external-thumb editorial-thumb"><div class="editorial-number" aria-hidden="true">62°</div><div class="editorial-copy"><span>SENJA / NORWAY</span><strong>Further<br>north.</strong></div><span class="external-comment-count"><UIcon name="i-lucide-message-square" /> 0</span></div>
            <div><span><strong>Editorial</strong><small>Variante 1 · Desktop</small></span><UIcon name="i-lucide-arrow-up-right" /></div>
          </article>
        </div>
      </section>

      <section class="external-category compact-external-category">
        <div class="external-category-title"><h2>Onboarding</h2><p>Der Einstieg nach der Reisebuchung.</p></div>
        <div class="external-file-row"><button type="button"><span class="file-preview coral"><UIcon name="i-lucide-log-in" /></span><span><strong>Willkommen</strong><small>2 Bildschirmgrössen</small></span><UIcon name="i-lucide-arrow-right" /></button><button type="button"><span class="file-preview navy"><UIcon name="i-lucide-map" /></span><span><strong>Reise wählen</strong><small>Desktop</small></span><UIcon name="i-lucide-arrow-right" /></button></div>
      </section>

      <footer class="external-footer"><span>Bereitgestellt mit <strong>Agent Kanban</strong></span><a href="#" @click.prevent>Datenschutz</a></footer>
    </main>

    <main v-else class="external-viewer" :class="{ 'with-concept-switcher': !captureMode }">
      <header class="viewer-toolbar">
        <button class="viewer-back" type="button" @click="selectScene('external')"><UIcon name="i-lucide-arrow-left" /><span>Alle Ansichten</span></button>
        <div class="viewer-title"><strong>Landingpage – Storytelling</strong><span>Variante 3</span></div>
        <div class="viewer-tools">
          <div class="viewport-switch"><button class="is-active" type="button" aria-label="Desktop"><UIcon name="i-lucide-monitor" /></button><button type="button" aria-label="Tablet"><UIcon name="i-lucide-tablet" /></button><button type="button" aria-label="Mobil"><UIcon name="i-lucide-smartphone" /></button></div>
          <button type="button" aria-label="Prototyp neu laden"><UIcon name="i-lucide-refresh-cw" /></button>
          <button type="button" aria-label="Vollbild öffnen"><UIcon name="i-lucide-maximize-2" /></button>
        </div>
      </header>

      <div class="viewer-body">
        <section class="prototype-canvas">
          <div class="prototype-browser">
            <div class="browser-chrome"><span /><span /><span /><div>northland.local/startseite</div></div>
            <ShowroomPrototype highlighted />
          </div>
          <div class="canvas-help"><UIcon name="i-lucide-mouse-pointer-2" /><span>Klicke auf ein Element, um es gezielt zu kommentieren.</span><kbd>Esc</kbd></div>
        </section>

        <aside class="review-panel">
          <div class="review-panel-header">
            <div><strong>Feedback</strong><span>7 Rückmeldungen</span></div>
            <button type="button" aria-label="Panel schliessen"><UIcon name="i-lucide-panel-right-close" /></button>
          </div>

          <div class="review-mode-switch">
            <button type="button"><UIcon name="i-lucide-message-square" /> Ganze Ansicht</button>
            <button class="is-active" type="button"><UIcon name="i-lucide-mouse-pointer-2" /> Element</button>
          </div>

          <div v-if="!feedbackSent" class="review-composer">
            <div class="element-selection">
              <div class="selection-preview"><span>Explore journeys</span></div>
              <div><span>Ausgewähltes Element</span><strong>Primärer Button</strong><code>button.prototype-primary</code></div>
              <button type="button" aria-label="Auswahl entfernen"><UIcon name="i-lucide-x" /></button>
            </div>
            <label>
              <span>Dein Feedback</span>
              <textarea v-model="feedbackText" placeholder="Was funktioniert gut – und was sollte sich ändern?" />
            </label>
            <div class="composer-identity"><span class="comment-avatar">AK</span><div><strong>Anna Keller</strong><small>Wird mit deinem Namen gesendet</small></div></div>
            <button class="submit-feedback" type="button" @click="submitFeedback"><UIcon name="i-lucide-send" /> Feedback senden</button>
          </div>

          <div v-else class="feedback-success">
            <span><UIcon name="i-lucide-check" /></span>
            <h2>Feedback gesendet</h2>
            <p>Dein Kommentar ist jetzt an diesem Button verankert.</p>
            <button type="button" @click="feedbackSent = false">Weiteres Feedback geben</button>
          </div>

          <div class="review-thread">
            <div class="thread-heading"><strong>Auf dieser Ansicht</strong><button type="button">Neueste zuerst <UIcon name="i-lucide-chevron-down" /></button></div>
            <article><span class="comment-avatar blue">MF</span><div><p>Die Bildwelt und Ruhe funktionieren sehr gut. Genau diese Richtung weiterverfolgen.</p><small>Marco · Gesamtfeedback · gestern</small></div></article>
            <article><span class="comment-pin">1</span><div><p>«Cabins» noch ins Deutsche übersetzen.</p><small>Marco · Navigation · gestern</small></div></article>
          </div>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
:global(body) {
  background: #f4f4f5;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:global(*) { box-sizing: border-box; }
:global(button), :global(input), :global(textarea) { font: inherit; }

.showroom-concept { min-height: 100dvh; background: #f4f4f5; }
button { cursor: pointer; }
.concept-switcher {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 100;
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  overflow-x: auto;
  background: #18181b;
  color: #d4d4d8;
  box-shadow: 0 2px 5px rgb(0 0 0 / 22%);
}
.concept-switcher-title { display: flex; align-items: center; gap: 8px; margin-right: 12px; color: white; font-size: 12px; font-weight: 700; white-space: nowrap; }
.concept-dot { width: 8px; height: 8px; border-radius: 50%; background: #2dd4bf; box-shadow: 0 0 0 3px rgb(45 212 191 / 16%); }
.concept-switcher button { min-height: 32px; padding: 0 11px; border: 0; border-radius: 6px; background: transparent; color: #a1a1aa; font-size: 11px; font-weight: 650; white-space: nowrap; }
.concept-switcher button:hover { background: #27272a; color: white; }
.concept-switcher button.is-active { background: #0f766e; color: white; }
.with-concept-switcher { padding-top: 48px; }

.internal-shell { display: grid; min-height: 100dvh; grid-template-columns: 252px minmax(0, 1fr); background: #fafafa; }
.product-sidebar { position: sticky; top: 0; display: flex; height: 100dvh; flex-direction: column; padding: 16px 12px 12px; border-right: 1px solid #e4e4e7; background: white; }
.with-concept-switcher .product-sidebar { top: 48px; height: calc(100dvh - 48px); }
.brand-row { display: flex; align-items: center; gap: 11px; min-height: 50px; padding: 0 6px; }
.brand-mark { width: 38px; height: 38px; }
.brand-row div, .project-title div, .sidebar-user > span:nth-child(2) { min-width: 0; }
.brand-row strong, .brand-row span, .project-title strong, .project-title small, .sidebar-user strong, .sidebar-user small { display: block; }
.brand-row strong { font-size: 13px; letter-spacing: -0.01em; }
.brand-row span, .project-title small, .sidebar-user small { margin-top: 2px; color: #71717a; font-size: 10px; }
.command-search { display: flex; height: 38px; align-items: center; gap: 9px; margin: 14px 0 18px; padding: 0 10px; border: 1px solid #e4e4e7; border-radius: 10px; background: #fafafa; color: #52525b; font-size: 12px; }
.command-search svg { width: 15px; }
.command-search span { flex: 1; text-align: left; }
.command-search kbd { padding: 2px 5px; border: 1px solid #d4d4d8; border-radius: 4px; background: white; color: #71717a; font-size: 9px; }
.sidebar-section { flex: 1; }
.sidebar-heading { display: flex; justify-content: space-between; padding: 0 8px 8px; color: #71717a; font-size: 10px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
.project-item { display: flex; width: 100%; min-height: 48px; align-items: center; gap: 10px; padding: 5px 7px; border: 0; border-radius: 10px; background: transparent; color: #52525b; text-align: left; }
.project-item:hover { background: #f4f4f5; }
.project-item.is-active { background: #f0fdfa; color: #134e4a; box-shadow: inset 0 0 0 1px #ccfbf1; }
.project-key { display: grid; width: 34px; height: 34px; flex: none; place-items: center; border: 1px solid #e4e4e7; border-radius: 8px; background: white; color: #71717a; font-size: 9px; font-weight: 800; }
.project-item.is-active .project-key { border-color: #99f6e4; color: #0f766e; }
.project-item > span:nth-child(2) { min-width: 0; flex: 1; }
.project-item strong, .project-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-item strong { font-size: 12px; font-weight: 650; }
.project-item small { margin-top: 2px; color: #71717a; font-size: 9px; }
.project-item svg { width: 14px; color: #0f766e; }
.sidebar-user { display: flex; min-height: 52px; align-items: center; gap: 9px; padding: 8px; border-top: 1px solid #e4e4e7; background: #fafafa; }
.avatar, .reviewer-avatar { display: grid; width: 32px; height: 32px; flex: none; place-items: center; border-radius: 8px; background: #27272a; color: white; font-size: 9px; font-weight: 800; }
.sidebar-user strong { font-size: 11px; }
.sidebar-user svg { margin-left: auto; width: 14px; color: #a1a1aa; }

.product-main { min-width: 0; min-height: 100dvh; overflow: hidden; background: #fafafa; }
.project-toolbar { display: flex; min-height: 62px; align-items: center; gap: 20px; padding: 9px 22px; border-bottom: 1px solid #e4e4e7; background: rgb(255 255 255 / 96%); }
.project-title { display: flex; min-width: 180px; align-items: center; gap: 9px; }
.project-badge { display: grid; width: 34px; height: 30px; place-items: center; border: 1px solid #d4d4d8; border-radius: 7px; color: #52525b; font-size: 9px; font-weight: 800; }
.project-title strong { font-size: 13px; }
.surface-switch { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 9px; background: #f4f4f5; box-shadow: inset 0 0 0 1px #e4e4e7; }
.surface-switch button { display: flex; min-height: 30px; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: #65656e; font-size: 11px; font-weight: 650; }
.surface-switch button svg { width: 14px; }
.surface-switch button.is-active { background: white; color: #0f766e; box-shadow: 0 1px 3px rgb(24 24 27 / 14%); }
.toolbar-actions { display: flex; gap: 3px; margin-left: auto; }
.toolbar-actions button, .category-tree-heading button, .more-button, .feedback-preview-head button, .review-panel-header button, .viewer-tools > button { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: #71717a; }
.toolbar-actions button:hover, .category-tree-heading button:hover { background: #f4f4f5; color: #18181b; }

.showroom-header { display: flex; min-height: 96px; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 26px 14px; background: white; }
.title-line { display: flex; align-items: center; gap: 12px; }
.showroom-header h1 { margin: 0; font-size: 21px; font-weight: 730; letter-spacing: -0.025em; }
.showroom-header p { margin: 5px 0 0; color: #71717a; font-size: 12px; }
.repo-sync { display: inline-flex; align-items: center; gap: 6px; color: #3f3f46; font-size: 10px; }
.repo-sync > span, .status-pill.success > span { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
.header-actions, .empty-actions, .settings-footer { display: flex; align-items: center; gap: 8px; }
.button-primary, .button-secondary { display: inline-flex; min-height: 37px; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border-radius: 8px; font-size: 11px; font-weight: 700; }
.button-primary { border: 1px solid #0f766e; background: #0f766e; color: white; box-shadow: 0 1px 2px rgb(15 118 110 / 22%); }
.button-primary:hover { background: #115e59; }
.button-secondary { border: 1px solid #d4d4d8; background: white; color: #3f3f46; }
.button-secondary:hover { background: #f4f4f5; }
.button-primary svg, .button-secondary svg { width: 14px; }
.showroom-tabs { display: flex; min-height: 40px; align-items: end; gap: 2px; padding: 0 22px; border-bottom: 1px solid #e4e4e7; background: white; }
.showroom-tabs button { position: relative; display: flex; min-height: 40px; align-items: center; gap: 7px; padding: 0 11px; border: 0; background: transparent; color: #71717a; font-size: 11px; font-weight: 650; }
.showroom-tabs button::after { position: absolute; inset: auto 7px -1px; height: 2px; border-radius: 2px; background: transparent; content: ""; }
.showroom-tabs button.is-active { color: #0f766e; }
.showroom-tabs button.is-active::after { background: #0f766e; }
.showroom-tabs button > span { min-width: 18px; padding: 2px 5px; border-radius: 999px; background: #f4f4f5; color: #71717a; font-size: 9px; }
.showroom-tabs button > span.attention-count { background: #ccfbf1; color: #0f766e; }
.internal-content { height: calc(100dvh - 198px); min-height: 620px; overflow: auto; }
.with-concept-switcher .internal-content { height: calc(100dvh - 246px); }

.empty-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; align-items: stretch; background: #fafafa; }
.empty-main { display: flex; align-items: center; flex-direction: column; justify-content: center; padding: 58px 7%; text-align: center; }
.folder-illustration { position: relative; width: 180px; height: 128px; margin-bottom: 28px; }
.folder-back { position: absolute; inset: 12px 8px 25px; border-radius: 10px 10px 5px 5px; background: #ccfbf1; transform: rotate(-3deg); }
.folder-back::before { position: absolute; top: -13px; left: 0; width: 70px; height: 18px; border-radius: 6px 6px 0 0; background: #99f6e4; content: ""; }
.folder-back span { position: absolute; top: 16px; left: 15px; color: #0f766e; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 700; }
.folder-front { position: absolute; inset: 34px 0 0; border: 1px solid #99f6e4; border-radius: 7px 12px 12px; background: #f0fdfa; transform: rotate(2deg); box-shadow: 0 5px 8px rgb(15 118 110 / 11%); }
.file-sheet { position: absolute; left: 47px; top: 23px; display: grid; width: 72px; height: 78px; align-content: start; gap: 8px; padding: 18px 13px; border-radius: 5px; background: white; box-shadow: 0 2px 5px rgb(24 24 27 / 12%); transform: rotate(-4deg); }
.file-sheet::before { position: absolute; right: 8px; top: 8px; color: #14b8a6; font-family: ui-monospace, monospace; font-size: 9px; content: "</>"; }
.file-sheet span { display: block; height: 3px; border-radius: 2px; background: #d4d4d8; }
.file-sheet span:nth-child(2) { width: 75%; background: #99f6e4; }
.file-sheet span:nth-child(3) { width: 45%; }
.cursor-spark { position: absolute; right: 22px; top: 42px; display: grid; width: 32px; height: 32px; place-items: center; border-radius: 50%; background: #0f766e; color: white; font-size: 16px; box-shadow: 0 3px 7px rgb(15 118 110 / 24%); }
.empty-main h2 { max-width: 560px; margin: 0; font-size: 25px; letter-spacing: -0.03em; }
.empty-main > p { max-width: 640px; margin: 12px 0 24px; color: #52525b; font-size: 13px; line-height: 1.7; }
.empty-main code, .empty-aside code { padding: 2px 4px; border-radius: 4px; background: #f4f4f5; color: #0f766e; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.92em; }
.folder-contract { display: flex; width: min(680px, 100%); align-items: center; gap: 11px; margin-top: 40px; padding: 12px 14px; border: 1px solid #e4e4e7; border-radius: 10px; background: white; text-align: left; }
.folder-contract-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 8px; background: #f0fdfa; color: #0f766e; }
.folder-contract > div { flex: 1; }
.folder-contract strong, .folder-contract small { display: block; }
.folder-contract strong { font-size: 11px; }
.folder-contract small { margin-top: 3px; color: #71717a; font-size: 10px; }
.folder-contract > code { color: #52525b; font-size: 10px; }
.status-pill { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 4px 7px; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 9px; font-weight: 700; white-space: nowrap; }
.status-pill.success { background: #ecfdf5; color: #047857; }
.status-pill svg { width: 11px; }
.empty-aside { align-self: stretch; padding: 42px 28px; border-left: 1px solid #e4e4e7; background: white; }
.empty-aside h3 { margin: 0 0 28px; font-size: 13px; }
.empty-aside ol { display: grid; gap: 23px; margin: 0; padding: 0; list-style: none; }
.empty-aside li { display: flex; gap: 12px; }
.empty-aside li > span { display: grid; width: 25px; height: 25px; flex: none; place-items: center; border-radius: 50%; background: #f0fdfa; color: #0f766e; font-size: 10px; font-weight: 800; }
.empty-aside li strong, .empty-aside li small { display: block; }
.empty-aside li strong { font-size: 11px; }
.empty-aside li small { margin-top: 4px; color: #71717a; font-size: 10px; line-height: 1.5; }

.library-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); background: #fafafa; }
.category-tree { padding: 18px 12px; border-right: 1px solid #e4e4e7; background: white; }
.category-tree-heading { display: flex; min-height: 34px; align-items: center; justify-content: space-between; padding: 0 6px 7px 9px; }
.category-tree-heading strong { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
.category-tree-heading button { width: 27px; height: 27px; }
.tree-row { display: flex; width: 100%; min-height: 36px; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: #52525b; font-size: 11px; text-align: left; }
.tree-row:hover { background: #f4f4f5; }
.tree-row.is-active { background: #f0fdfa; color: #0f766e; font-weight: 700; }
.tree-row svg { width: 14px; }
.tree-row span { flex: 1; }
.tree-row small { color: #71717a; font-size: 9px; }
.tree-divider { height: 1px; margin: 13px 8px; background: #e4e4e7; }
.repo-location { display: flex; align-items: center; gap: 8px; padding: 7px 9px; color: #71717a; }
.repo-location > svg { width: 14px; }
.repo-location > div { flex: 1; }
.repo-location span, .repo-location code { display: block; }
.repo-location span { font-size: 9px; }
.repo-location code { margin-top: 2px; color: #52525b; font-size: 10px; }
.repo-location button { border: 0; background: transparent; color: #a1a1aa; }
.repo-location button svg { width: 12px; }
.library-main { min-width: 0; padding: 16px 20px 42px; overflow: auto; }
.library-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.search-field { display: flex; width: min(320px, 45%); min-height: 34px; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid #e4e4e7; border-radius: 7px; background: white; color: #71717a; font-size: 10px; }
.search-field svg, .filter-button svg { width: 13px; }
.filter-button { display: inline-flex; min-height: 34px; align-items: center; gap: 7px; padding: 0 10px; border: 1px solid #e4e4e7; border-radius: 7px; background: white; color: #52525b; font-size: 10px; }
.filter-button.icon-only { width: 34px; justify-content: center; padding: 0; }
.library-toolbar .icon-only { margin-left: auto; }
.category-section { margin-bottom: 28px; }
.category-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
.category-title-row > div { display: flex; align-items: center; gap: 7px; }
.category-title-row svg { width: 15px; color: #0f766e; }
.category-title-row h2 { margin: 0; font-size: 13px; }
.category-title-row span { color: #71717a; font-size: 9px; }
.category-title-row button { display: flex; align-items: center; gap: 5px; border: 0; background: transparent; color: #71717a; font-size: 9px; }
.category-title-row button svg { width: 11px; color: inherit; }
.mockup-grid { display: grid; grid-template-columns: 1.3fr 0.85fr 0.85fr; gap: 12px; }
.mockup-card { min-width: 0; overflow: hidden; border: 1px solid #e4e4e7; border-radius: 10px; background: white; transition: border-color 160ms ease-out, transform 160ms ease-out; }
.mockup-card:hover { border-color: #99f6e4; transform: translateY(-1px); }
.mockup-thumb { position: relative; height: 190px; overflow: hidden; border-bottom: 1px solid #e4e4e7; }
.mockup-card:not(.is-featured) .mockup-thumb { height: 190px; }
.live-thumb { background: #f5f4ee; }
.live-thumb-scale { width: 294%; height: 720px; transform: scale(0.34); transform-origin: top left; }
.version-chip, .recommended-badge { position: absolute; top: 9px; left: 9px; z-index: 3; padding: 5px 7px; border-radius: 5px; background: #0f766e; color: white; font-size: 8px; font-weight: 750; box-shadow: 0 1px 3px rgb(15 118 110 / 22%); }
.version-chip.neutral { background: rgb(255 255 255 / 92%); color: #3f3f46; box-shadow: 0 1px 3px rgb(24 24 27 / 12%); }
.thumb-open { position: absolute; right: 9px; top: 9px; z-index: 3; display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 6px; background: rgb(255 255 255 / 92%); color: #3f3f46; }
.thumb-open svg { width: 13px; }
.mockup-meta { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 10px 11px; }
.mockup-meta > div:first-child { min-width: 0; flex: 1; }
.mockup-meta strong, .mockup-meta code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mockup-meta strong { font-size: 10px; }
.mockup-meta code { margin-top: 4px; color: #71717a; font-size: 8px; }
.meta-signals { display: flex; align-items: center; gap: 6px; }
.meta-signals > span { display: flex; align-items: center; gap: 3px; color: #71717a; font-size: 9px; }
.meta-signals svg { width: 11px; }
.meta-signals > span.new-feedback { padding: 3px 5px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-weight: 700; }
.alternate-thumb { background: #d5d0c4; color: #1d2c35; }
.alt-nav { display: flex; justify-content: space-between; padding: 15px; font-size: 7px; font-weight: 800; letter-spacing: 0.08em; }
.alt-copy { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: flex-start; padding: 30px 18px; }
.alt-copy small { font-size: 6px; letter-spacing: 0.12em; }
.alt-copy strong { margin-top: 9px; font-family: Georgia, serif; font-size: 27px; font-weight: 400; line-height: 0.95; }
.alt-copy span { margin-top: 17px; padding-bottom: 3px; border-bottom: 1px solid; font-size: 7px; }
.alt-orb { position: absolute; right: -20px; bottom: -32px; width: 140px; height: 140px; border-radius: 50%; background: #b8563e; }
.editorial-thumb { background: #e75b3d; color: #152c3b; }
.editorial-number { position: absolute; top: -14px; left: 7px; color: #641b12; font-family: Georgia, serif; font-size: 112px; line-height: 1; }
.editorial-copy { position: absolute; right: 18px; bottom: 24px; z-index: 2; text-align: right; }
.editorial-copy span { color: #071b25; font-size: 6px; font-weight: 800; letter-spacing: 0.13em; }
.editorial-copy strong { display: block; margin-top: 8px; color: #071b25; font-family: Georgia, serif; font-size: 28px; font-weight: 400; line-height: 0.94; }
.compact-category { margin-top: 8px; }
.compact-files { display: grid; grid-template-columns: 1fr 1fr 0.7fr; gap: 8px; }
.compact-files > div, .compact-files > button { display: flex; min-height: 58px; align-items: center; gap: 9px; padding: 8px; border: 1px solid #e4e4e7; border-radius: 8px; background: white; text-align: left; }
.file-preview { display: grid; width: 38px; height: 38px; flex: none; place-items: center; border-radius: 6px; color: white; }
.file-preview.coral { background: #e75b3d; }
.file-preview.navy { background: #17394a; }
.file-preview svg { width: 16px; }
.compact-files strong, .compact-files code { display: block; }
.compact-files strong { font-size: 9px; }
.compact-files code { margin-top: 3px; color: #71717a; font-size: 7px; }
.compact-files small { margin-left: auto; color: #71717a; font-size: 8px; }
.compact-files > button { justify-content: center; border-style: dashed; color: #71717a; font-size: 9px; }
.compact-files > button svg { width: 13px; }

.sharing-layout { display: grid; grid-template-columns: minmax(0, 1fr) 350px; background: #fafafa; }
.sharing-main { padding: 24px 28px; }
.section-heading-action { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
.section-heading-action h2 { margin: 0; font-size: 16px; }
.section-heading-action p { margin: 5px 0 0; color: #71717a; font-size: 10px; line-height: 1.5; }
.security-note { display: flex; gap: 11px; margin: 22px 0 16px; padding: 12px 14px; border: 1px solid #a7f3d0; border-radius: 9px; background: #ecfdf5; color: #065f46; }
.security-note > span { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border-radius: 7px; background: #d1fae5; }
.security-note svg { width: 15px; }
.security-note strong { font-size: 10px; }
.security-note p { margin: 3px 0 0; color: #047857; font-size: 9px; line-height: 1.5; }
.share-list { overflow: hidden; border: 1px solid #e4e4e7; border-radius: 10px; background: white; }
.share-row { display: grid; grid-template-columns: auto minmax(0, 1fr) 55px auto auto; align-items: center; gap: 12px; min-height: 94px; padding: 14px; border-bottom: 1px solid #e4e4e7; }
.share-row:last-child { border-bottom: 0; }
.share-avatar { display: grid; width: 37px; height: 37px; place-items: center; border-radius: 8px; background: #ccfbf1; color: #0f766e; font-size: 9px; font-weight: 800; }
.share-avatar.muted { background: #f4f4f5; color: #52525b; }
.share-details > div { display: flex; align-items: center; gap: 7px; }
.share-details strong { font-size: 11px; }
.share-details p { margin: 4px 0; color: #71717a; font-size: 9px; }
.share-details code { color: #0f766e; font-size: 8px; }
.share-stats { text-align: center; }
.share-stats strong, .share-stats small { display: block; }
.share-stats strong { font-size: 13px; }
.share-stats small { margin-top: 2px; color: #71717a; font-size: 8px; }
.share-copy { display: flex; min-height: 32px; align-items: center; gap: 5px; padding: 0 9px; border: 1px solid #e4e4e7; border-radius: 7px; background: white; color: #52525b; font-size: 9px; }
.share-copy svg, .more-button svg { width: 12px; }
.danger-hover:hover { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.revoked-row { display: flex; align-items: center; gap: 8px; padding: 16px; background: #f0fdf4; color: #047857; font-size: 10px; }
.revoked-row svg { width: 15px; }
.share-settings, .iteration-config { padding: 24px 25px; border-left: 1px solid #e4e4e7; background: white; }
.settings-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.settings-heading > span, .iteration-title > span { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 9px; background: #f0fdfa; color: #0f766e; }
.settings-heading svg, .iteration-title svg { width: 17px; }
.settings-heading strong, .settings-heading small { display: block; }
.settings-heading strong { font-size: 13px; }
.settings-heading small { margin-top: 3px; color: #71717a; font-size: 9px; }
.share-settings > label, .iteration-config > label { display: grid; gap: 7px; margin-bottom: 17px; }
.share-settings > label > span, .iteration-config > label > span { color: #3f3f46; font-size: 10px; font-weight: 700; }
.share-settings input, .iteration-config textarea { width: 100%; border: 1px solid #d4d4d8; border-radius: 7px; background: white; color: #18181b; font-size: 10px; outline: none; }
.share-settings input { height: 38px; padding: 0 10px; }
.select-control { display: flex; width: 100%; min-height: 38px; align-items: center; justify-content: space-between; padding: 0 10px; border: 1px solid #d4d4d8; border-radius: 7px; background: white; color: #3f3f46; font-size: 10px; text-align: left; }
.select-control svg { width: 13px; color: #71717a; }
.toggle-row { display: flex; align-items: center; gap: 12px; margin: 20px 0; padding-block: 15px; border-block: 1px solid #e4e4e7; }
.toggle-row > div { flex: 1; }
.toggle-row strong, .toggle-row small { display: block; }
.toggle-row strong { font-size: 10px; }
.toggle-row small { margin-top: 4px; color: #71717a; font-size: 8px; line-height: 1.4; }
.toggle { width: 34px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: #d4d4d8; }
.toggle span { display: block; width: 16px; height: 16px; border-radius: 50%; background: white; transition: transform 160ms ease-out; }
.toggle.is-on { background: #0f766e; }
.toggle.is-on span { transform: translateX(14px); }
.share-settings .settings-footer { justify-content: flex-end; margin-top: 30px; padding-top: 18px; border-top: 1px solid #e4e4e7; }

.inbox-layout { display: grid; grid-template-columns: 190px minmax(380px, 0.9fr) minmax(340px, 0.75fr); background: #fafafa; }
.feedback-filters { padding: 18px 10px; border-right: 1px solid #e4e4e7; background: white; }
.feedback-filters > strong, .filter-label { display: block; padding: 0 9px 9px; color: #71717a; font-size: 9px; font-weight: 750; letter-spacing: 0.07em; text-transform: uppercase; }
.feedback-filters button { display: flex; width: 100%; min-height: 35px; align-items: center; justify-content: space-between; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: #52525b; font-size: 9px; }
.feedback-filters button span { display: flex; align-items: center; gap: 7px; }
.feedback-filters button svg { width: 13px; }
.feedback-filters button small { color: #71717a; font-size: 8px; }
.feedback-filters button.is-active { background: #f0fdfa; color: #0f766e; font-weight: 700; }
.feedback-list-panel { position: relative; display: flex; min-width: 0; flex-direction: column; border-right: 1px solid #e4e4e7; background: white; }
.feedback-list-heading { display: flex; min-height: 70px; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e4e4e7; }
.feedback-list-heading h2 { margin: 0; font-size: 13px; }
.feedback-list-heading p { margin: 4px 0 0; color: #71717a; font-size: 9px; }
.feedback-list { min-height: 0; flex: 1; overflow: auto; padding-bottom: 62px; }
.feedback-row { display: grid; width: 100%; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: start; gap: 9px; padding: 14px 12px; border: 0; border-bottom: 1px solid #e4e4e7; background: white; color: #18181b; text-align: left; }
.feedback-row.is-selected { background: #f8fffd; }
.feedback-checkbox { display: grid; width: 16px; height: 16px; place-items: center; margin-top: 2px; border: 1px solid #d4d4d8; border-radius: 4px; background: white; }
.feedback-checkbox.checked { border-color: #0f766e; background: #0f766e; color: white; }
.feedback-checkbox svg { width: 10px; }
.pin-number, .comment-pin { display: grid; width: 20px; height: 20px; flex: none; place-items: center; border-radius: 50% 50% 50% 3px; background: #0f766e; color: white; font-size: 8px; font-weight: 800; }
.feedback-row-body { min-width: 0; }
.feedback-row-body strong, .feedback-row-body small { display: block; }
.feedback-row-body strong { font-size: 10px; }
.feedback-row-body small { margin-top: 3px; color: #71717a; font-size: 8px; }
.feedback-row-body p { margin: 8px 0 0; color: #52525b; font-size: 9px; line-height: 1.5; }
.feedback-time { color: #71717a; font-size: 8px; }
.selection-actionbar { position: absolute; inset: auto 12px 12px; display: flex; min-height: 48px; align-items: center; gap: 7px; padding: 7px 8px 7px 13px; border-radius: 9px; background: #27272a; color: white; box-shadow: 0 5px 12px rgb(24 24 27 / 22%); }
.selection-actionbar > span { flex: 1; font-size: 9px; }
.selection-actionbar .button-secondary { border-color: #52525b; background: #3f3f46; color: white; }
.selection-actionbar .button-primary { border-color: #14b8a6; background: #14b8a6; }
.feedback-preview { min-width: 0; background: #f4f4f5; }
.feedback-preview-head { display: flex; min-height: 70px; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #e4e4e7; background: white; }
.feedback-preview-head > div { min-width: 0; flex: 1; }
.feedback-preview-head strong, .feedback-preview-head code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feedback-preview-head strong { font-size: 10px; }
.feedback-preview-head code { margin-top: 4px; color: #71717a; font-size: 8px; }
.mini-page-preview { height: 320px; margin: 14px; overflow: hidden; border: 1px solid #d4d4d8; border-radius: 7px; background: white; box-shadow: 0 2px 5px rgb(24 24 27 / 10%); }
.mini-preview-scale { width: 263%; height: 850px; transform: scale(0.38); transform-origin: top left; }
.selected-comment { margin: 0 14px; padding: 14px; border: 1px solid #e4e4e7; border-radius: 9px; background: white; }
.selected-comment > div:first-child { display: flex; align-items: center; gap: 8px; }
.selected-comment > div:first-child > div { flex: 1; }
.selected-comment strong, .selected-comment small { display: block; }
.selected-comment strong { font-size: 9px; }
.selected-comment small { margin-top: 2px; color: #71717a; font-size: 8px; }
.comment-avatar { display: grid; width: 29px; height: 29px; flex: none; place-items: center; border-radius: 50%; background: #ccfbf1; color: #0f766e; font-size: 8px; font-weight: 800; }
.comment-avatar.blue { background: #dbeafe; color: #1d4ed8; }
.selected-comment > p { margin: 12px 0; color: #3f3f46; font-size: 10px; line-height: 1.55; }
.element-reference { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 7px; background: #f4f4f5; color: #71717a; }
.element-reference svg { width: 14px; }
.element-reference span, .element-reference code { display: block; }
.element-reference span { font-size: 8px; }
.element-reference code { margin-top: 2px; color: #3f3f46; font-size: 8px; }

.iteration-layout { display: grid; grid-template-columns: minmax(0, 1fr) 390px; background: #fafafa; }
.iteration-context { padding: 20px 30px 44px; overflow: auto; }
.iteration-breadcrumb { display: flex; align-items: center; gap: 8px; color: #71717a; font-size: 9px; }
.iteration-breadcrumb button { display: flex; align-items: center; gap: 5px; padding: 0; border: 0; background: transparent; color: #52525b; }
.iteration-breadcrumb svg { width: 12px; }
.iteration-title { display: flex; gap: 12px; margin: 24px 0 28px; }
.iteration-title h2 { margin: 1px 0 0; font-size: 18px; letter-spacing: -0.02em; }
.iteration-title p { max-width: 680px; margin: 6px 0 0; color: #71717a; font-size: 10px; line-height: 1.55; }
.version-flow { display: grid; grid-template-columns: 1fr 130px 1fr; align-items: center; margin-bottom: 28px; }
.version-node { position: relative; min-height: 96px; padding: 14px 16px; border: 1px solid #d4d4d8; border-radius: 9px; background: white; }
.version-node span, .version-node strong, .version-node small { display: block; }
.version-node span { color: #71717a; font-size: 8px; font-weight: 700; text-transform: uppercase; }
.version-node strong { margin-top: 6px; font-size: 21px; }
.version-node small { margin-top: 2px; color: #71717a; font-family: ui-monospace, monospace; font-size: 8px; }
.version-node.next { border-color: #5eead4; background: #f0fdfa; }
.version-node.next strong { color: #0f766e; }
.version-arrow { position: relative; display: flex; align-items: center; color: #a1a1aa; }
.version-arrow::before { height: 1px; flex: 1; background: #d4d4d8; content: ""; }
.version-arrow svg { width: 16px; }
.version-arrow span { position: absolute; left: 50%; bottom: calc(100% + 5px); padding: 3px 6px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: 8px; font-weight: 700; transform: translateX(-50%); white-space: nowrap; }
.iteration-feedbacks { overflow: hidden; border: 1px solid #e4e4e7; border-radius: 9px; background: white; }
.iteration-section-title { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #e4e4e7; }
.iteration-section-title strong { font-size: 10px; }
.iteration-section-title span { color: #71717a; font-size: 8px; }
.iteration-feedbacks > label { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: start; gap: 10px; padding: 13px 14px; border-bottom: 1px solid #e4e4e7; }
.iteration-feedbacks > label:last-child { border-bottom: 0; }
.iteration-feedbacks input { margin-top: 4px; accent-color: #0f766e; }
.iteration-feedbacks strong { font-size: 9px; }
.iteration-feedbacks p { margin: 4px 0 0; color: #71717a; font-size: 8px; line-height: 1.45; }
.iteration-feedbacks > label > svg { width: 13px; color: #d4d4d8; }
.global-comment-icon { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 5px; background: #f4f4f5; color: #52525b; }
.global-comment-icon svg { width: 11px; }
.iteration-config { overflow: auto; }
.config-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.config-title strong { font-size: 13px; }
.file-name-control { display: flex; min-height: 38px; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid #a7f3d0; border-radius: 7px; background: #f0fdf4; color: #047857; }
.file-name-control code { min-width: 0; flex: 1; font-size: 9px; }
.file-name-control svg { width: 13px; }
.iteration-config textarea { min-height: 96px; resize: none; padding: 10px; line-height: 1.55; }
.iteration-options { display: grid; gap: 10px; padding: 14px 0; border-block: 1px solid #e4e4e7; }
.iteration-options label { display: flex; align-items: start; gap: 8px; }
.iteration-options input { margin-top: 2px; accent-color: #0f766e; }
.iteration-options strong, .iteration-options small { display: block; }
.iteration-options strong { font-size: 9px; }
.iteration-options small { margin-top: 3px; color: #71717a; font-size: 8px; line-height: 1.4; }
.task-link-preview { display: flex; align-items: center; gap: 9px; margin-top: 16px; padding: 10px; border-radius: 8px; background: #f4f4f5; color: #52525b; }
.task-link-preview > svg { width: 16px; }
.task-link-preview span, .task-link-preview strong { display: block; }
.task-link-preview span { color: #71717a; font-size: 8px; }
.task-link-preview strong { margin-top: 3px; font-size: 9px; }
.iteration-config .settings-footer { justify-content: flex-end; margin-top: 22px; }

.external-gallery { min-height: 100dvh; background: #f7f7f5; color: #19282e; }
.external-header { display: flex; min-height: 78px; align-items: center; justify-content: space-between; padding: 0 5.5vw; border-bottom: 1px solid #d9dcda; background: #fbfbf9; }
.external-brand, .external-reviewer { display: flex; align-items: center; gap: 11px; }
.external-brand-mark { display: grid; width: 36px; height: 36px; place-items: center; background: #17394a; color: white; font-family: Georgia, serif; font-size: 18px; }
.external-brand strong, .external-brand small { display: block; }
.external-brand strong { font-size: 13px; letter-spacing: 0.02em; }
.external-brand small { margin-top: 3px; color: #56686f; font-size: 9px; }
.external-reviewer > span { display: flex; align-items: center; gap: 6px; color: #66757b; font-size: 9px; }
.external-reviewer svg { width: 12px; }
.reviewer-avatar { border-radius: 50%; background: #e3e9e8; color: #34515a; }
.external-intro { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 8vw; padding: 64px 8vw 54px; border-bottom: 1px solid #d9dcda; }
.external-kicker { color: #b8321f; font-size: 9px; font-weight: 800; letter-spacing: 0.13em; }
.external-intro h1 { max-width: 760px; margin: 14px 0 0; font-family: Georgia, "Times New Roman", serif; font-size: 44px; font-weight: 400; letter-spacing: -0.035em; line-height: 1.03; text-wrap: balance; }
.external-intro > div:last-child { align-self: end; }
.external-intro p { max-width: 520px; margin: 0; color: #51656c; font-size: 13px; line-height: 1.7; }
.external-intro > div:last-child > span { display: flex; align-items: center; gap: 6px; margin-top: 18px; color: #56686f; font-size: 9px; }
.external-intro svg { width: 12px; }
.external-category { padding: 40px 5.5vw 46px; }
.external-category-title { display: flex; align-items: baseline; gap: 14px; margin-bottom: 16px; }
.external-category-title h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 21px; font-weight: 400; }
.external-category-title p { margin: 0; color: #56686f; font-size: 10px; }
.external-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 17px; }
.external-card { min-width: 0; overflow: hidden; padding: 0; border: 1px solid #d9dcda; border-radius: 9px; background: #fbfbf9; color: #19282e; text-align: left; transition: transform 180ms cubic-bezier(.22,1,.36,1), border-color 180ms ease-out; }
.external-card:hover { border-color: #91a7a8; transform: translateY(-2px); }
.external-thumb { position: relative; height: 250px; overflow: hidden; border-bottom: 1px solid #d9dcda; }
.external-thumb .live-thumb-scale { width: 294%; height: 735px; transform: scale(0.34); }
.external-card > div:last-child { display: flex; min-height: 65px; align-items: center; gap: 12px; padding: 11px 14px; }
.external-card > div:last-child > span { flex: 1; }
.external-card strong, .external-card small { display: block; }
.external-card strong { font-size: 11px; }
.external-card small { margin-top: 4px; color: #56686f; font-size: 9px; }
.external-card .alt-copy small { color: #263a42; }
.external-card > div:last-child > svg { width: 16px; }
.recommended-badge { display: flex; align-items: center; gap: 5px; background: #17394a; }
.recommended-badge svg { width: 10px; }
.external-comment-count { position: absolute; top: 9px; right: 9px; z-index: 3; display: flex; align-items: center; gap: 4px; padding: 5px 7px; border-radius: 5px; background: rgb(255 255 255 / 91%); color: #334a53; font-size: 8px; font-weight: 700; box-shadow: 0 1px 3px rgb(24 24 27 / 12%); }
.external-comment-count svg { width: 10px; }
.compact-external-category { padding-top: 14px; }
.external-file-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.external-file-row button { display: flex; align-items: center; gap: 11px; min-height: 66px; padding: 9px; border: 1px solid #d9dcda; border-radius: 8px; background: #fbfbf9; color: #19282e; text-align: left; }
.external-file-row button > span:nth-child(2) { flex: 1; }
.external-file-row strong, .external-file-row small { display: block; }
.external-file-row strong { font-size: 10px; }
.external-file-row small { margin-top: 4px; color: #56686f; font-size: 8px; }
.external-file-row button > svg { width: 14px; color: #56686f; }
.external-footer { display: flex; justify-content: space-between; margin-top: 10px; padding: 25px 5.5vw; border-top: 1px solid #d9dcda; color: #56686f; font-size: 9px; }
.external-footer strong { color: #334a53; }
.external-footer a { color: inherit; }

.external-viewer { display: flex; height: 100dvh; min-height: 700px; flex-direction: column; overflow: hidden; background: #e4e4e7; }
.external-viewer.with-concept-switcher { height: 100dvh; padding-top: 48px; }
.viewer-toolbar { display: grid; min-height: 58px; flex: none; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 8px 12px; border-bottom: 1px solid #d4d4d8; background: #fafafa; }
.viewer-back { display: flex; width: fit-content; align-items: center; gap: 7px; padding: 7px 8px; border: 0; border-radius: 7px; background: transparent; color: #52525b; font-size: 10px; }
.viewer-back svg { width: 14px; }
.viewer-title { text-align: center; }
.viewer-title strong { font-size: 11px; }
.viewer-title span { margin-left: 7px; color: #71717a; font-size: 9px; }
.viewer-tools { display: flex; justify-content: flex-end; gap: 5px; }
.viewport-switch { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 7px; background: #e4e4e7; }
.viewport-switch button { display: grid; width: 28px; height: 27px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: #71717a; }
.viewport-switch button.is-active { background: white; color: #0f766e; box-shadow: 0 1px 2px rgb(24 24 27 / 12%); }
.viewport-switch svg, .viewer-tools > button svg { width: 13px; }
.viewer-body { display: grid; min-height: 0; flex: 1; grid-template-columns: minmax(0, 1fr) 356px; }
.prototype-canvas { position: relative; min-width: 0; overflow: auto; padding: 28px 34px 70px; background: #e4e4e7; }
.prototype-browser { min-width: 820px; max-width: 1120px; margin: 0 auto; overflow: hidden; border-radius: 7px; background: white; box-shadow: 0 6px 16px rgb(24 24 27 / 18%); }
.browser-chrome { display: flex; height: 32px; align-items: center; gap: 5px; padding: 0 10px; background: #fafafa; border-bottom: 1px solid #e4e4e7; }
.browser-chrome > span { width: 7px; height: 7px; border-radius: 50%; background: #d4d4d8; }
.browser-chrome > span:first-child { background: #fb7185; }
.browser-chrome > span:nth-child(2) { background: #fbbf24; }
.browser-chrome > span:nth-child(3) { background: #34d399; }
.browser-chrome > div { width: 240px; margin: 0 auto; padding: 4px 10px; border-radius: 5px; background: #f4f4f5; color: #65656e; font-size: 8px; text-align: center; }
.canvas-help { position: fixed; z-index: 8; left: calc(50% - 178px); bottom: 18px; display: flex; min-height: 39px; align-items: center; gap: 8px; padding: 0 10px; border-radius: 8px; background: #18181b; color: white; box-shadow: 0 4px 10px rgb(24 24 27 / 28%); font-size: 9px; }
.canvas-help svg { width: 14px; color: #5eead4; }
.canvas-help kbd { margin-left: 6px; padding: 2px 5px; border: 1px solid #52525b; border-radius: 4px; color: #a1a1aa; font-size: 8px; }
.review-panel { min-width: 0; overflow: auto; border-left: 1px solid #d4d4d8; background: white; }
.review-panel-header { display: flex; min-height: 62px; align-items: center; justify-content: space-between; padding: 12px 15px; border-bottom: 1px solid #e4e4e7; }
.review-panel-header strong, .review-panel-header span { display: block; }
.review-panel-header strong { font-size: 12px; }
.review-panel-header span { margin-top: 3px; color: #71717a; font-size: 8px; }
.review-mode-switch { display: grid; grid-template-columns: 1fr 1fr; margin: 12px 14px; padding: 3px; border-radius: 7px; background: #f4f4f5; }
.review-mode-switch button { display: flex; min-height: 31px; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 5px; background: transparent; color: #65656e; font-size: 9px; font-weight: 650; }
.review-mode-switch button.is-active { background: white; color: #0f766e; box-shadow: 0 1px 2px rgb(24 24 27 / 12%); }
.review-mode-switch svg { width: 12px; }
.review-composer { padding: 3px 14px 16px; border-bottom: 1px solid #e4e4e7; }
.element-selection { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 8px; border: 1px solid #99f6e4; border-radius: 7px; background: #f0fdfa; }
.selection-preview { display: grid; height: 40px; place-items: center; background: #c83f29; color: white; font-size: 6px; font-weight: 750; }
.element-selection > div:nth-child(2) { min-width: 0; }
.element-selection > div:nth-child(2) span, .element-selection strong, .element-selection code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.element-selection > div:nth-child(2) span { color: #0f766e; font-size: 7px; }
.element-selection strong { margin-top: 2px; font-size: 9px; }
.element-selection code { margin-top: 2px; color: #71717a; font-size: 7px; }
.element-selection > button { align-self: start; padding: 2px; border: 0; background: transparent; color: #71717a; }
.element-selection > button svg { width: 12px; }
.review-composer > label { display: grid; gap: 6px; margin-top: 13px; }
.review-composer > label > span { font-size: 9px; font-weight: 700; }
.review-composer textarea { min-height: 104px; resize: none; padding: 10px; border: 1px solid #d4d4d8; border-radius: 7px; color: #3f3f46; font-size: 10px; line-height: 1.55; outline: none; }
.review-composer textarea:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgb(20 184 166 / 12%); }
.composer-identity { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.composer-identity strong, .composer-identity small { display: block; }
.composer-identity strong { font-size: 9px; }
.composer-identity small { margin-top: 2px; color: #71717a; font-size: 8px; }
.submit-feedback { display: flex; width: 100%; min-height: 37px; align-items: center; justify-content: center; gap: 7px; border: 1px solid #0f766e; border-radius: 7px; background: #0f766e; color: white; font-size: 10px; font-weight: 700; }
.submit-feedback svg { width: 13px; }
.feedback-success { display: flex; min-height: 310px; align-items: center; flex-direction: column; justify-content: center; padding: 30px; border-bottom: 1px solid #e4e4e7; text-align: center; }
.feedback-success > span { display: grid; width: 46px; height: 46px; place-items: center; border-radius: 50%; background: #d1fae5; color: #047857; }
.feedback-success > span svg { width: 22px; }
.feedback-success h2 { margin: 14px 0 0; font-size: 14px; }
.feedback-success p { margin: 7px 0 16px; color: #71717a; font-size: 9px; }
.feedback-success button { padding: 0; border: 0; background: transparent; color: #0f766e; font-size: 9px; font-weight: 700; }
.review-thread { padding: 15px 14px 30px; }
.thread-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.thread-heading strong { font-size: 9px; }
.thread-heading button { display: flex; align-items: center; gap: 4px; border: 0; background: transparent; color: #71717a; font-size: 8px; }
.thread-heading svg { width: 10px; }
.review-thread article { display: flex; gap: 8px; padding: 12px 0; border-bottom: 1px solid #e4e4e7; }
.review-thread article > div { min-width: 0; }
.review-thread p { margin: 0; color: #3f3f46; font-size: 9px; line-height: 1.5; }
.review-thread small { display: block; margin-top: 6px; color: #71717a; font-size: 7px; }

@media (max-width: 1100px) {
  .internal-shell { grid-template-columns: 78px minmax(0, 1fr); }
  .brand-row > div, .command-search span, .command-search kbd, .sidebar-heading span:first-child, .project-item > span:nth-child(2), .project-item > svg, .sidebar-user > span:nth-child(2), .sidebar-user > svg { display: none; }
  .brand-row, .project-item, .sidebar-user { justify-content: center; }
  .command-search { justify-content: center; padding: 0; }
  .project-title { min-width: auto; }
  .project-title > div { display: none; }
  .mockup-grid { grid-template-columns: 1fr 1fr; }
  .mockup-card.is-featured { grid-column: span 2; }
  .inbox-layout { grid-template-columns: 170px minmax(360px, 1fr); }
  .feedback-preview { display: none; }
}

@media (max-width: 780px) {
  .internal-shell { grid-template-columns: 1fr; }
  .product-sidebar { display: none; }
  .project-toolbar { padding-inline: 12px; }
  .surface-switch button { width: 32px; justify-content: center; padding: 0; font-size: 0; }
  .showroom-header { align-items: flex-start; flex-direction: column; }
  .empty-layout, .sharing-layout, .iteration-layout, .library-layout { grid-template-columns: 1fr; }
  .empty-aside, .share-settings, .iteration-config, .category-tree { border-left: 0; border-top: 1px solid #e4e4e7; }
  .mockup-grid, .external-cards { grid-template-columns: 1fr; }
  .mockup-card.is-featured { grid-column: auto; }
  .external-intro { grid-template-columns: 1fr; }
  .external-file-row { grid-template-columns: 1fr; }
  .viewer-body { grid-template-columns: 1fr; }
  .review-panel { position: fixed; inset: auto 0 0; z-index: 10; max-height: 68dvh; border-top: 1px solid #d4d4d8; }
  .viewer-title { display: none; }
  .viewer-toolbar { grid-template-columns: 1fr 1fr; }
  .inbox-layout { grid-template-columns: 1fr; }
  .feedback-filters { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
</style>
