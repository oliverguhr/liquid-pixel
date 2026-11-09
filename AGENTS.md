# Arbeitsanweisungen für dieses Repository

## Ziel und Zusammenarbeit

Liquid Pixel soll ein Spiel nach dem Vorbild von Liquid War werden. Zuerst
sollen Simulation und Steuerung zuverlässig überprüfbar sein, danach werden
die bestehenden Bewegungsfehler in kleinen Schritten verbessert.

Die vereinbarte Reihenfolge ist:

1. Den Singleplayer stabil bekommen: Hindernisse malen und die Partikelwolke
   flüssig und sinnvoll über die Karte sowie um Hindernisse steuern können.
2. Danach gegnerische Schwärme und die Übernahme gegnerischer Partikel nach
   dem Vorbild von Liquid War konzipieren und zunächst lokal umsetzen.
3. Anschließend zwei Spieler über WebSocket synchronisieren.

Für Phase 1 gelten funktionale und qualitative Abnahmekriterien: Die Wolke
folgt zuverlässig der Maus und bleibt weder an Hindernissen bei vorhandenem
Weg noch am Spielfeldrand hängen. Es gibt vorerst keine Performancevorgaben.
Im freien Feld soll die Wolke rund statt rautenförmig sein. In der Animation
müssen individuelle Einheiten erkennbar bleiben; eine starre Verschiebung des
Gesamtblocks oder störende Streifen reichen als Ergebnis nicht aus.
Für Phase 2 dient eine bewegte Wolke, die eine statische gegnerische Wolke
sichtbar sinnvoll übernimmt, als einfaches Abnahmeszenario. In Phase 3 müssen
beide Spieler ihre Wolken steuern und gegenseitig Partikel übernehmen können.

Die Einzelheiten der späteren Phasen werden nach den Erfahrungen mit dem
stabilen Singleplayer ausgearbeitet.

- Mit dem Nutzer auf Deutsch kommunizieren.
- Vor Arbeiten die `README.md` und die priorisierte `TODO.md` lesen.
- Den jeweils beauftragten Schritt abschließen. Die TODO-Liste ist eine
  Planung, kein Auftrag, alle Punkte auf einmal umzusetzen.
- Kleine, nachvollziehbare Änderungen bevorzugen. Neue Spielfunktionen und
  größere Umbauten getrennt von Fehlerkorrekturen behandeln.
- Vorhandene, auch noch nicht commitete Änderungen erhalten.
- Nach Abschluss betroffene TODO-Punkte und Dokumentation aktualisieren.
- Bei Arbeiten an Wegfindung oder Partikelübernahme die Fundstellen und
  Erkenntnisse in `docs/liquid-war-reference.md` berücksichtigen. Beobachtungen
  im Originalcode und Vorschläge für unsere Implementierung unterscheiden.

## Aufbau und Konventionen

- Browser-Spiel mit p5.js; Einstieg über `index.html` und `Game.js`.
- `Environment.js`: Spielfeld, Aktualisierung, Distanzfeld und Hindernisse.
- Die Richtungsauswahl pro Team/Zelle wird in acht deterministischen Varianten
  wiederverwendet und bei neuen Wegfeldern verworfen; Belegung immer live prüfen.
- `Particle.js`, `Player.js`, `Cell.js`, `Obstacle.js`: Spielobjekte.
- Jeder Partikel hat `team` und `health`. `Environment.teams` hält getrennte
  Ziele und Distanzfelder. `env.player` ist weiterhin das Mausziel von Team 0;
  die öffentlichen Zellwerte `distance` und `potential` gehören zu Team 0.
- Kampfregeln und Nachweise stehen in `docs/capture-validation.md`.
  Besitzwechsel erhalten Partikel-ID und Rasterzelle. Die Kontaktaktion darf
  nicht mit jedem zusätzlichen Bewegungsteilversuch erneut ausgeführt werden.
  Die rote Wolke des Capture-Szenarios bleibt ortsfest, verwendet aber dieselben
  Kampfregeln wie Blau. Änderungen an Teamzugehörigkeit müssen sich in
  Darstellung, Teamzahlen und Harness-Zustand widerspiegeln.
- `Harness.js`: optionale Browsersteuerung über `window.gameHarness` bei
  einer URL mit `?debug&seed=123`.
- `/` ist die Online-Lobby; `/playground` bleibt der lokale Singleplayer.
  `?debug` öffnet ebenfalls den pausierten Singleplayer. `?online&debug` nutzt
  die echte Lobby mit lesbaren Online-Diagnosen; lokale Simulationsschritte
  oder Änderungen am Match über die Harness sind dort nicht erlaubt.
- `Determinism.js` und `MatchSimulation.js` definieren portable Rechenregeln,
  Match-Start und kanonische Zustandsberichte. Änderungen an spielentscheidenden
  Regeln müssen die gemeinsame Protokollversion berücksichtigen und auf
  Chromium, Firefox, WebKit und Node identische Zustände ergeben.
- `MatchTerrain.js` erzeugt vor dem Online-Spawn gespiegelt zufälliges Gelände
  aus dem Match-Seed. Startbereiche bleiben frei, alle freien Zellen müssen
  zusammenhängend bleiben. Änderungen am Generator erfordern dieselbe
  Protokoll- und Browserprüfung wie Änderungen an der Simulation.
- `Multiplayer.js` simuliert das gesamte Online-Match auf jedem Client.
  `scripts/multiplayer.cjs` verwaltet Lobby und verteilt nummerierte Eingaben;
  er soll keine laufende Partikelsimulation übernehmen. Details und Grenzen
  stehen in `docs/multiplayer-design.md`. Vorhandene Zustände bei abweichenden
  Prüfsummen nicht durch ungeprüfte Snapshots eines Clients ersetzen.
