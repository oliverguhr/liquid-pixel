# Ergebnisse der acht Optimierungsversuche

Stand: 9. November 2026. Ausgangspunkt ist der Spielcode aus `fc8b77f`.
Alle acht vorgeschlagenen Schritte wurden einzeln implementiert und gemessen.
Sieben bleiben erhalten; der Cache für sortierte Hindernisberichte wurde nach
zwei Messreihen wieder entfernt. Die Leuchteffekte bleiben sichtbar erhalten.

Die anschließenden Versuche mit Richtungscache und adaptivem Mesh stehen
separat in [navigation-performance-results.md](navigation-performance-results.md).
Die folgenden Zahlen dokumentieren den Abschluss der ersten acht Schritte.

## Gesamtwirkung

Der abschließende direkte Modellvergleich verwendet identische Eingaben,
Seed 123 und 2.000 Partikel. Drei Wiederholungen je Version laufen abwechselnd
in getrennten Node-Prozessen, mit Aufwärmphase und ohne CPU-Stichprobenprofiler:

| Szenario | Vorher, ms/Halbschritt | Nachher, ms/Halbschritt | Weniger Rechenzeit |
| --- | ---: | ---: | ---: |
| Stehende Ziele | 9,43 | 5,68 | 39,7 % |
| Bewegte Ziele | 19,35 | 12,65 | 34,7 % |
| Kontakt | 8,29 | 4,95 | 40,3 % |

Die Darstellung wird auf demselben pausierten Weltzustand verglichen. Je
Version und Pixeldichte werden drei Messfenster mit abwechselnder Reihenfolge
ausgeführt; pro Fenster werden nach 15 Aufwärmbildern 45 Bilder gemessen:

| Pixeldichte | Vorher, ms/Bild | Nachher, ms/Bild | Weniger Zeichenzeit |
| --- | ---: | ---: | ---: |
| 2 (1600×1600) | 15,49 | 7,72 | 50,2 % |
| 3 (2400×2400) | 25,64 | 7,50 | 70,7 % |

Die Leuchtebene hat für die normale 800×800-Welt 400×400 Pixel. Ihre weichen
Lichtflächen werden einmal hochskaliert und additiv eingeblendet. Partikelkerne,
Hindernisse und Cursor behalten die bisherige hohe Auflösung. Die Bilder
`artifacts/performance/glow-before.png` und `glow-after.png` wurden verglichen;
das Leuchten beider Teams bleibt sichtbar, die Kerne bleiben scharf.

Im normalen Zwei-Client-Lauf wurden zusätzlich **421 gemeinsame Berichte**
ohne Abweichung und ohne Browserfehler geprüft. Die Bildrate bei bewegten
Zielen steigt dort von etwa **19 auf 23 FPS**; die Zeichenzeit sinkt von rund
16 auf 8 ms. Bei stehenden Zielen bleibt die Bildrate bei ungefähr 32 FPS.
Die Simulation läuft weiterhin mit ungefähr 60 Halbschritten pro Sekunde.
Die isolierten CPU-Einsparungen sind also keine gleich große FPS-Steigerung.

Wichtige Grenze: Der automatisierte Chromium-Browser verwendet weiterhin
Software-Rendering/SwiftShader; zwei Testclients laufen auf demselben Rechner.
Die Zahlen sind keine FPS-Zusage für den Browser des Nutzers. Ein erneuter
Notebook-Test mit dessen Grafikbeschleunigung bleibt zur praktischen
Beurteilung sinnvoll. Der Server benötigt im optimierten Live-Lauf ungefähr
1,9 % eines CPU-Kerns für ein Match.

## Entscheidung je Schritt

Die Modellwerte beziehen sich jeweils auf den unmittelbar vorherigen Stand.
Die Prozentwerte lassen sich nicht addieren. Kleine Unterschiede außerhalb
des betroffenen Bereichs werden als Messschwankung behandelt, nicht als
zusätzlicher Nutzen verkauft.

