# Task × Showroom: interaktiver Konzeptprototyp

Dieser Prototyp ergänzt `docs/task-showroom-unification-concept.md`. Er enthält lokale Beispieldaten, simulierte Agent-Läufe und keine Backend-Verbindung. Er verändert weder Tasks noch Showroom-Dateien im produktiven System.

- `source.html`: editierbares Fragment für die interaktive Darstellung im Chat.
- `preview.html`: vom Visualize-Renderer erzeugte Browser-Vorschau im isolierten iframe.
- Screenshots: `artifacts/task-showroom/`.

## Durchklicken

1. Im initialen Task **Einladung** öffnen; Desktop/Mobil, Einladungsformular und Feedback ausprobieren.
2. **Als Vorgabe festhalten** → **Vorgabe festhalten** zeigt die unveränderliche Referenz im Auftrag.
3. **Vorgabe öffnen** → **Neue Iteration** → **Iteration starten**: V3 entsteht, V2 bleibt die Umsetzungsvorgabe.
4. **Verknüpfen** zeigt Ordner- und Einzelansichtsauswahl mit Suche, Mehrfachauswahl und Versionsbindung.
5. Szenario **Task ohne Entwurf** → **Im Showroom entwerfen** zeigt Erstellung, lokale Validierung und simulierten Lauf.
6. **Im Projekt bereitstellen** zeigt die Auswirkungen auf bestehende Freigaben.
7. Szenario **Task mit Altbestand** zeigt die Übernahme von App-Screens und der bisherigen Vorgabe.

## Prüfung am 18.09.2026

Mit agent-browser in Chromium geprüft:

- Ordner verknüpft: Zähler steigt von 4 auf 6; Einzelansicht zusätzlich mit fixierter Version: 7.
- Pflichtfeldvalidierung; Erstellung aus leerem Task; Feedback inklusive visueller Markierung.
- Vorgabe gespeichert; nach Iteration V3 bleibt V2 im Auftrag erhalten.
- Bereitstellen zeigt betroffenen Share; simulierte Altbestand-Übernahme behält Vorgabe und Bildkennzeichnung.
- Darstellung bei 1024/1100, 390 und 320 Pixeln; kein horizontaler Seitenüberlauf, kleine Navigation angepasst.
- Helle und dunkle Darstellung geprüft; automatisierter WCAG-A/AA-Scan von Task-Übersicht und Review ohne gemeldete Verstösse. Dieser Scan ersetzt kein vollständiges Barrierefreiheits-Audit.
- Keine Laufzeitfehler im Browser. Fragment unter 1 MB und Browser-Vorschau auch im Sandbox-iframe geöffnet.

Keine Produktionscode-Änderung, kein Nuxt-Build und kein Service-Neustart notwendig. Der Prototyp demonstriert UI-Verhalten; persistente Versionen, Berechtigungen, echte Agenten, Publish-Transaktionen und die Datenmigration sind Gegenstand des Umsetzungskonzepts.
