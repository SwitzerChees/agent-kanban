# Konzept: Visuelles Refinement

## Ziel

Ein visuelles Refinement ist ein eigener Arbeitsmodus innerhalb eines Tasks. Es setzt eine UI-Idee in einem isolierten Task-Worktree um, startet die echte Anwendung und speichert gerenderte Screens als versionierte Artefakte. Das Review, punktgenaues Feedback, weitere Iterationen und die Freigabe bleiben im Task nachvollziehbar.

Der Modus ersetzt das bestehende Text-Refinement nicht. Beide Einstiege liegen auf derselben Ebene:

- **Text refinen:** erzeugt einen belastbaren Implementierungsauftrag.
- **UI entwerfen:** erzeugt echte App-Screens und eine visuelle Spezifikation.

## Kernablauf

1. **Start:** Brief, Zielansichten und Viewports festlegen. Offene Task-Änderungen werden wie beim bestehenden Refinement zuerst gespeichert.
2. **Render:** Ein Agent arbeitet im persistenten Task-Worktree, startet die App auf einem isolierten Port und rendert die vereinbarten Zustände.
3. **Review:** Screens als Artefakte ansehen, zwischen Desktop/Mobile/Zuständen wechseln und – wenn vorhanden – mit dem Ausgangsstand vergleichen.
4. **Feedback:** Einen Änderungswunsch für die aktuelle Ansicht oder global für alle Ansichten schreiben. Optional lässt sich ein Pin direkt auf dem Screen setzen. Feedback ist an Scope, Artefakt und Version gebunden.
5. **Iteration:** Alle offenen Kommentare werden als strukturierte Folgeanweisung an denselben Worktree übergeben. Eine neue Version referenziert ihre Vorgängerversion.
6. **Übernahme:** Ausgewählte Screens werden zu normalen Task-Anhängen. Umsetzungshinweise und Akzeptanzkriterien erscheinen in der neuen Beschreibungsansicht **Visuelle Umsetzung**. Der temporäre Arbeits-Tab verschwindet.
7. **Wiederaufnahme:** Ist die freigegebene Richtung noch nicht gut genug, öffnet **Entwurf wieder aufnehmen** den Arbeits-Tab erneut mit der letzten Version und ihrem Feedback.

Der Haupt-Tab **Visueller Entwurf** ist damit kein dauerhaft leerer Bereich. Er erscheint erst nach der Auswahl **UI entwerfen**, bleibt während Review und Iteration sichtbar und verschwindet wieder nach der Übernahme.

## Aktionen in der Oberfläche

### Vor dem Lauf

- Visuellen Entwurf starten
- Desktop, Mobile sowie Leer-/Fehlerzustände auswählen
- Optional konkrete Routen oder Zustände ergänzen
- Bestehende Task-Anhänge als Referenz mitgeben

### Im Review

- Screen auswählen und Original öffnen
- Mit dem Ausgangsstand vergleichen (Split View)
- Feedback für die aktuelle oder alle Ansichten hinzufügen
- Optional einen Pin setzen, um den Bezug innerhalb eines Screens zu präzisieren
- Kommentar erledigen oder wieder öffnen
- Neue Iteration aus allen offenen Kommentaren starten
- Fehlgeschlagenen Render erneut versuchen

### Bei der Freigabe

- In Task übernehmen
- Neue Beschreibungsansicht **Visuelle Umsetzung** ergänzen, Original und Text-Refinement nicht still überschreiben
- Screenshot-Artefakte als normale Task-Dateien anhängen
- Wiederaufnahme aus **Visuelle Umsetzung** ermöglichen
- Worktree-Commit und App-Revision zur späteren Umsetzung festhalten

## Technische Integration

### Bestehende Bausteine weiterverwenden

- Status-, Queue-, Lease- und Versionslogik aus `task_refinements`
- persistenter Task-Worktree unter `.data/worktrees/<project-id>/<task-id>/tree`
- bestehende Attachment-Speicherung und Download-Routen
- Kommentar-Autorisierung, Activity-Log und Refinement-Polling
- bestehender Apply-Flow für eine abgeleitete Markdown-Spezifikation

### Datenmodell erweitern

- `task_refinements.kind`: `text | visual`
- `task_refinement_artifacts`: private Render-Dateien vor der Übernahme; sichtbare Metadaten wie Route, Viewport, Dimensionen und optionaler Ausgangs-Screen liegen versioniert am Refinement
- visuelle Kommentaranker: Artefakt-ID plus normalisierte `x/y`-Koordinaten oder Region; Textkommentare behalten ihre bestehenden Text-Offsets
- Freigabe: übernommene Artefakte, freigegebene Version und Übernahmezeitpunkt
- Render-Metadaten: Worktree-Revision und Ausgangsrevision

### API-Schnittstellen

- `POST /api/tasks/:taskId/refinements` mit `kind: "visual"`, Brief und Capture-Scope
- `GET /api/tasks/:taskId/refinements/:id/artifacts/:artifactId`
- `POST /api/tasks/:taskId/refinements/:id/visual-comments`
- `PATCH /api/tasks/:taskId/refinements/:id/visual-comments/:commentId`
- `POST /api/tasks/:taskId/refinements` mit `parentRefinementId` für eine Iteration aus offenen Kommentaren
- `POST /api/tasks/:taskId/refinements/:id/apply`

### Agent- und Browser-Lauf

- Nie im Haupt-Worktree und nie auf Produktionsport 3000 arbeiten.
- Den task-eigenen Worktree für jede Iteration wiederverwenden; jede Version erhält einen nachvollziehbaren Commit.
- App mit kopierter/gesicherter Testdatenbank oder definierten Fixtures starten.
- Viewports und Zustände deterministisch rendern; Browser- und Console-Fehler als Laufdiagnostik speichern.
- Screens vor der Freigabe auf sichtbare Secrets und personenbezogene Daten prüfen.
- Bei Übernahme bleibt der Worktree für die spätere Implementierung erhalten. Erst beim Abschluss des Tasks greift die bestehende saubere Worktree-Aufräumlogik.

## Statusmodell

`idle → queued → running → completed/review → applied`

Zusätzlich: `awaiting_input`, `failed` und `cancelled`. Ein fehlgeschlagener Render verändert weder Task noch letzte freigegebene Version.

## Umgesetzter Stand

Der Arbeitsmodus ist persistent umgesetzt. Der Agent arbeitet im task-eigenen Worktree, das Review nutzt private Refinement-Artefakte, Feedback und Pins werden autorisiert gespeichert, Iterationen übernehmen offene Kommentare und die Freigabe kopiert die finalen Screens in die normalen Task-Anhänge. Das Text-Refinement verwendet denselben temporären Arbeits-Tab-Lifecycle.