| Nr. | Versuch | Messung | Entscheidung |
| --- | --- | --- | --- |
| 1 | Separate Leuchtebene mit geringerer Auflösung | 15,49 → 7,72 ms bei Dichte 2; 25,64 → 7,50 ms bei Dichte 3. | **Behalten.** Deutlicher Gewinn, kleine Erweiterung des vorhandenen Canvas-Renderers, Leuchten bleibt erhalten. |
| 2 | Begehbare Nachbarn vorberechnen | Bewegte Ziele 20,63 → 19,85 ms (−3,8 %); Kontakt 8,83 → 8,25 ms (−6,5 %). Stehende Ziele im Mittel +3 %, mit einem Ausreißer. | **Behalten.** Kleinerer Gewinn als erwartet, aber Verbesserung in Bewegung und Kontakt; Erneuerung erfolgt gebündelt beim vorhandenen Geometrieaufbau. |
| 3 | Minimumsuche für den Hauptnachbarn | Stehend −26,6 %, bewegt −13,5 %, Kontakt −24,5 %. | **Behalten.** Eine vollständige Sortierung entfällt; die nachfolgende Kandidatenreihenfolge bleibt identisch. |
| 4 | Sortierschlüssel einmal pro Runde | Stehend −13,1 %, bewegt −11,5 %, Kontakt −15,8 %. | **Behalten.** Lokale Datensätze enthalten Partikel, Band und Priorität; kein zusätzlicher dauerhafter Simulationszustand. |
| 5 | Numerischer Entfernungscache | Bewegte Ziele 15,41 → 13,63 ms (−11,6 %); andere Szenarien kaum verändert. | **Behalten.** Der Schlüssel ist die quadrierte skalierte Länge. Gleich lange Vektoren verwenden dasselbe exakte Ergebnis; Textschlüssel entfallen. |
| 6 | Freie Zielzelle direkt verwenden | Bewegte Ziele 12,92 → 12,32 ms (−4,6 %); Kontakt praktisch unverändert. | **Behalten.** Kurzer Sonderfall; für Ziele in Wänden und andere Komponenten bleibt die bisherige Suche bestehen. |
| 7 | Sortierte Hindernisse für Berichte cachen | Berichte etwa 0,65–0,69 → 0,47–0,51 ms. Im Gesamtlauf kein stabiler Vorteil; bewegte Simulation in beiden Messreihen etwa 1,5–2,4 % langsamer. | **Verworfen.** Die lokale Einsparung von rund 0,2 ms je Bericht rechtfertigt bei unklarem Gesamtnutzen keinen weiteren Cache samt Erneuerungsregeln. `MatchSimulation.js` bleibt unverändert. |
| 8 | Unveränderte Online-Anzeigen überspringen | Isoliert 0,00379 → 0,00033 ms/Aufruf; im Live-Profil nur wenige Tausendstel Millisekunden pro Aufruf. | **Behalten.** Absolut kleiner Gewinn, aber nur vier zusätzliche Zeilen nach dem bestehenden UI-Muster; wechselnde Anzeigen bleiben identisch. |

Für Schritt 7 sind sechs Vergleichspaare vorhanden, für die anderen
Modellschritte jeweils drei. Der isolierte UI-Vergleich umfasst fünf Paare
mit je 3.000 Aufrufen und regelmäßigen Wechseln von Phase, Verbindung,
Spielerzahlen und Meldung. Er prüft die resultierenden DOM-Zustände auf
Gleichheit. Die Größenordnung dieses Mikrobenchmarks ersetzt keine
Bildratenmessung.

Die größere Reserveidee einer groben Wegplanung mit lokalen Feldern wurde
nicht eingebaut. Die beauftragten acht Versuche kommen mit kleinen lokalen
Änderungen aus; zusätzliche Wegfindungsarchitektur ist dafür nicht nötig.

## Verhaltens- und Synchronitätsprüfung

Jeder Modellvergleich prüft die Berichte aller 180 Eingabebatches und die
vollständigen Zustände am Ende der drei Phasen. Das gilt auch für den
Gesamtvergleich gegen den Ausgangsstand. Die Rendervergleiche prüfen, dass
der vollständige Modellzustand durch das Zeichnen nicht verändert wird.

