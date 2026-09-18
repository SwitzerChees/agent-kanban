# Task und Showroom vereinen

Stand: 18. September 2026. Konzept und klickbarer Prototyp; keine produktive Feature-Änderung.

## Produktentscheidung

Der Showroom wird die gemeinsame Quelle für visuelle Entwürfe, Vorschau, Versionen und Feedback. Der Task ist Arbeitskontext und verknüpft Showroom-Inhalte. Ein dauerhafter Task-Tab **Showroom** ersetzt den temporären Tab **Visueller Entwurf**. In **Auftrag** steht eine kompakte Zusammenfassung mit Einstieg und der freigegebenen Umsetzungsvorgabe. Das Text-Refinement bleibt bestehen.

Die Vereinigung ist sinnvoll, aber kein blosses Umbenennen: Das aktuelle visuelle Refinement verändert und rendert die echte Anwendung; der Showroom enthält eigenständige HTML-Prototypen. Neue Entwürfe nutzen standardmässig den Showroom-Prototyp. Bestehende App-Screens bleiben als gekennzeichnete Bildansichten erhalten. Ein späterer App-Capture-Modus kann dieselbe Showroom-Ablage und Review-Oberfläche verwenden, bleibt technisch aber ein eigener Renderer. Eine HTML-Demo gilt nicht als Nachweis einer funktionierenden App-Implementierung.

## Vorhandene Bausteine und konkrete Lücken

- `components/TaskVisualRefinementPanel.vue`: Start, Screens, Feedback, Pins und Iteration; `TaskVisualImplementationPanel.vue`: freigegebene Vorgabe. Beide werden durch gemeinsame Showroom-Komponenten bzw. eine Referenzansicht ersetzt.
- `pages/index.vue`: dynamischer visueller Tab, Apply-/Resume-Flow und Refinement-Anbindung; hier kommen dauerhafter Showroom-Tab, Link-Zähler und Auftrag-Zusammenfassung hinein.
- `components/ShowroomWorkspace.vue` und `ShowroomViewer.vue`: Galerie, Kategorieauswahl, interaktiver Viewer, Feedback und Iterationen existieren bereits. Viewer und Galerie als wiederverwendbare Bereiche herauslösen; kein zweiter Task-Viewer.
- `shared/showroom.ts` und `server/lib/db/showroom-schema.ts`: Snapshots, Feedback, Shares und Iterationen existieren; allgemeine Task-Verknüpfungen, stabile Ansichtsidentitäten und freigegebene Vorgaben fehlen. `showroom_iterations.task_id` bezeichnet heute den ausführenden Task, keine frei verwendbare Inhaltsverknüpfung.
- `server/lib/showroom.ts:createIteration`: erstellt heute immer einen neuen Task und unterstützt ein HTML-Ziel. Es muss auch einen bestehenden Task und mehrere Zielansichten unterstützen.
- `server/lib/showroom-publish.ts`: verlangt heute `agent_status=done` am Task und importiert nur eine HTML-Datei plus Kategorie-Assets. Neue Veröffentlichung orientiert sich am abgeschlossenen Entwurfslauf und importiert ein validiertes Bündel mehrerer Ansichten. Der eigentliche Implementierungs-Task bleibt offen.
- `server/lib/visual-refinement-worker.ts`: nutzt persistenten Task-Worktree, Refinement-Leases und App-Captures. Agent-Lebenszyklus weiterverwenden, Showroom-Ausgabe ergänzen. Kein zusätzlicher unabhängiger Dispatcher.
- `docs/showroom.md`: direkte Unterordner sind Kategorien; tiefere Ordner und HTML/HTM sind erlaubt. Vorschau ist isoliert, ohne externe Abhängigkeiten oder Anwendungs-API. Veröffentlichung kann Inhalte sofort über bestehende passende Gastlinks sichtbar machen.

## Informationsarchitektur und Interaktion

### Task ohne Verknüpfungen

Im Auftrag: **Im Showroom entwerfen** und **Bestehendes verknüpfen**. Der Showroom-Tab zeigt dieselben zwei klaren Einstiege. Bei einem noch nicht gespeicherten Task zuerst Titel validieren und Task speichern, danach den Entwurf anlegen. Fehlschläge verändern weder Eingaben noch Verknüpfungen.

