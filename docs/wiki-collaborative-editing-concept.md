# AGENTKANBAN-25: Kollaboratives Bearbeiten von Wiki-Seiten

## Ausgangslage

Die Wiki-Seite wird heute in `ProjectWiki.vue` als kompletter Markdown-String bearbeitet. Beim Speichern ersetzt ein `PATCH /api/wiki-pages/:pageId` den gesamten Inhalt; `expectedUpdatedAt` verhindert lediglich, dass eine inzwischen geänderte Seite überschrieben wird. Leser erhalten Änderungen über ein Fünf-Sekunden-Polling, während dieses Polling im Bearbeitungsmodus bewusst deaktiviert ist.

Damit ist die aktuelle Lösung sicher gegen stilles Überschreiben, aber nicht für gleichzeitiges Bearbeiten geeignet.

## Empfohlenes Zielbild

Für den Seiteninhalt sollte Tiptap Collaboration auf Basis von Yjs verwendet werden. Yjs löst gleichzeitig eintreffende Textänderungen konfliktfrei zusammen; das bestehende Markdown bleibt als kompatibler, regelmäßig erzeugter Snapshot für Suche, Exporte, Agenten und die bestehende REST-API erhalten.

Leser und Bearbeiter öffnen dasselbe kollaborative Dokument:

1. Die Wiki-Ansicht lädt einen gemeinsamen Yjs-Zustand der Seite; Lese- und Bearbeitungseditor verwenden beim Umschalten dasselbe Dokument.
2. Lokale Tiptap-Transaktionen werden als kleine Yjs-Updates an den Server geschickt und sofort an alle verbundenen Clients verteilt.
3. Der Client bündelt lokale Änderungen kurz; der Server übernimmt jedes Batch atomar in einen kompakten Yjs-Gesamtzustand und aktualisiert dabei den bestehenden Markdown-Snapshot in `wiki_pages.content`.
4. Der Read-only-Modus verwendet denselben synchronisierten Editor mit `editable: false`; damit erscheinen Änderungen ohne Polling und ohne Scroll-Sprung.

Für die aktuelle Ein-Node-Produktion reicht ein pro Seite geführter In-Memory-Hub. Als Transport passt eine Kombination aus SSE und gebündelten HTTP-POSTs gut zur bestehenden Infrastruktur: SSE verteilt Updates, Presence und Locks; POST nimmt lokale Updates entgegen. Bei einer späteren horizontalen Skalierung kann derselbe Hub durch Redis/PubSub ersetzt werden.

## Fein granularer Lock

Zusätzlich zum CRDT wird ein **Soft-Lock als kurzlebige Lease pro sinnvoller Bearbeitungseinheit** verwendet:

- Absätze, Überschriften und andere eigenständige Blöcke erhalten im Yjs-Dokument eine stabile `collabId`; Tabellenzeilen und einzelne Listeneinträge erhalten zusätzlich je eine eigene ID. Die IDs müssen nicht im sichtbaren Markdown stehen.
- Sobald der Cursor eine Einheit verändert, fordert der Client dafür eine Lease an. In Tabellen wird nur die aktuelle Zeile, in Listen nur der aktuelle Eintrag reserviert; der Seitentitel verwendet die feste ID `meta:title`.
- Die Lease wird etwa alle fünf Sekunden erneuert und läuft nach circa 15 Sekunden oder beim Disconnect aus.
- Andere Nutzer sehen Name/Farbe am Block und können ihn lesen, aber nicht versehentlich bearbeiten. Andere Blöcke der Seite bleiben frei.
- Avatare und Bearbeitungsindikatoren zeigen zusätzlich, wer gerade auf der Seite aktiv ist.

Der Lock ist bewusst eine UX-Schutzschicht; Yjs bleibt die Daten-Sicherheitsbasis, falls zwei Clients durch Netzunterbruch dennoch gleichzeitig denselben Block ändern. Ein vollständig serverseitig erzwungener Hard-Lock wäre mit opaken Yjs-Updates unverhältnismäßig aufwendig. Falls Hard-Locking zwingend wird, müsste der Inhalt in separat persistierte Blöcke zerlegt werden, was Markdown-Kompatibilität, Listen und Tabellen deutlich komplizierter macht.

## Server- und Datenmodell

Vorgesehen wären im Kern:

- `wiki_collaboration_documents`: `page_id`, kompakter binärer Yjs-Zustand, Dokumentgeneration, Quellrevision und Snapshot-Zeitpunkt. Der Gesamtzustand macht ein separates Update-Log für die aktuelle Ein-Node-Produktion unnötig.
- Ein `wiki-collaboration`-Service mit authentifizierten Sessions, Seitenberechtigungsprüfung, Größen-/Ratenlimits, Presence, Leases und sauberem Shutdown über die vorhandene Stream-Verwaltung.
- Endpunkte für Session/Initial-Sync, SSE-Events, Update-Batches sowie Lease anfordern/erneuern/freigeben.

`wiki_pages.content`, `updatedAt` und `updatedBy` bleiben bestehen. Der Server erzeugt pro angenommenem, clientseitig gebündeltem Update einen kanonisierten Markdown-Checkpoint. Activity-Einträge werden serverseitig entprellt, damit nicht jeder Tastendruck einen Eintrag erzeugt.

Die bestehende REST-API darf keine zweite Wahrheit erzeugen: Ein `PATCH` invalidiert eine aktive Dokumentgeneration und lässt verbundene Clients kontrolliert auf den neuen REST-Stand wechseln. Ohne aktive Session bleibt der heutige Pfad unverändert. Bilder und wiederverwendbare TODO-Listen behalten ihre eigenen Ressourcen und Revisionsprüfungen.

## UX-Änderung

Echtzeitbearbeitung bedeutet Autosave. Der heutige Button „Abbrechen“ kann Änderungen daher nicht mehr still verwerfen; er sollte zu „Bearbeitung beenden“ werden. Die Oberfläche zeigt stattdessen Verbindungszustand, „Synchronisiert“/„Offline – Änderungen ausstehend“, aktive Personen und blockbezogene Locks. Undo/Redo bleibt pro Benutzer über den Yjs-Undo-Manager möglich.

## Sinnvolle Umsetzung in drei Schritten

1. Yjs-Dokument, Transport, Persistenz und Live-Read-only-Modus einführen; Markdown-Snapshots und bestehende API kompatibel halten.
2. Presence, kollaborative Cursor und Block-Leases ergänzen.
3. Reconnect/Offline-Verhalten, REST-/Agenten-Updates, Limits und Mehrbenutzer-E2E-Tests härten.

Wichtige Abnahmeszenarien sind: zwei Nutzer bearbeiten verschiedene Blöcke; zwei Nutzer wählen denselben Block; ein Leser sieht Änderungen live; ein abgebrochener Client verliert seine Lease; Serverneustart/Reconnect verliert keine Änderung; und ein Agenten- oder REST-Update erscheint in einer bereits geöffneten Seite.