Zusätzliche Regressionen prüfen, dass beide Wegfelder nach Malen und Löschen
des Geländes bei gleichbleibenden Zielen erneuert werden, und dass beide
Teams Licht außerhalb ihrer Partikelkerne zeigen. Nach Entfernen der
Partikel darf kein alter Lichtabdruck stehen bleiben.

Die Protokollversion bleibt `liquid-pixel-lockstep-2`: Die Optimierungen
verändern keine Regeln, und die Vergleichsläufe liefern identische Zustände.
Abschließend bestanden **60 Modell-/Servertests und alle 45 Browserfälle**.
Die Browserfälle umfassen Chromium, Firefox, WebKit und Node mit identischen
vollständigen Zuständen, gemischte Browser-Matches, Eingabeverzögerung,
unterschiedliche Renderfrequenzen sowie einen vollständigen Online-Sieg
mit Rückkehr zur Lobby. Es gibt keine übersprungenen oder erwarteten Fehler.

Die zusätzliche normale Match-Aufnahme beendet das Spiel auf beiden Clients
bei Tick 585 mit Hash `352f8c90ddf40a2c` und Teamzahlen `[2000, 0]`.
Die vollständigen Endzustände stimmen überein, beide Sitzungen kehren in die
Lobby zurück. Bilder und Videos liegen unter `artifacts/multiplayer-preview/`.

Auch das lange ursprüngliche Replay mit 2.160 Halbschritten liefert dieselben
Berichte wie vor der Optimierung, einschließlich der drei Referenzhashes:
`cf0f7e67d2be652f`, `1b968c079d4f4fa7`, `6dc9f598d7ae198c`.
Die Mittelwerte dieses längeren Laufs sind 5,13 / 12,00 / 5,02 ms je
Halbschritt. Für die Prozentvergleiche oben wird der direkt abwechselnd
gemessene A/B-Lauf verwendet, nicht die Differenz zweier zeitlich ferner Läufe.

## Messungen nachvollziehen

Die ursprüngliche [Analyse](performance-analysis.md) beschreibt den
Messrechner und die zuerst gefundenen Engpässe. Die Rohdaten und gespeicherten
Codefassungen liegen git-ignoriert unter `artifacts/performance/`:

- `glow-comparison.json`: Darstellung vorher/nachher, inklusive GPU-Metadaten.
- `step-2-neighbours.json` bis `step-6-direct-target.json`: Einzelversuche.
- `step-7-terrain-report.json` und `step-7-terrain-report-repeat.json`: verworfener Versuch.
- `step-8-ui.json`: Statusanzeigen und verglichene DOM-Zustände.
- `combined-model.json`: direkter Gesamtvergleich mit vollständigen Zuständen.
- `baseline-isolated.json` und `optimized.json`: normale Zwei-Client-Läufe.
- `versions/`: Zwischenstände als JavaScript-Dateien für erneute Vergleiche.

Beispiele mit den vorhandenen lokalen Zwischenständen:

```bash
npm run compare:model -- artifacts/performance/versions/baseline . combined-model
npm run compare:rendering -- artifacts/performance/versions/baseline/Renderer.js
npm run compare:ui -- artifacts/performance/versions/step-6/Game.js
npm run profile:multiplayer -- optimized
```

Die Vergleichsbefehle akzeptieren auch andere vollständige Modellverzeichnisse
beziehungsweise die jeweilige frühere Renderer-/Game-Datei. Die lokalen
Zwischenstände sind keine Voraussetzungen zum Starten des Spiels und werden
nicht ins Repository aufgenommen. Für den Ausgangsstand lassen sich die
Modell-Dateien aus Commit `fc8b77f` exportieren.

Browserbefehle benötigen Playwright-Chromium; in dieser Umgebung zusätzlich
`PLAYWRIGHT_BROWSERS_PATH=/tmp/liquid-pixel-browsers`. Messungen nacheinander
und ohne parallele Tests laufen lassen. Alle Zeitangaben sind Beobachtungen,
keine geräteabhängigen Pass-/Fail-Grenzen für die Testsuite.