### Neu erstellen

Dialog mit Brief aus dem Task, Ansichten/Zuständen, Desktop/Mobil, Agent-Auswahl und Zielordner. Standard: ein taskbezogener Ordner unter `showroom/`, editierbar und kollisionsgeprüft. Bestehende Verknüpfungen können als Quellen ausgewählt werden; sie geben keine automatische Schreibfreigabe auf fremde Entwürfe.

**Entwurf starten** erzeugt einen Showroom-Lauf am vorhandenen Task. Ein eigener Kanban-Task entsteht nur, wenn man im Showroom ausdrücklich eine neue Aufgabe anlegt. Nach erfolgreicher Validierung erscheinen die Ansichten als interner Entwurf in beiden Oberflächen. Ein Lauf kann mehrere HTML-Ansichten liefern. Warte-, Fehler-, Rückfrage-, Abbruch- und Retry-Zustände behalten den letzten gültigen Stand sichtbar.

### Bestehendes verknüpfen

Projektbezogener Picker mit Suche und zwei Auswahlarten: **Ganze Ordner** oder **Einzelne Ansichten**. Mehrfachauswahl und Unterordner sind erlaubt. Ganze Ordner umfassen ihren Inhalt rekursiv; neue Ansichten erscheinen automatisch. Einzelansichten folgen standardmässig der ausdrücklich zugeordneten aktuellen Version ihrer Ansichtsidentität. Alternativ lässt sich ein vorhandener Snapshot fixieren.

Vor dem Speichern zeigt der Picker den genauen Umfang. Gleiche Links sind idempotent; Ansichten, die schon über einen gewählten Ordner enthalten sind, werden nicht doppelt erzeugt. Verknüpfungen sind projektintern und in beide Richtungen sichtbar. Ein Inhalt kann zu mehreren Tasks gehören. **Verknüpfung entfernen** löscht weder Dateien noch Feedback. Ein fehlender oder verschobener Inhalt zeigt **Quelle nicht gefunden** mit Neu-Zuordnen und Entfernen; keine automatische Zuordnung anhand eines ähnlich klingenden Dateinamens.

### Im Task prüfen und iterieren

Ordnergruppen mit Vorschauen, Version, Herkunft und Feedback. **Öffnen** verwendet denselben Viewer wie der Projekt-Showroom; der Rückweg erhält Task und Auswahl. Desktop/Mobil, Interaktion, Ansichtsfeedback sowie Element-/Bereichsanker liegen auf demselben Showroom-Snapshot. Task-Kommentare bleiben normale Task-Kommentare.

**Neue Iteration** zeigt Quelle, Version, ausgewähltes Feedback und Zielordner; Standard ist eine neue Version im vom Task erzeugten Ordner. Referenzansichten aus einem anderen Ordner werden als neue Ableitung im Task-Ordner erstellt, sofern kein bewusstes Weiterbearbeiten gewählt wurde. Feedback mehrerer Ansichten wird nach Snapshot und Ansicht gruppiert; Anker werden nicht auf einen neuen DOM-Stand umgedeutet. Abgeschlossene Läufe erledigen Feedback nicht automatisch.

### Umsetzungsvorgabe festhalten

**Als Vorgabe festhalten** friert ausgewählte Ansichten, Snapshot, Hashes und Umsetzungshinweise ein. Der Task erhält in **Auftrag → Visuelle Umsetzung** eine unveränderliche Referenz. Screens müssen nicht mehr redundant als Pflicht-Anhang kopiert werden; Export/Download bleiben möglich. Die Freigabe ist fachlich taskbezogen: Mehrere Tasks dürfen verschiedene Stände desselben Showroom-Inhalts verwenden.

Ein verknüpfter Ordner kann weiterwachsen. Eine spätere Iteration zeigt **Neuer Stand verfügbar · Vorgabe bleibt V2**. Ersetzen erfordert erneute Auswahl und erzeugt eine neue Vorgabenrevision; alte Vorgaben bleiben nachvollziehbar. Der Task wird durch eine Vorgabe weder gestartet noch abgeschlossen.

### Bereitstellen und Gastzugriff