- `scripts/serve.cjs`: lokaler Server; `scripts/play.cjs`: reproduzierbarer
  Browserlauf mit echten Mausereignissen, Bildern und Zustandsdateien.
- `Renderer.js`: normale HiDPI-Darstellung mit zwischengespeicherten Effekten;
  Änderungen an der Optik hier umsetzen. Die Darstellung darf keine
  Partikelpositionen, Zufalls-Seeds oder Bewegungstakte verändern.
  Der Nutzer möchte die Leuchteffekte bei Performanceverbesserungen behalten;
  eine günstigere Umsetzung muss Leuchten und scharfe Partikelkerne erhalten.
- `__tests__/`: Jest-Tests; `browser-tests/`: Playwright-Tests.
- Das Raster wird als `map[y][x]` angesprochen. Positionswerte sind
  Spielkoordinaten; Mausereignisse im Browser müssen den Canvas-Offset beachten.
- Die Weltkoordinaten bleiben Pixelkoordinaten. Alle Punkte einer sichtbaren
  4×4-Kollisionsfläche teilen sich dieselbe `Cell`; `cell.x` und `cell.y` sind deren
  ausgerichtete linke obere Ecke. `env.cells` enthält jede Zelle genau einmal.
- Das Canvas wird per CSS responsiv skaliert und mit mindestens doppelter
  Pixeldichte gezeichnet. Pointer-Ereignisse deshalb über das tatsächliche
  Canvas-Rechteck auf Weltkoordinaten umrechnen; die gerundeten p5-Mauswerte
  sind hierfür nicht präzise genug. Die Teststeuerung berücksichtigt diese
  Skalierung ebenfalls. Alle vier Spielfeldecken müssen zugänglich bleiben.
- Die Modellklassen erhalten ihre `Environment` ausdrücklich. Sie lassen sich
  per CommonJS und `graphics: false` ohne p5-Stubs testen. Im Browser werden
  die Klassen über Skripte geladen; deren Reihenfolge in `index.html` beachten.
- Ein logisches `Environment.update()` enthält zwei `updateSubstep()`-Aufrufe.
  Die normale Darstellung zeigt diese Halbschritte getrennt. Die Harness
  verwendet dieselben Regeln und gibt bei einer Pause gegebenenfalls halbe
  logische Frames zurück.

## Fehler untersuchen und beheben

1. Das Problem mit einem kleinen Szenario reproduzieren. Seed, Eingaben,
   Hindernisse und Anzahl der Simulationsschritte festhalten.
2. Gewünschtes Verhalten mit einer aussagekräftigen Prüfung beschreiben.
   Bestehende passende Tests erweitern, statt nur Implementierungsdetails zu
   spiegeln. Bei Koordinatentests unterschiedliche x- und y-Werte verwenden.
3. Eine begrenzte Änderung umsetzen und passende Tests ausführen.
4. Bei Änderungen an Bewegung, Kollisionen oder Steuerung zusätzlich das echte
   Spiel im Browser bedienen und Zustand sowie Darstellung prüfen.
5. Ergebnis, ausgeführte Prüfungen und offene Einschränkungen kurz berichten.

Die Harness muss dieselbe Simulation und Darstellung wie das normale Spiel
verwenden. Keine vereinfachte Ersatzsimulation für den Agenten einführen.
Für Vergleiche feste Seeds und explizite Frames verwenden; keine Prüfungen
auf zufällig gewählte Wartezeiten oder exakt identische Screenshot-Dateien
stützen. JSON-Zustände liefern die messbaren Ergebnisse, Screenshots helfen
bei der Beurteilung des Bewegungsbildes.

Falls ein Test als `KNOWN BUG` beziehungsweise erwarteter Fehlschlag erfasst
ist, bedeutet eine grüne Testsuite nicht, dass dieser Fehler behoben ist. Wird ein
Fehler korrigiert, den entsprechenden `test.fail`-Marker und die Kennzeichnung
im Namen entfernen und den Verhaltenstest dauerhaft behalten. Assertions
nicht abschwächen, um eine Änderung durchzubekommen.

## Ausführen und Prüfen

Voraussetzungen: Node.js ab Version 22, npm sowie Playwright-Chromium,
Firefox und WebKit für die vollständigen Browserprüfungen. Vor dem
Einrichten prüfen, welche Werkzeuge und Abhängigkeiten bereits vorhanden
sind. Die vollständigen Startanweisungen stehen in der `README.md`.

```bash
npm ci
npx playwright install chromium firefox webkit
npm start                 # http://127.0.0.1:4173
npm test -- --runInBand    # Unit-Tests
npm run test:browser       # Browser-Tests
npm run test:all           # Beide Testsuiten
npm run play:agent         # Reproduzierbares Wandszenario
npm run play:preview       # Tatsächliche Animation als Video
npm run play:capture       # Laufende Gegnerübernahme mit Zustandsnachweisen
npm run play:multiplayer   # Zwei normale Sitzungen bis zum Sieg und zurück
```

Der Browserlauf schreibt nach `artifacts/agent-play/`; Playwright schreibt
nach `test-results/`; die Animation liegt in `artifacts/swarm-preview/`.
Tests verwenden Port 4174, das normale Spiel 4173. Generierte Artefakte und
`node_modules/` nicht committen.
Bekannte Fehler, erfolgreiche Prüfungen und nicht ausgeführte Prüfungen im
Ergebnis klar unterscheiden. Bei reinen Dokumentationsänderungen reicht eine
Prüfung von Inhalt, Links und Diff; dafür keine Spieltests neu ausführen.
