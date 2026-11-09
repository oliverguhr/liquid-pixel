# Moderne Darstellung und Auflösung

Die Bewegungsüberarbeitung wurde vom Nutzer vorerst akzeptiert. Diese
Änderung betrifft deren Darstellung und die Benutzeroberfläche.

## Ergebnis

- Scharfe Canvas-Ausgabe mit mindestens 1600×1600 tatsächlichen Bildpunkten.
  Bei `devicePixelRatio = 3` werden 2400×2400 Bildpunkte verwendet.
- Responsive Anzeige derselben 800×800-Welt, unabhängig von der Pixeldichte.
- Abgerundete, schattierte Einzelpunkte in Türkis, zurückhaltendes Leuchten,
  kontrastierende Hinderniskanten und ein dezentes Hintergrundraster.
- Ergänzung vom 9. November: Klar getrennte runde Punkte nach dem Vorbild der
  Lobby. Der Kernradius beträgt 27 % der Zellbreite statt bisher 37 %; das
  erhaltene Leuchten ist schwächer, damit die Zwischenräume sichtbar bleiben.
- Dunkle Oberfläche mit Einheitenzähler, Spawn, Pause/Fortsetzen, Terrain
  löschen, Status und kurzen Bedienhinweisen.
- Präzise Pointer-Eingaben über die tatsächliche Canvas-Geometrie. Die bei
  skaliertem Canvas ungenauen ganzzahligen MouseEvent-Koordinaten werden nicht
  für die Weltumrechnung verwendet. Auch die Ecken bleiben erreichbar; der
  abgerundete Rahmen schneidet das Spielfeld nicht ab.

## Trennung von Darstellung und Spielregeln

`Renderer.js` liest den Zustand und zeichnet in die hochauflösende Oberfläche.
Partikelkörper passen in ihre Kollisionszellen; ihr transparenter Halo ist
rein optisch. Geometrie und Punkt-Sprites werden zwischengespeichert.
Bewegung, Kreisform, individuelle Takte, Seed und Rasterbelegung bleiben
Aufgaben des vorhandenen Modells. Mehrfaches Neuzeichnen wird im Browser auf
einen unveränderten Modellzustand geprüft.

Für die zuvor leicht achteckige Außenform wurde am 9. November zusätzlich
die seitliche Ausweichregel im Modell eingegrenzt. Kleine Umwege bleiben
erlaubt; größere Schritte vom Ziel weg entfallen. Das ist eine Änderung
der Spielregeln mit eigener Protokollversion, keine optische Verformung der
Partikelpositionen. Nachweise stehen in [movement-validation.md](movement-validation.md).

Die Weltauflösung und Partikelzahl werden durch HiDPI nicht vergrößert. Die
zusätzlichen Bildpunkte dienen der feineren, geglätteten Ausgabe. Terrain
löschen ist eine eigene, explizite Aktion, die freie Wege wiederherstellt und
die vorhandenen Einheiten erhält.

## Prüfung

- Die bisherigen 28 Browserfälle zur Bewegung bestehen mit der neuen Ansicht
  und der auf CSS-Skalierung angepassten Maussteuerung.
- Drei neue Darstellungsfälle prüfen Desktop (1440×1040), schmale Ansicht
  (390×844), Pixeldichte 3, genaue Weltkoordinaten, fehlenden horizontalen
  Überlauf, Pause/Fortsetzen, Zähler, Löschen und zustandsneutrales Zeichnen.
- 23 Unit-Tests bestehen, darunter das Wiederöffnen einer versiegelten Karte
  nach dem Löschen von Hindernissen.

```bash
npm test -- --runInBand
npm run test:browser
npm run test:browser -- presentation.spec.js
```

Die Browserprüfungen schreiben die vollständigen Vorschauen nach
`artifacts/ui-preview/desktop.png` und `artifacts/ui-preview/mobile.png`.
Für eine laufende Aufnahme kann `npm run play:preview` verwendet werden.
Die generierten Artefakte werden nicht committet.

Nachprüfung vom 9. November für die runden Punkte und die rundere Außenform:
Alle 68 Modell-/Serverprüfungen und alle 45 Browserfälle bestehen, einschließlich
vollständiger Übernahme, Rückkehr zur Lobby sowie gleicher Zustände in Chromium,
Firefox, WebKit und Node. Leuchten, HiDPI und schmale Ansichten bleiben geprüft.
Vorher-/Nachher-Bilder der Partikel sowie die ruhende und bewegte Wolke liegen
unter `artifacts/round-preview/`. Wiederholtes Zeichnen erhält den Modellzustand.
Der LAN-Server auf Port 4173 wurde mit Protokollversion 3 neu gestartet und
per HTTP und WebSocket geprüft. Beide Browser müssen neu geladen werden.