**Als Vorgabe festhalten**, **Im Projekt-Showroom bereitstellen** und eine externe **Freigabe** sind unterschiedliche Aktionen. Interne Entwürfe sind nur Mitgliedern sichtbar und werden nicht durch allgemeine Gastlinks entdeckt. Vor der Übernahme ins Projekt-Repository nennt der Dialog bestehende Gastlinks, die den neuen Inhalt sehen werden. Die bestehende Share-Policy bleibt erhalten, solange kein eigener Veröffentlichungsstatus eingeführt ist.

Im Prototyp ist der initiale V2-Stand bereits im Showroom bereitgestellt. Neu erstellte Stände tragen **Interner Entwurf**, bis sie ausdrücklich bereitgestellt werden. Der Prototyp simuliert nur lokale UI-Zustände, keine echten Agenten, Speicherung, Bereitstellung oder Links.

## Ablage und Identität

```text
showroom/
  agentkanban-42-team-einladungen/    # Kategorie / verknüpfbarer Ordner
    v1/
      manifest.json
      einladung.html
      mitglieder.html
      leerzustand.html
      assets/
        styles.css
        prototype.js
    v2/
      manifest.json
      einladung.html
      mitglieder.html
      leerzustand.html
      assets/
        styles.css
        prototype.js
```

Alle Dateien entstehen zuerst im persistenten Task-Worktree. HTML, lokale CSS/JS und lokale Assets erfüllen die vorhandenen Showroom-Regeln; kein CDN, keine echten Nutzerdaten, kein Anwendungs-API-Zugriff. Alte Versionen und ihre Assets bleiben unverändert. Pfade sind innerhalb von Kategorie/Version aufzulösen, ohne Traversal oder Symlinks.

Ein schema-validiertes, versioniertes Manifest ordnet stabile Collection-/View-IDs konkreten HTML-Dateien zu und kennzeichnet Prototyp bzw. App-Screenshot. Es enthält keine Task-Titel, internen Kommentare oder Gasttokens. Der Katalog speichert die aktuelle Revision explizit; keine Heuristik anhand von `v10` oder Änderungszeit. Beliebige schon existierende HTML-Dateien werden ohne Umbau als erste Einzelrevision katalogisiert. Umbenennungen erhalten Identität nur bei expliziter Neuzuordnung oder passendem validiertem Manifest. Galerie zeigt standardmässig den aktuellen Stand; ältere Versionen stehen im Versionsmenü.

Interne Resultate werden aus dem Worktree als immutable Snapshots im selben Showroom-Speicher aufgenommen und mit ihrem Lauf katalogisiert. Sie sind damit im Task und im internen Showroom verfügbar, bevor Dateien ins Projekt-Repository gelangen. Export in das Repository übernimmt ausschliesslich das validierte Manifest-Bündel. Ohne Worktree liest er den erhaltenen Task-Branch. Aufräumen darf die alleinige Kopie eines Entwurfs niemals vernichten.

## Datenmodell (Vorschlag)

| Entität | Wesentliche Daten / Semantik |
| --- | --- |
| `showroom_items` | Projekt, stabile ID, `folder/view`, Eltern-ID, relativer Pfad, Titel, Inhaltstyp, Zustand `available/missing/archived`; eindeutiger Pfad pro Projekt. |
| `showroom_revisions` | View-ID, Run-ID optional, Snapshot-ID, exakter Pfad/Hash, Vorgänger-ID, interner Entwurf/bereitgestellt, Zeit. |
| `task_showroom_links` | Task-ID, Item-ID, `follow/pinned`, optional Snapshot-ID; Autor/Zeit; eindeutiger Link; Ordnerbezug ist rekursiv. |
| `task_visual_specs` + `task_visual_spec_entries` | Unveränderliche taskbezogene Freigaberevision mit konkreten View-Revisionen, Snapshot/Hashes, Hinweistext, Autor und Zeitpunkt. |
| bestehende Refinements / `showroom_runs` | Eine gemeinsame Job-Quelle mit vorhandener Queue/Lease; Bezug zu Task, Ausgangssnapshots, Feedback-IDs, Zielordner und Ergebnismanifest. Showroom-Run beschreibt das Ergebnis, er ist kein zweiter Scheduler. |
| bestehendes `showroom_feedback` | Bleibt kanonischer Feedback-Speicher; zusätzliche Herkunft/Migrations-ID sowie Bildanker für alte Screens. |

