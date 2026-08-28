# Konzept: Visuelles Refinement

## Ziel

Ein visuelles Refinement ist ein eigener Arbeitsmodus innerhalb eines Tasks. Es setzt eine UI-Idee in einem isolierten Task-Worktree um, startet die echte Anwendung und speichert gerenderte Screens als versionierte Artefakte. Das Review, punktgenaues Feedback, weitere Iterationen und die Freigabe bleiben im Task nachvollziehbar.

Der Modus ersetzt das bestehende Text-Refinement nicht. Beide Einstiege liegen auf derselben Ebene:

- **Text refinen:** erzeugt einen belastbaren Implementierungsauftrag.
- **UI entwerfen:** erzeugt echte App-Screens und eine visuelle Spezifikation.

## Kernablauf

1. **Start:** Brief, Zielansichten und Viewports festlegen. Offene Task-Änderungen werden wie beim bestehenden Refinement zuerst gespeichert.
2. **Render:** Ein Agent arbeitet im persistenten Task-Worktree, startet die App auf einem isolierten Port und rendert die vereinbarten Zustände.
3. **Review:** Screens als Artefakte ansehen, zwischen Desktop/Mobile/Zuständen wechseln, zoomen und mit dem Ausgangsstand vergleichen.
4. **Feedback:** Einen Pin direkt auf einen Screen setzen, Kommentar schreiben, auflösen oder wieder öffnen. Feedback ist an Artefakt und Version gebunden.
5. **Iteration:** Alle offenen Kommentare werden als strukturierte Folgeanweisung an denselben Worktree übergeben. Eine neue Version referenziert ihre Vorgängerversion.
6. **Übernahme:** Ausgewählte Screens, offene Umsetzungshinweise und abgeleitete Akzeptanzkriterien werden als aktive visuelle Spezifikation in den Task übernommen. Originalbeschreibung und frühere Versionen bleiben erhalten.

## Aktionen in der Oberfläche

### Vor dem Lauf

- Visuellen Entwurf starten
- Desktop, Mobile sowie Leer-/Fehlerzustände auswählen
- Optional konkrete Routen oder Zustände ergänzen
- Bestehende Task-Anhänge als Referenz mitgeben

### Im Review

- Screen auswählen, Original öffnen und zoomen
- Mit dem Ausgangsstand vergleichen (Split View)
- Pin setzen und Feedback hinzufügen
- Kommentar erledigen oder wieder öffnen
- Einzelnen Screen für die spätere Übernahme ein-/ausschliessen
- Neue Iteration aus allen offenen Kommentaren starten
- Fehlgeschlagenen Render erneut versuchen

### Bei der Freigabe

- In Task übernehmen
- Freigegebene Version und Screens explizit auswählen
- Task-Beschreibung als visuelle Spezifikation ergänzen, nicht still überschreiben
- Artefakte als Task-Dateien referenzieren
- Worktree-Commit und App-Revision zur späteren Umsetzung festhalten

## Technische Integration

### Bestehende Bausteine weiterverwenden

- Status-, Queue-, Lease- und Versionslogik aus `task_refinements`
- persistenter Task-Worktree unter `.data/worktrees/<project-id>/<task-id>/tree`
- bestehende Attachment-Speicherung und Download-Routen
- Kommentar-Autorisierung, Activity-Log und Refinement-Polling
- bestehender Apply-Flow für eine abgeleitete Markdown-Spezifikation

### Datenmodell erweitern

- `task_refinements.kind`: `brief | visual`
- `task_refinement_artifacts`: Refinement-ID, Version, Route, Viewport, Zustand, Datei, Dimensionen, Reihenfolge und optional Vorgänger-Artefakt
- visuelle Kommentaranker: Artefakt-ID plus normalisierte `x/y`-Koordinaten oder Region; Textkommentare behalten ihre bestehenden Text-Offsets
- Auswahl/Freigabe: übernommene Artefakte, freigegebene Version und Übernahmezeitpunkt
- Render-Metadaten: Worktree-Commit, Ausgangsrevision, Port-/Fixture-Profil und Capture-Protokoll

### API-Schnittstellen

- `POST /api/tasks/:taskId/refinements` mit `kind: "visual"`, Brief und Capture-Scope
- `GET /api/tasks/:taskId/refinements/:id/artifacts`
- `POST /api/tasks/:taskId/refinements/:id/artifacts/:artifactId/comments`
- `PATCH .../comments/:commentId` für Text und Status
- `POST /api/tasks/:taskId/refinements/:id/iterations` aus offenen Kommentaren
- `POST /api/tasks/:taskId/refinements/:id/apply` mit ausgewählten Artefakten

### Agent- und Browser-Lauf

- Nie im Haupt-Worktree und nie auf Produktionsport 3000 arbeiten.
- Den task-eigenen Worktree für jede Iteration wiederverwenden; jede Version erhält einen nachvollziehbaren Commit.
- App mit kopierter/gesicherter Testdatenbank oder definierten Fixtures starten.
- Viewports und Zustände deterministisch rendern; Browser- und Console-Fehler als Laufdiagnostik speichern.
- Screens vor der Freigabe auf sichtbare Secrets und personenbezogene Daten prüfen.
- Bei Übernahme bleibt der Worktree für die spätere Implementierung erhalten. Erst beim Abschluss des Tasks greift die bestehende saubere Worktree-Aufräumlogik.

## Statusmodell

`idle → queued → running → review → iterating → review → approved`

Zusätzlich: `awaiting_input`, `failed` und `cancelled`. Ein fehlgeschlagener Render verändert weder Task noch letzte freigegebene Version.

## Prototypgrenze

Der aktuelle Stand implementiert den vollständigen Interaktionsentwurf im echten Task-Dialog mit lokalen Demo-Zuständen. Persistenz, Agent-Orchestrierung, neue API-Routen und Datenbankmigrationen sind bewusst noch nicht umgesetzt.