DB-Migrationen mit expliziten Insert-Spalten: heute existieren positionsabhängige `INSERT ... VALUES`-Aufrufe. Projekt-/Task-Fremdschlüssel und Autorisierung verhindern projektfremde Links; API akzeptiert keine unkontrollierten Dateisystempfade. Snapshot-Lebensdauer richtet sich auch nach Links, Vorgaben und Feedback. Das Entfernen eines Links ist keine Löschfreigabe für referenzierte Snapshots.

## API und Ausführung

- `GET /api/projects/:id/showroom/catalog?parentId=&query=` liefert den autorisierten Ordner-/Ansichtskatalog; Pagination, Counts und aktuelle Revisionen, keine Gasttokens.
- `GET/POST /api/tasks/:id/showroom-links`, `PATCH/DELETE /api/tasks/:id/showroom-links/:linkId` verwalten Links; Mehrfachauswahl transaktional und mit Idempotenzschlüssel.
- `POST /api/tasks/:id/showroom-runs` startet/iteriert über die bestehende Refinement-Queue. Historie, Abbruch, Retry und Rückfragen folgen vorhandenen Mustern. Aus dem Showroom wird vor diesem Aufruf ein vorhandener Task gewählt oder explizit einer erstellt.
- `POST /api/tasks/:id/visual-specs` hält View-Revisionen fest; `GET` liefert Historie. Optimistische Prüfung verhindert Freigabe einer inzwischen unerwartet gewechselten Auswahl.
- `POST /api/projects/:id/showroom/runs/:runId/publish` übernimmt ein fertiges Bündel; Preflight nennt Dateien, Konflikte und betroffene Shares. Veröffentlichung prüft den Run, nicht den Abschlussstatus des Implementierungs-Tasks.
- Vorhandene Preview- und Feedback-Routen werden gemeinsam verwendet; ein scoped Listing begrenzt den Task-Viewer auf verknüpfte Inhalte, erweitert aber keine Berechtigung.

Ein exklusiver, erneuerbarer DB-Worktree-Lease pro Task serialisiert Showroom-Entwurf, Text-Refinement und Implementierung. Ein zweiter Lauf wartet, statt denselben Worktree gleichzeitig zu verändern. Wiederholungen nutzen Request-ID und Ergebnismanifest; sie erzeugen keine doppelten Links/Revisionen. Nach einem Fehler bleibt die letzte valide Revision erhalten.

Veröffentlichung validiert ALLE HTML-Dateien und abhängigen Assets vorab, reserviert den Versionspfad, schreibt in einen Staging-Ordner und macht das Bündel erst vollständig sichtbar. DB-/Dateisystem-Übergang braucht ein wiederaufnehmbares Publish-Journal; ein Retry erkennt bereits identische Dateien. Bestehende abweichende Dateien bleiben ein Konflikt. Mitgliedschaft, Pfadgrenzen, CSP, Snapshot-Isolation, Share-Prüfung und Speicherlimits bleiben erhalten. Kein automatisches Commit, Merge, Push oder Deploy des Projektcodes.

## Bestehende Tasks migrieren

1. Links und neuen Tab zunächst additiv einführen. Bestehende visuelle Refinements vollständig lesbar halten; aktive Läufe dürfen im alten Worker fertig werden.
2. Für jeden alten visuellen Lauf eine neue versionierte Collection unter `showroom/<task-key>-visueller-entwurf/` vorbereiten. Screenshots erhalten einfache lokale HTML-Bildansichten mit Titel, ursprünglichem Viewport und Herkunft **App-Screenshot**; sie werden nicht als interaktiver Prototyp ausgegeben.
3. Versionen, ursprüngliche Route, App-/Worktree-Revision, Brief und Umsetzungstext erhalten. Pins über normalisierte Bildkoordinaten migrieren, All-Views-Kommentare mit ihrem ursprünglichen Scope; keine künstlichen DOM-Selektoren erfinden.
4. Alte `appliedAt`-Freigaben auf eine unveränderliche taskbezogene Vorgabe abbilden. Vorhandene Task-Anhänge und IDs/Downloads erhalten; bisherige Links bleiben durch Adapter lesbar.
5. Migration wiederaufnehmbar über eindeutige `(legacyRefinementId, artifactId)`-Zuordnung. Fehlende Artefakte als Problem ausweisen, nicht als erfolgreich migriert markieren. Historische Inhalte zuerst intern halten; Repository-Bereitstellung separat, damit vorhandene öffentliche Shares nichts unerwartet erhalten.
6. Nach Mengen-/Hash-/Referenzprüfung neue Erstellung ausschliesslich über den Showroom aktivieren. Den alten Worker erst nach Drain deaktivieren; Altdaten nicht im selben Release löschen. Rollback: neue Erzeugung abschalten, alte lesbare Historie behalten; keine doppelten schreibenden Pfade.

## Umsetzung in vier Schritten

1. **Katalog und Verknüpfung:** stabile Identitäten, rekursiver Picker, persistenter Task-Tab, gemeinsamer Viewer, Rücklinks und Missing-State. Bestehende Showroom-Dateien sofort nutzbar.
2. **Gemeinsame Entwurfsläufe:** Task-Start, mehrere Ansichten, versionierte lokale Ausgabe, interner Snapshot-Import, gemeinsamer Lease, Feedback-Iteration und gebündeltes Publish.
3. **Vorgaben und Übergabe:** explizite Auswahl, eingefrorene Spezifikation, Änderungsanzeige, Resume und Agent-Auftrag aus genau der freigegebenen Revision.
4. **Altdaten und Ablösung:** idempotente Migration, Kompatibilität, Export/Backup/Import einschliesslich aller neuen Beziehungen, laufende Jobs drainen und altes UI entfernen.

## Abnahme

- Neue Erstellung im existierenden Task erzeugt genau einen Lauf und keinen unerwarteten zweiten Task; drei Ansichten werden zusammen sichtbar, Status des Implementierungs-Tasks bleibt erhalten.
- Ordnerlink enthält später hinzugefügte Ansichten und Unterordner; Einzelansichtslink enthält keine Nachbaransichten. Ordner+Einzelansicht ergibt keine Doppelung.
- Links sind bidirektional, project-scoped und unabhängig vom Erstellungs-Task. Entfernen und Task-Löschung löschen keine geteilten Inhalte.
- Task und Showroom zeigen denselben Snapshot und dasselbe Feedback. Iteration erhält die Zuordnung alter Anker und erledigt Kommentare nicht automatisch.
- Freigegebene V2 bleibt bei V3 exakt gleich; gezieltes Ersetzen erzeugt eine nachvollziehbare Vorgabenrevision.
- Fehlender Pfad, Pfadkollision, ungültiges Manifest, leerer Output, Agent-Ausfall, Publish-Abbruch, paralleler Lauf und Worktree-Cleanup haben wiederaufnehmbare, sichtbare Zustände.
- Gast kann keine internen Entwürfe, Task-Metadaten oder privaten Kommentare sehen. Bereitstellung nennt betroffene bestehende Shares; Widerruf wirkt weiterhin.
- Migration bewahrt Anzahl, Hashes, Pins, Scope, Freigaben und Attachments; Wiederholung erzeugt keine Duplikate. Backup-/Restore round-trip erhält Verknüpfungen und Vorgaben, ohne Shares zu reaktivieren.
- Desktop/Mobil, Tastatur, Fokus-Rückkehr aus Detailansichten, lesbare Zustände und responsive Picker werden im Browser geprüft.

## Prototyp

Der begleitende Chat-Prototyp bildet folgende Pfade interaktiv mit Beispieldaten ab: verknüpfter Task, Auftrag, leerer Task, Erstellen, simulierter Lauf, Review mit Desktop/Mobil und lokalem Einladungsformular, Feedback, Iteration, fixe Vorgabe, Showroom-Gegenansicht, Ordner-/Ansichtspicker, Link entfernen, Bereitstellung und Altbestand-Übernahme. Er ist eine Entscheidungsvorlage; Backend, echte Agent-Läufe und Migration sind noch nicht implementiert.
